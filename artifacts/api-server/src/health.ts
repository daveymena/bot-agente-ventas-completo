import { Router } from "express";
import { logger } from "./lib/logger";

const router = Router();

// Health check endpoint
router.get("/health", (req, res) => {
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
});

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
