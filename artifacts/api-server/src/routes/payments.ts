import { Router, type IRouter } from "express";
import { z } from "zod";
import { 
  getPaymentSystemHealth,
  validateAllPaymentServices,
  getPaymentAnalytics,
  paymentHealthMonitor,
  type PaymentAnalytics
} from "../lib/payments";
import { type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { apiRateLimit } from "../middleware/rateLimiting";

const router: IRouter = Router();

// Apply rate limiting to payment routes
router.use(apiRateLimit);

// Validation schemas
const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional()
});

/**
 * Get payment system health status
 * GET /api/payments/health
 */
router.get("/health", async (req: TenantRequest, res) => {
  try {
    const systemHealth = getPaymentSystemHealth();
    
    // Add additional health metrics
    const healthSummary = {
      ...systemHealth,
      timestamp: new Date(),
      tenantId: req.tenant?.id,
      recommendations: generateHealthRecommendations(systemHealth),
      alerts: generateHealthAlerts(systemHealth)
    };

    logger.debug({
      tenantId: req.tenant?.id,
      overallHealth: systemHealth.overall,
      availableServices: systemHealth.availableServices
    }, "[Payments] Health status requested");

    return res.json(healthSummary);

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Payments] Failed to get health status");
    return res.status(500).json({ 
      error: "Failed to get payment system health" 
    });
  }
});

/**
 * Validate all payment services
 * GET /api/payments/validate
 */
router.get("/validate", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const validationResults = await validateAllPaymentServices(req.tenant);
    
    const validationSummary = {
      results: validationResults,
      summary: {
        totalServices: validationResults.length,
        validServices: validationResults.filter(r => r.isValid).length,
        overallStatus: validationResults.every(r => r.isValid) ? 'all_valid' :
                      validationResults.some(r => r.isValid) ? 'partially_valid' : 'none_valid',
        averageSuccess: validationResults.reduce((sum, r) => sum + r.estimatedSuccess, 0) / validationResults.length
      },
      timestamp: new Date(),
      tenantId: req.tenant.id
    };

    logger.info({
      tenantId: req.tenant.id,
      validServices: validationSummary.summary.validServices,
      totalServices: validationSummary.summary.totalServices,
      overallStatus: validationSummary.summary.overallStatus
    }, "[Payments] Service validation completed");

    return res.json(validationSummary);

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Payments] Failed to validate services");
    return res.status(500).json({ 
      error: "Failed to validate payment services" 
    });
  }
});

/**
 * Get payment analytics
 * GET /api/payments/analytics
 */
router.get("/analytics", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const query = dateRangeSchema.parse(req.query);
    
    const startDate = query.startDate ? new Date(query.startDate) : 
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    const analytics = await getPaymentAnalytics(startDate, endDate, req.tenant);
    
    // Enhanced analytics with insights
    const enhancedAnalytics = {
      ...analytics,
      insights: {
        performanceStatus: analytics.successRate >= 90 ? 'excellent' :
                          analytics.successRate >= 75 ? 'good' :
                          analytics.successRate >= 50 ? 'fair' : 'poor',
        mostPopularMethod: analytics.preferredMethods.length > 0 ? 
          analytics.preferredMethods.reduce((max, method) => 
            method.usage > max.usage ? method : max
          ).method : 'none',
        conversionTrend: analytics.successRate > 75 ? 'positive' : 
                        analytics.successRate > 50 ? 'stable' : 'negative',
        recommendations: generateAnalyticsRecommendations(analytics)
      },
      dateRange: { startDate, endDate },
      generatedAt: new Date(),
      tenantId: req.tenant.id
    };

    return res.json(enhancedAnalytics);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid date range", 
        details: error.errors 
      });
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Payments] Failed to get analytics");
    return res.status(500).json({ 
      error: "Failed to get payment analytics" 
    });
  }
});

/**
 * Get payment service details
 * GET /api/payments/services/:service
 */
router.get("/services/:service", async (req: TenantRequest, res) => {
  try {
    const service = Array.isArray(req.params.service) ? req.params.service[0] : req.params.service;
    
    if (!['mercadopago', 'paypal', 'nequi'].includes(service)) {
      return res.status(400).json({ 
        error: "Invalid service name" 
      });
    }

    const serviceHealth = paymentHealthMonitor.getServiceHealth(service);
    
    if (!serviceHealth) {
      return res.status(404).json({ 
        error: "Service health data not available" 
      });
    }

    // Get additional service-specific information
    const serviceDetails = {
      ...serviceHealth,
      configuration: getServiceConfiguration(service, req.tenant),
      capabilities: getServiceCapabilities(service),
      troubleshooting: getTroubleshootingTips(service, serviceHealth),
      lastUpdated: new Date()
    };

    return res.json(serviceDetails);

  } catch (error) {
    logger.error({ error, service: req.params.service }, "[Payments] Failed to get service details");
    return res.status(500).json({ 
      error: "Failed to get service details" 
    });
  }
});

/**
 * Force health check for all services
 * POST /api/payments/health/refresh
 */
router.post("/health/refresh", async (req: TenantRequest, res) => {
  try {
    // Trigger immediate health check
    await paymentHealthMonitor.checkAllServices();
    
    const updatedHealth = getPaymentSystemHealth();
    
    logger.info({
      tenantId: req.tenant?.id,
      triggeredBy: req.ip,
      overallHealth: updatedHealth.overall
    }, "[Payments] Manual health check triggered");

    return res.json({
      message: "Health check completed",
      health: updatedHealth,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Payments] Failed to refresh health status");
    return res.status(500).json({ 
      error: "Failed to refresh health status" 
    });
  }
});

/**
 * Get payment optimization suggestions
 * GET /api/payments/optimization
 */
router.get("/optimization", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const systemHealth = getPaymentSystemHealth();
    const validationResults = await validateAllPaymentServices(req.tenant);
    
    const suggestions = generateOptimizationSuggestions(systemHealth, validationResults);
    
    return res.json({
      suggestions,
      systemHealth: systemHealth.overall,
      validServices: validationResults.filter(r => r.isValid).length,
      totalServices: validationResults.length,
      generatedAt: new Date(),
      tenantId: req.tenant.id
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Payments] Failed to get optimization suggestions");
    return res.status(500).json({ 
      error: "Failed to get optimization suggestions" 
    });
  }
});

// Helper functions
function generateHealthRecommendations(systemHealth: any): string[] {
  const recommendations: string[] = [];

  if (systemHealth.overall === 'down') {
    recommendations.push("CRITICAL: All payment services are down. Check network connectivity and service credentials.");
  } else if (systemHealth.overall === 'degraded') {
    recommendations.push("Some payment services are experiencing issues. Monitor closely and consider using alternative methods.");
  }

  systemHealth.services.forEach((service: any) => {
    if (service.status === 'down') {
      recommendations.push(`${service.service} is down. Check API credentials and service status.`);
    } else if (service.status === 'degraded') {
      recommendations.push(`${service.service} is experiencing issues. Monitor response times.`);
    } else if (service.responseTime > 5000) {
      recommendations.push(`${service.service} has slow response times. Consider optimization.`);
    }
  });

  return recommendations;
}

function generateHealthAlerts(systemHealth: any): Array<{
  level: 'info' | 'warning' | 'error';
  message: string;
  service?: string;
}> {
  const alerts: Array<{
    level: 'info' | 'warning' | 'error';
    message: string;
    service?: string;
  }> = [];

  systemHealth.services.forEach((service: any) => {
    if (service.status === 'down') {
      alerts.push({
        level: 'error',
        message: `${service.service} service is completely unavailable`,
        service: service.service
      });
    } else if (service.status === 'degraded') {
      alerts.push({
        level: 'warning',
        message: `${service.service} service is experiencing performance issues`,
        service: service.service
      });
    } else if (service.responseTime > 3000) {
      alerts.push({
        level: 'warning',
        message: `${service.service} has elevated response times (${service.responseTime}ms)`,
        service: service.service
      });
    }
  });

  return alerts;
}

function generateAnalyticsRecommendations(analytics: PaymentAnalytics): string[] {
  const recommendations: string[] = [];

  if (analytics.successRate < 50) {
    recommendations.push("Low success rate detected. Review payment flow and user experience.");
  }

  if (analytics.preferredMethods.length > 0) {
    const leastUsed = analytics.preferredMethods.reduce((min, method) => 
      method.usage < min.usage ? method : min
    );
    
    if (leastUsed.usage < analytics.totalTransactions * 0.1) {
      recommendations.push(`${leastUsed.method} is underutilized. Consider promoting or removing it.`);
    }
  }

  if (analytics.failedTransactions > analytics.successfulTransactions * 0.5) {
    recommendations.push("High failure rate. Investigate common failure points and improve error handling.");
  }

  return recommendations;
}

function getServiceConfiguration(service: string, tenant: any): any {
  const config: any = {
    configured: false,
    features: []
  };

  if (tenant?.paymentMethods) {
    switch (service) {
      case 'mercadopago':
        config.configured = !!tenant.paymentMethods.mercadopago?.enabled;
        config.features = ['Credit Cards', 'Debit Cards', 'PSE', 'Bank Transfer'];
        break;
      case 'paypal':
        config.configured = !!tenant.paymentMethods.paypal?.enabled;
        config.features = ['PayPal Balance', 'Credit Cards', 'Bank Transfer'];
        config.mode = tenant.paymentMethods.paypal?.mode || 'live';
        break;
      case 'nequi':
        config.configured = !!tenant.paymentMethods.transfer?.enabled;
        config.features = ['Nequi Transfer', 'Daviplata Transfer', 'Bank Transfer'];
        break;
    }
  }

  return config;
}

function getServiceCapabilities(service: string): string[] {
  const capabilities: Record<string, string[]> = {
    mercadopago: ['Instant payments', 'Refunds', 'Webhooks', 'Multiple currencies'],
    paypal: ['Global payments', 'Buyer protection', 'Recurring payments', 'Mobile optimized'],
    nequi: ['Local transfers', 'Instant confirmation', 'Low fees', 'High availability']
  };

  return capabilities[service] || [];
}

function getTroubleshootingTips(service: string, health: any): string[] {
  const tips: string[] = [];

  if (health.status === 'down') {
    switch (service) {
      case 'mercadopago':
        tips.push('Verify MercadoPago access token is valid and not expired');
        tips.push('Check if MercadoPago API is experiencing outages');
        tips.push('Ensure network connectivity to api.mercadopago.com');
        break;
      case 'paypal':
        tips.push('Verify PayPal client ID and secret are correct');
        tips.push('Check if using correct PayPal environment (sandbox vs live)');
        tips.push('Ensure network connectivity to api-m.paypal.com');
        break;
      case 'nequi':
        tips.push('Nequi transfers are manual - ensure account details are correct');
        tips.push('Verify transfer account number and name are up to date');
        break;
    }
  } else if (health.responseTime > 5000) {
    tips.push('Consider implementing request timeouts');
    tips.push('Monitor network latency to payment provider');
    tips.push('Implement caching for non-critical requests');
  }

  return tips;
}

function generateOptimizationSuggestions(systemHealth: any, validationResults: any[]): Array<{
  category: string;
  suggestion: string;
  priority: 'low' | 'medium' | 'high';
  impact: string;
}> {
  const suggestions: Array<{
    category: string;
    suggestion: string;
    priority: 'low' | 'medium' | 'high';
    impact: string;
  }> = [];

  // Health-based suggestions
  if (systemHealth.overall === 'degraded') {
    suggestions.push({
      category: 'Reliability',
      suggestion: 'Implement automatic failover to backup payment methods',
      priority: 'high',
      impact: 'Reduces payment failures and improves user experience'
    });
  }

  // Validation-based suggestions
  const invalidServices = validationResults.filter(r => !r.isValid);
  if (invalidServices.length > 0) {
    suggestions.push({
      category: 'Configuration',
      suggestion: `Fix configuration for ${invalidServices.map(s => s.service).join(', ')}`,
      priority: 'high',
      impact: 'Increases available payment options for customers'
    });
  }

  // Performance suggestions
  const slowServices = systemHealth.services.filter((s: any) => s.responseTime > 3000);
  if (slowServices.length > 0) {
    suggestions.push({
      category: 'Performance',
      suggestion: 'Optimize slow payment services or implement caching',
      priority: 'medium',
      impact: 'Improves checkout experience and reduces abandonment'
    });
  }

  // General optimization
  suggestions.push({
    category: 'User Experience',
    suggestion: 'Implement payment method recommendation based on user location',
    priority: 'low',
    impact: 'Increases conversion by showing preferred local payment methods first'
  });

  return suggestions;
}

export default router;