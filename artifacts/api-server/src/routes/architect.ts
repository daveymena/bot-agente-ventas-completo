/**
 * ============================================================
 * ARCHITECT IA - API ROUTES
 * ============================================================
 * Expone todas las capacidades del Architect IA:
 * - Memory (aprendizaje)
 * - Predictor (predicciones ML)
 * - Reasoner (análisis multi-ángulo)
 * - Optimizer (optimización automática)
 * - Multichannel (campañas coordinadas)
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { architectAI } from "../lib/architect-ai-core";
import { securityShield } from "../lib/security-shield";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Middleware de seguridad - Validar acceso
 */
router.use(async (req: Request, res: Response, next: NextFunction) => {
  const userRole = (req as any).userRole || "user";
  const validation = await securityShield.validateRequest(req, userRole);

  if (!validation.allowed) {
    logger.warn(
      { path: req.path, role: userRole },
      "🚫 Acceso denegado a ruta del Architect IA"
    );
    return res.status(403).json({
      error: validation.reason || "Acceso denegado",
    });
  }

  next();
});

/**
 * GET /api/architect/status
 * Obtener estado del Architect IA
 */
router.get("/status", (req: Request, res: Response) => {
  try {
    const status = architectAI.getStatus();
    securityShield.safeLog("Architect IA status check", { userRole: (req as any).userRole });
    res.json({ ok: true, status });
  } catch (error) {
    logger.error({ error }, "❌ Error getting Architect status");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/analyze
 * Análisis completo con todas las 5 capas
 */
router.post("/analyze", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, productId, customerId, conversationId } = req.body;

    if (!tenantId || !productId) {
      return res.status(400).json({
        error: "tenantId y productId son requeridos",
      });
    }

    const result = await architectAI.analyzeAndOptimize({
      tenantId,
      productId,
      customerId,
      conversationId,
    });

    securityShield.safeLog("Architect IA full analysis", {
      productId,
      customerId,
    });

    res.json({
      ok: true,
      analysis: result,
    });
  } catch (error) {
    logger.error({ error }, "❌ Analyze error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/predict
 * Predicciones ML (próxima compra, churn, timing)
 */
router.post("/predict", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, customerId } = req.body;

    if (!tenantId || !customerId) {
      return res.status(400).json({
        error: "tenantId y customerId son requeridos",
      });
    }

    const [purchase, churn, timing] = await Promise.all([
      architectAI.predictor.predictNextPurchase(tenantId, customerId),
      architectAI.predictor.predictChurnRisk(tenantId, customerId),
      architectAI.predictor.predictBestContactTime(tenantId, customerId),
    ]);

    securityShield.safeLog("Predictor analysis", { customerId });

    res.json({
      ok: true,
      predictions: {
        purchase,
        churn,
        bestContactTime: timing,
      },
    });
  } catch (error) {
    logger.error({ error }, "❌ Predict error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/optimize
 * Optimizaciones automáticas (precios, copy, checkout)
 */
router.post("/optimize", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, type = "full" } = req.body;

    if (!productId) {
      return res.status(400).json({
        error: "productId es requerido",
      });
    }

    let result;

    switch (type) {
      case "pricing":
        result = await architectAI.optimizer.optimizePricing(productId);
        break;
      case "copy":
        result = await architectAI.optimizer.optimizeCopy(productId);
        break;
      case "checkout":
        result = await architectAI.optimizer.optimizeCheckoutFlow();
        break;
      case "timing":
        result = await architectAI.optimizer.optimizeContactTiming();
        break;
      case "full":
      default:
        result = await architectAI.optimizer.fullProductOptimization(productId);
    }

    securityShield.safeLog("Optimizer action", { productId, type });

    res.json({
      ok: true,
      optimization: result,
    });
  } catch (error) {
    logger.error({ error }, "❌ Optimize error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/reason
 * Análisis multi-ángulo (CEO, Sales, Design, Data)
 */
router.post("/reason", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { situation, data, constraints, goals } = req.body;

    if (!situation) {
      return res.status(400).json({
        error: "situation es requerido",
      });
    }

    const reasoning = await architectAI.reasoner.reason({
      situation,
      data: data || {},
      constraints: constraints || [],
      goals: goals || [],
    });

    securityShield.safeLog("Reasoner analysis", { situation });

    res.json({
      ok: true,
      reasoning,
    });
  } catch (error) {
    logger.error({ error }, "❌ Reason error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/multichannel
 * Estrategia de campañas multi-canal coordinadas
 */
router.post("/multichannel", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productName, productId, tenantId, targetAudience, budget } = req.body;

    if (!productName || !productId || !tenantId) {
      return res.status(400).json({
        error: "productName, productId y tenantId son requeridos",
      });
    }

    const strategy = await architectAI.multichannel.createMultichannelStrategy({
      productName,
      productId,
      tenantId,
      targetAudience: targetAudience || "General",
      budget: budget || 500,
    });

    securityShield.safeLog("Multichannel strategy", { productId });

    res.json({
      ok: true,
      strategy,
    });
  } catch (error) {
    logger.error({ error }, "❌ Multichannel error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/memory
 * Guardar lecciones aprendidas
 */
router.post("/memory", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, lesson, description, tags = [], metadata = {} } = req.body;

    if (!type || !lesson || !description) {
      return res.status(400).json({
        error: "type, lesson y description son requeridos",
      });
    }

    const result = await architectAI.memory.recordLearning(
      (req as any).tenant?.id || 1,
      type,
      lesson,
      description,
      tags,
      metadata
    );

    securityShield.safeLog("Memory recorded", { type, lesson });

    res.json({
      ok: true,
      memory: result,
    });
  } catch (error) {
    logger.error({ error }, "❌ Memory record error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * GET /api/architect/memory/search
 * Buscar lecciones almacenadas
 */
router.get("/memory/search", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        error: "query parameter es requerido",
      });
    }

    const results = await architectAI.memory.retrieveRelevantMemories(
      (req as any).tenant?.id || 1,
      String(query)
    );

    securityShield.safeLog("Memory search", { query });

    res.json({
      ok: true,
      results,
      total: results.length,
    });
  } catch (error) {
    logger.error({ error }, "❌ Memory search error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/improve-sales
 * Caso de uso: Mejorar conversión en venta actual
 */
router.post("/improve-sales", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, conversationId, customerId, lastMessage } = req.body;

    if (!tenantId || !conversationId || !customerId) {
      return res.status(400).json({
        error: "tenantId, conversationId y customerId son requeridos",
      });
    }

    const recommendation = await architectAI.improveSalesConversation({
      tenantId,
      conversationId,
      customerId,
      lastMessage: lastMessage || "",
    });

    securityShield.safeLog("Sales improvement", { conversationId, customerId });

    res.json({
      ok: true,
      recommendation,
    });
  } catch (error) {
    logger.error({ error }, "❌ Sales improvement error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * POST /api/architect/maximize-revenue
 * Caso de uso: Maximizar ingresos
 */
router.post("/maximize-revenue", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tenantId, productId, currentMetrics } = req.body;

    if (!tenantId || !productId || !currentMetrics) {
      return res.status(400).json({
        error: "tenantId, productId y currentMetrics son requeridos",
      });
    }

    const result = await architectAI.maximizeRevenue({
      tenantId,
      productId,
      currentMetrics,
    });

    securityShield.safeLog("Revenue maximization", { productId });

    res.json({
      ok: true,
      result,
    });
  } catch (error) {
    logger.error({ error }, "❌ Revenue maximization error");
    const sanitized = securityShield.sanitizeError(error);
    res.status(500).json(sanitized);
  }
});

/**
 * GET /api/architect/health
 * Health check del Architect IA
 */
router.get("/health", (req: Request, res: Response) => {
  res.json({
    ok: true,
    architect: "operational",
    timestamp: new Date().toISOString(),
  });
});

export default router;
