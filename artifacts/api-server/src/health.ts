import { Router } from "express";
import { logger } from "./lib/logger";

const router = Router();

// Health check endpoint. Se registra en /health y /healthz (alias) para
// tolerar ambas convenciones de sonda de salud (Docker/Easypanel/K8s).
const healthHandler = (req: any, res: any) => {
  try {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
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
