import { Router } from "express";
import { logger } from "./lib/logger";

const router = Router();

// Health check endpoint. Se registra en /health y /healthz (alias) para
// tolerar ambas convenciones de sonda de salud (Docker/Easypanel/K8s).
//
// IMPORTANTE: este endpoint antes devolvia siempre status:"ok" sin verificar
// nada real (ni base de datos, ni WhatsApp). Eso hacia que EasyPanel, y
// cualquier monitor externo, creyera que todo estaba bien aunque el bot
// estuviera roto. Ahora el status refleja el estado real: si WhatsApp esta
// desconectado o hay un error reciente del orquestador, se marca "degraded"
// con status code 503 en vez de mentir con 200.
const healthHandler = async (req: any, res: any) => {
  try {
    // Estado de WhatsApp en el health, sin exponer el numero.
    let whatsapp: { conectado: boolean; estado: string } | null = null;
    try {
      const { getWhatsAppForTenant } = require("./lib/whatsapp-factory");
      const s = getWhatsAppForTenant(1)?.getStatus?.();
      whatsapp = { conectado: s?.state === "connected", estado: String(s?.state || "desconocido") };
    } catch {
      /* si no se puede leer, se omite: no bloquea el health, pero degrada abajo */
    }

    // Estado de la cola de mensajes y ultimo error real del orquestador.
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

    // Verificacion real de base de datos: sin esto no se puede saber si el
    // servicio esta realmente operativo o solo el proceso Node sigue vivo.
    let dbOk = false;
    let dbError: string | null = null;
    try {
      const { pool, isDbReady } = require("../../../lib/db/src/index");
      if (pool && typeof pool.query === "function") {
        await pool.query("SELECT 1");
        dbOk = true;
      } else if (typeof isDbReady === "function") {
        dbOk = !!isDbReady();
      }
    } catch (e: any) {
      dbOk = false;
      dbError = String(e?.message || e);
    }

    // Que build esta corriendo (fecha del archivo compilado).
    let build: string | null = null;
    try {
      build = require("node:fs").statSync(__filename).mtime.toISOString();
    } catch {
      /* el health nunca puede fallar por esto */
    }

    // El status real ya no es siempre "ok": se degrada si la base de datos
    // no responde o si WhatsApp esta desconectado, que es cuando se pierden
    // ventas en silencio.
    const problemas: string[] = [];
    if (!dbOk) problemas.push("database");
    if (whatsapp && !whatsapp.conectado) problemas.push("whatsapp");

    const status = problemas.length === 0 ? "ok" : "degraded";
    const statusCode = !dbOk ? 503 : problemas.length > 0 ? 200 : 200;

    res.status(statusCode).json({
      status,
      problemas: problemas.length ? problemas : undefined,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(build ? { build } : {}),
      database: { ok: dbOk, ...(dbError ? { error: dbError } : {}) },
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

// Ready check endpoint: verifica dependencias reales (base de datos).
// Antes respondia "ready" siempre, sin comprobar nada -- el comentario
// original literalmente decia "Aqui puedes agregar verificaciones de
// dependencias" y nunca se implemento. Ahora si falla la base, responde
// 503 para que Easypanel/K8s no enrute trafico a una instancia rota.
router.get("/ready", async (req, res) => {
  try {
    const { pool, isDbReady } = require("../../../lib/db/src/index");
    let dbOk = false;
    if (pool && typeof pool.query === "function") {
      await pool.query("SELECT 1");
      dbOk = true;
    } else if (typeof isDbReady === "function") {
      dbOk = !!isDbReady();
    }

    if (!dbOk) {
      return res.status(503).json({
        status: "not_ready",
        reason: "database",
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Ready check failed");
    res.status(503).json({ status: "not_ready", reason: "exception" });
  }
});

export default router;
