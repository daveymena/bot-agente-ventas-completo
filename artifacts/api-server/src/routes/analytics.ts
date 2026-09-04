import { Router, type IRouter } from "express";
import { z } from "zod";
import { 
  generateAnalyticsDashboard,
  trackConversionEvent,
  trackUserBehavior,
  getRealTimeAnalytics,
  analyticsEngine
} from "../lib/analytics";
import { type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { apiRateLimit } from "../middleware/rateLimiting";
import { sendError } from "../lib/error-handler";
import { ERROR_CODES } from "../lib/error-codes";

const router: IRouter = Router();

// Apply rate limiting to analytics routes
router.use(apiRateLimit);

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

const conversionTrackingSchema = z.object({
  conversationId: z.number().int().positive(),
  productId: z.number().int().positive(),
  amount: z.number().positive()
});

const behaviorTrackingSchema = z.object({
  conversationId: z.number().int().positive(),
  eventType: z.string().min(1),
  eventData: z.record(z.any())
});

/**
 * Get comprehensive analytics dashboard
 * GET /api/analytics/dashboard
 */
router.get("/dashboard", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const query = dateRangeSchema.parse(req.query);
    
    const startDate = query.startDate ? new Date(query.startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Validar rango de fechas
    if (startDate >= endDate) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATE_RANGE, 400);
    }

    const dashboard = await generateAnalyticsDashboard(req.tenant, startDate, endDate);

    logger.info({
      tenantId: req.tenant.id,
      dateRange: { startDate, endDate },
      metricsGenerated: {
        totalLeads: dashboard.conversionMetrics.totalLeads,
        conversions: dashboard.conversionMetrics.conversions,
        totalMessages: dashboard.performanceMetrics.messageVolume.total
      }
    }, "[Analytics] Dashboard generated");

    return res.json(dashboard);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to generate dashboard");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Get real-time metrics
 * GET /api/analytics/realtime
 */
router.get("/realtime", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const realTimeMetrics = await getRealTimeAnalytics(req.tenant);

    return res.json({
      ...realTimeMetrics,
      timestamp: new Date(),
      tenantId: req.tenant.id
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to get real-time metrics");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Get conversion funnel analysis
 * GET /api/analytics/funnel
 */
router.get("/funnel", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const query = dateRangeSchema.parse(req.query);
    
    const startDate = query.startDate ? new Date(query.startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Validar rango de fechas
    if (startDate >= endDate) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATE_RANGE, 400);
    }

    const engine = new (await import("../lib/analytics")).AnalyticsEngine(req.tenant);
    const conversionMetrics = await engine.getConversionMetrics(startDate, endDate);

    // Enhanced funnel analysis
    const funnelAnalysis = {
      ...conversionMetrics,
      insights: {
        biggestDropoff: conversionMetrics.funnel.reduce((max, stage) => 
          stage.dropoffRate > max.dropoffRate ? stage : max
        ),
        conversionBottleneck: conversionMetrics.funnel.find(stage => 
          stage.dropoffRate > 50
        ),
        optimizationOpportunities: conversionMetrics.funnel
          .filter(stage => stage.dropoffRate > 30)
          .map(stage => ({
            stage: stage.stage,
            dropoffRate: stage.dropoffRate,
            recommendation: getOptimizationRecommendation(stage.stage, stage.dropoffRate)
          }))
      }
    };

    return res.json(funnelAnalysis);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to get funnel analysis");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Get performance metrics
 * GET /api/analytics/performance
 */
router.get("/performance", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const query = dateRangeSchema.parse(req.query);
    
    const startDate = query.startDate ? new Date(query.startDate) : 
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Validar rango de fechas
    if (startDate >= endDate) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATE_RANGE, 400);
    }

    const engine = new (await import("../lib/analytics")).AnalyticsEngine(req.tenant);
    const performanceMetrics = await engine.getPerformanceMetrics(startDate, endDate);

    // Add performance insights
    const performanceAnalysis = {
      ...performanceMetrics,
      insights: {
        responseTimeStatus: performanceMetrics.averageResponseTime < 2000 ? 'excellent' : 
                           performanceMetrics.averageResponseTime < 5000 ? 'good' : 'needs_improvement',
        peakTrafficHour: performanceMetrics.peakHours[0]?.hour || 14,
        systemHealthScore: calculateSystemHealthScore(performanceMetrics),
        recommendations: generatePerformanceRecommendations(performanceMetrics)
      }
    };

    return res.json(performanceAnalysis);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to get performance metrics");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Get behavioral analytics
 * GET /api/analytics/behavior
 */
router.get("/behavior", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const query = dateRangeSchema.parse(req.query);
    
    const startDate = query.startDate ? new Date(query.startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    // Validar rango de fechas
    if (startDate >= endDate) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATE_RANGE, 400);
    }

    const engine = new (await import("../lib/analytics")).AnalyticsEngine(req.tenant);
    const behavioralAnalytics = await engine.getBehavioralAnalytics(startDate, endDate);

    // Add behavioral insights
    const behaviorAnalysis = {
      ...behavioralAnalytics,
      insights: {
        engagementLevel: behavioralAnalytics.userEngagement.messagesPerSession > 5 ? 'high' : 
                        behavioralAnalytics.userEngagement.messagesPerSession > 2 ? 'medium' : 'low',
        topPerformingProduct: behavioralAnalytics.popularProducts[0]?.productName || 'None',
        mainDropoffReason: behavioralAnalytics.dropoffPoints[0]?.commonReasons[0] || 'Unknown',
        customerSatisfactionIndicators: {
          sessionDuration: behavioralAnalytics.userEngagement.averageSessionDuration,
          returnRate: behavioralAnalytics.userEngagement.returnUserRate,
          engagementScore: calculateEngagementScore(behavioralAnalytics.userEngagement)
        }
      }
    };

    return res.json(behaviorAnalysis);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to get behavioral analytics");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Track conversion event
 * POST /api/analytics/track/conversion
 */
router.post("/track/conversion", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const validatedData = conversionTrackingSchema.parse(req.body);

    await trackConversionEvent(
      validatedData.conversationId,
      validatedData.productId,
      validatedData.amount,
      req.tenant
    );

    logger.info({
      tenantId: req.tenant.id,
      conversationId: validatedData.conversationId,
      productId: validatedData.productId,
      amount: validatedData.amount
    }, "[Analytics] Conversion event tracked");

    return res.json({
      message: "Conversion tracked successfully",
      timestamp: new Date()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to track conversion");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Track user behavior event
 * POST /api/analytics/track/behavior
 */
router.post("/track/behavior", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const validatedData = behaviorTrackingSchema.parse(req.body);

    await trackUserBehavior(
      validatedData.conversationId,
      validatedData.eventType,
      validatedData.eventData,
      req.tenant
    );

    logger.debug({
      tenantId: req.tenant.id,
      conversationId: validatedData.conversationId,
      eventType: validatedData.eventType
    }, "[Analytics] Behavior event tracked");

    return res.json({
      message: "Behavior event tracked successfully",
      timestamp: new Date()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, ERROR_CODES.VALIDATION_INVALID_DATA, 400);
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to track behavior");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

/**
 * Get system health status
 * GET /api/analytics/health
 */
/**
 * GET /api/analytics/salud-ia — por qué el bot está contestando raro.
 *
 * La pregunta que el admin hace de verdad, respondida en castellano y sin
 * abrir logs -- que además en este EasyPanel no son accesibles por API.
 *
 * Existe porque todo lo que se rompió el 2026-08-29 lo hizo EN SILENCIO:
 * modelos dados de baja, un filtro anulado por un spread, Advantage+ apagado,
 * el bot cayendo al modelo chico. Ninguno devolvió un error; todos devolvieron
 * una respuesta peor. Esto convierte "anda raro" en "hace 40 minutos que
 * contesta el respaldo porque Groq está apartado".
 */
router.get("/salud-ia", async (_req: TenantRequest, res) => {
  const { saludDeLaCadena } = await import("../lib/monitoring");
  return res.json(saludDeLaCadena());
});

router.get("/health", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return sendError(res, ERROR_CODES.UNAUTHORIZED, 401);
    }

    const engine = new (await import("../lib/analytics")).AnalyticsEngine(req.tenant);
    const systemHealth = await engine.getSystemHealthMetrics();

    // Calculate overall health score
    const healthScore = calculateOverallHealthScore(systemHealth);
    
    const healthStatus = {
      ...systemHealth,
      overallHealth: {
        score: healthScore,
        status: healthScore >= 90 ? 'excellent' : 
                healthScore >= 75 ? 'good' : 
                healthScore >= 50 ? 'fair' : 'poor',
        timestamp: new Date()
      },
      alerts: generateHealthAlerts(systemHealth)
    };

    return res.json(healthStatus);

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Analytics] Failed to get system health");
    return sendError(res, ERROR_CODES.INTERNAL_SERVER_ERROR, 500);
  }
});

// Helper functions
function getOptimizationRecommendation(stage: string, dropoffRate: number): string {
  const recommendations: Record<string, string> = {
    'New Leads': 'Improve initial engagement with better greeting messages',
    'Engaged': 'Enhance product presentation and value proposition',
    'Interested': 'Address common objections and provide social proof',
    'Qualified': 'Streamline the qualification process',
    'Negotiating': 'Improve objection handling and pricing strategies',
    'Closing': 'Simplify payment process and reduce friction',
    'Converted': 'Focus on upselling and retention'
  };

  return recommendations[stage] || 'Analyze user feedback and optimize messaging';
}

function calculateSystemHealthScore(performanceMetrics: any): number {
  const responseTimeScore = performanceMetrics.averageResponseTime < 2000 ? 100 : 
                           performanceMetrics.averageResponseTime < 5000 ? 75 : 50;
  const uptimeScore = performanceMetrics.systemUptime;
  const errorRateScore = Math.max(0, 100 - (performanceMetrics.errorRate * 20));

  return Math.round((responseTimeScore + uptimeScore + errorRateScore) / 3);
}

function generatePerformanceRecommendations(metrics: any): string[] {
  const recommendations: string[] = [];

  if (metrics.averageResponseTime > 3000) {
    recommendations.push("Optimize AI response time by implementing caching");
  }

  if (metrics.errorRate > 2) {
    recommendations.push("Investigate and reduce error rate");
  }

  if (metrics.systemUptime < 99) {
    recommendations.push("Improve system reliability and monitoring");
  }

  return recommendations;
}

function calculateEngagementScore(engagement: any): number {
  const durationScore = Math.min(100, engagement.averageSessionDuration * 2);
  const messageScore = Math.min(100, engagement.messagesPerSession * 10);
  const returnScore = engagement.returnUserRate;

  return Math.round((durationScore + messageScore + returnScore) / 3);
}

function calculateOverallHealthScore(systemHealth: any): number {
  const aiHealthScore = systemHealth.aiProviderHealth.reduce((avg: number, provider: any) => 
    avg + (provider.status === 'healthy' ? 100 : provider.status === 'degraded' ? 50 : 0), 0
  ) / systemHealth.aiProviderHealth.length;

  const whatsappScore = systemHealth.whatsappHealth.status === 'connected' ? 100 : 0;
  const dbScore = systemHealth.databaseHealth.status === 'healthy' ? 100 : 50;

  return Math.round((aiHealthScore + whatsappScore + dbScore) / 3);
}

function generateHealthAlerts(systemHealth: any): string[] {
  const alerts: string[] = [];

  systemHealth.aiProviderHealth.forEach((provider: any) => {
    if (provider.status !== 'healthy') {
      alerts.push(`AI Provider ${provider.provider} is ${provider.status}`);
    }
  });

  if (systemHealth.whatsappHealth.status !== 'connected') {
    alerts.push('WhatsApp connection is down');
  }

  if (systemHealth.databaseHealth.status !== 'healthy') {
    alerts.push('Database performance is degraded');
  }

  return alerts;
}

export default router;