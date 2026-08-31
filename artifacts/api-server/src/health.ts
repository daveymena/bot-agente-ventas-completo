import { Router } from "express";
import { logger } from "./lib/logger";

const router = Router();

// Health check endpoint. Se registra en /health y /healthz (alias) para
// tolerar ambas convenciones de sonda de salud (Docker/Easypanel/K8s).
const healthHandler = (req: any, res: any) => {
  try {
    // Estado de WhatsApp en el health, sin exponer el número.
    //
    // Un mensaje de un cliente quedó sin responder y desde afuera no había
    // NINGUNA forma de saber si el bot estaba conectado: el estado detallado
    // vive detrás de sesión, así que para diagnosticar "por qué no contesta"
    // había que entrar al panel. Un dato booleano no filtra nada y convierte
    // ese diagnóstico en una sola consulta -- también para una sonda externa
    // que avise cuando el bot se cae, que es cuando se pierden ventas.
    let whatsapp: { conectado: boolean; estado: string } | null = null;
    try {
      const { getWhatsAppForTenant } = require("./lib/whatsapp-factory");
      const s = getWhatsAppForTenant(1)?.getStatus?.();
      whatsapp = { conectado: s?.state === "connected", estado: String(s?.state || "desconocido") };
    } catch {
      /* si no se puede leer, se omite: el health nunca puede fallar por esto */
    }

    // Estado de la cola de mensajes. Son conteos, no contenido: no filtra
    // nada de ningún cliente. Sin esto, "el bot no contestó" es imposible de
    // diagnosticar desde afuera -- no se sabe si el mensaje llegó a la cola,
    // si está esperando, o si falló los reintentos y se descartó.
    let cola: any = null;
    let ultimoError: any = null;
    try {
      const { getMessageQueue } = require("./lib/message-queue");
      cola = getMessageQueue()?.getStats?.() || null;
      const { AgentOrchestrator } = require("./lib/services/agent-orchestrator");
      ultimoError = AgentOrchestrator?.ultimoError || null;
    } catch {
      /* el health nunca puede fallar por esto */
    }

    // ── QUÉ BUILD ESTÁ CORRIENDO ──────────────────────────────────────────
    //
    // El 2026-08-31 se perdieron horas por no poder responder esta pregunta.
    // Se arregló un fallo, se subió, el bot siguió contestando "problemas
    // técnicos", y no había forma de saber si el arreglo estaba arriba o no:
    // `uptime` solo dice cuándo arrancó el proceso, y un reinicio cualquiera
    // --una caída, un ajuste de entorno-- lo pone a cero igual que un
    // despliegue. Sin distinguirlos, "ya se desplegó" es una suposición.
    //
    // La fecha del archivo compilado sí lo distingue: dentro del contenedor es
    // el momento en que se armó la imagen. Si no cambia entre dos consultas,
    // el código es el mismo por más que el proceso se haya reiniciado.
    let build: string | null = null;
    try {
      build = require("node:fs").statSync(__filename).mtime.toISOString();
    } catch {
      /* el health nunca puede fallar por esto */
    }

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(build ? { build } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      ...(cola ? { cola } : {}),
      ...(ultimoError ? { ultimoError } : {}),
    });
  } catch (error) {
    logger.error({ error }, "Health check failed");
    res.status(503).json({ status: "error" });
  }
};

router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

// Ready check endpoint
router.get("/ready", (req, res) => {
  try {
    // Aquí puedes agregar verificaciones de dependencias
    // Por ejemplo: verificar conexión a BD, servicios externos, etc.
    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Ready check failed");
    res.status(503).json({ status: "not_ready" });
  }
});

export default router;
