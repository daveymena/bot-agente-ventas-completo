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

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(whatsapp ? { whatsapp } : {}),
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
