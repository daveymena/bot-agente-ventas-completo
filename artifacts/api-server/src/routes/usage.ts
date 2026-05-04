import { Router, type IRouter } from "express";
import { z } from "zod";
import { 
  getUsageAnalytics, 
  resetTenantUsage,
  rateLimitingMiddleware,
  type UsageMetrics 
} from "../middleware/rateLimiting";
import { tenantManager, type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Validation schemas
const resetUsageSchema = z.object({
  confirm: z.literal(true, { 
    errorMap: () => ({ message: "Must confirm reset by setting confirm: true" }) 
  })
});

/**
 * Get current tenant usage statistics
 * GET /api/usage/current
 */
router.get("/current", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const usage = getUsageAnalytics(req.tenant.id.toString());
    const tenantLimits = await tenantManager.checkTenantLimits(req.tenant.id);

    // Calculate usage percentages
    const usagePercentages = usage ? {
      requests: (usage.requests / req.tenant.limits.maxMonthlyMessages) * 100,
      aiCalls: (usage.aiCalls / (req.tenant.limits.apiCallsPerMinute * 60 * 24 * 30)) * 100, // Rough monthly estimate
      estimatedCostPercentage: (usage.estimatedCost / 100) * 100 // Assuming $100 monthly limit
    } : null;

    return res.json({
      tenantId: req.tenant.id,
      tenantSlug: req.tenant.slug,
      usage,
      usagePercentages,
      limits: req.tenant.limits,
      currentLimits: tenantLimits,
      lastUpdated: new Date()
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Usage] Failed to get current usage");
    return res.status(500).json({ 
      error: "Failed to get usage statistics" 
    });
  }
});

/**
 * Get usage analytics for all tenants (admin only)
 * GET /api/usage/all
 */
router.get("/all", async (req: TenantRequest, res) => {
  try {
    // Simple admin check - in production, implement proper admin authentication
    const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
    
    if (!isAdmin) {
      return res.status(403).json({ 
        error: "Admin access required" 
      });
    }

    const allUsage = getUsageAnalytics();
    
    // Enrich with tenant information
    const enrichedUsage = await Promise.all(
      allUsage.map(async ({ tenantId, usage }) => {
        const tenant = await tenantManager.getTenantBySlug(`tenant-${tenantId}`); // Simplified lookup
        return {
          tenantId,
          tenantName: tenant?.name || `Tenant ${tenantId}`,
          usage,
          limits: tenant?.limits
        };
      })
    );

    // Calculate totals
    const totals = allUsage.reduce((acc, { usage }) => ({
      totalRequests: acc.totalRequests + usage.requests,
      totalAiCalls: acc.totalAiCalls + usage.aiCalls,
      totalWhatsappMessages: acc.totalWhatsappMessages + usage.whatsappMessages,
      totalEstimatedCost: acc.totalEstimatedCost + usage.estimatedCost
    }), {
      totalRequests: 0,
      totalAiCalls: 0,
      totalWhatsappMessages: 0,
      totalEstimatedCost: 0
    });

    return res.json({
      tenants: enrichedUsage,
      totals,
      timestamp: new Date()
    });

  } catch (error) {
    logger.error({ error }, "[Usage] Failed to get all usage statistics");
    return res.status(500).json({ 
      error: "Failed to get usage statistics" 
    });
  }
});

/**
 * Get usage summary and alerts
 * GET /api/usage/summary
 */
router.get("/summary", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const usage = getUsageAnalytics(req.tenant.id.toString());
    const tenantLimits = await tenantManager.checkTenantLimits(req.tenant.id);

    if (!usage) {
      return res.json({
        summary: "No usage data available",
        alerts: [],
        recommendations: ["Start using the system to see usage analytics"]
      });
    }

    // Generate alerts
    const alerts: string[] = [];
    const recommendations: string[] = [];

    // Cost alerts
    const costPercentage = (usage.estimatedCost / 100) * 100; // Assuming $100 limit
    if (costPercentage >= 90) {
      alerts.push("CRITICAL: 90%+ of monthly cost limit reached");
      recommendations.push("Consider upgrading your plan or optimizing usage");
    } else if (costPercentage >= 75) {
      alerts.push("WARNING: 75%+ of monthly cost limit reached");
      recommendations.push("Monitor usage closely to avoid overage");
    }

    // Usage alerts
    if (tenantLimits.conversations.exceeded) {
      alerts.push("Conversation limit exceeded");
      recommendations.push("Archive old conversations or upgrade plan");
    }

    if (tenantLimits.monthlyMessages.exceeded) {
      alerts.push("Monthly message limit exceeded");
      recommendations.push("Upgrade plan for higher message limits");
    }

    // Efficiency recommendations
    if (usage.aiCalls > usage.requests * 2) {
      recommendations.push("High AI call ratio detected - consider optimizing agent responses");
    }

    if (usage.whatsappMessages > usage.requests * 3) {
      recommendations.push("High WhatsApp message ratio - consider consolidating messages");
    }

    const summary = `This month: ${usage.requests} API requests, ${usage.aiCalls} AI calls, ${usage.whatsappMessages} WhatsApp messages. Estimated cost: $${usage.estimatedCost.toFixed(2)}`;

    return res.json({
      summary,
      alerts,
      recommendations,
      usage,
      limits: tenantLimits,
      costPercentage: Math.round(costPercentage * 100) / 100
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Usage] Failed to get usage summary");
    return res.status(500).json({ 
      error: "Failed to get usage summary" 
    });
  }
});

/**
 * Reset usage statistics for current tenant (admin function)
 * POST /api/usage/reset
 */
router.post("/reset", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    // Simple admin check - in production, implement proper admin authentication
    const isAdmin = req.headers['x-admin-key'] === process.env.ADMIN_API_KEY;
    
    if (!isAdmin) {
      return res.status(403).json({ 
        error: "Admin access required" 
      });
    }

    const validatedData = resetUsageSchema.parse(req.body);

    // Get current usage before reset for logging
    const currentUsage = getUsageAnalytics(req.tenant.id.toString());

    resetTenantUsage(req.tenant.id.toString());

    logger.warn({
      tenantId: req.tenant.id,
      tenantSlug: req.tenant.slug,
      resetBy: req.ip,
      previousUsage: currentUsage
    }, "[Usage] Tenant usage reset by admin");

    return res.json({
      message: "Usage statistics reset successfully",
      tenantId: req.tenant.id,
      previousUsage: currentUsage,
      resetAt: new Date()
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid data", 
        details: error.errors 
      });
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Usage] Failed to reset usage");
    return res.status(500).json({ 
      error: "Failed to reset usage statistics" 
    });
  }
});

/**
 * Get cost optimization suggestions
 * GET /api/usage/optimization
 */
router.get("/optimization", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const usage = getUsageAnalytics(req.tenant.id.toString());

    if (!usage) {
      return res.json({
        suggestions: ["No usage data available for optimization analysis"],
        potentialSavings: 0
      });
    }

    const suggestions: Array<{
      category: string;
      suggestion: string;
      potentialSaving: number;
      priority: 'low' | 'medium' | 'high';
    }> = [];

    let totalPotentialSavings = 0;

    // AI call optimization
    const aiCallRatio = usage.aiCalls / Math.max(usage.requests, 1);
    if (aiCallRatio > 2) {
      const potentialSaving = (usage.aiCalls - usage.requests * 1.5) * 0.002;
      suggestions.push({
        category: "AI Optimization",
        suggestion: "Reduce AI calls by implementing response caching and smarter fallback logic",
        potentialSaving,
        priority: 'high'
      });
      totalPotentialSavings += potentialSaving;
    }

    // WhatsApp message optimization
    const messageRatio = usage.whatsappMessages / Math.max(usage.requests, 1);
    if (messageRatio > 2.5) {
      const potentialSaving = (usage.whatsappMessages - usage.requests * 2) * 0.005;
      suggestions.push({
        category: "WhatsApp Optimization",
        suggestion: "Consolidate multiple messages into single responses to reduce WhatsApp costs",
        potentialSaving,
        priority: 'medium'
      });
      totalPotentialSavings += potentialSaving;
    }

    // Cost efficiency suggestions
    if (usage.estimatedCost > 50) {
      suggestions.push({
        category: "Cost Management",
        suggestion: "Consider implementing more aggressive rate limiting during peak hours",
        potentialSaving: usage.estimatedCost * 0.15,
        priority: 'medium'
      });
      totalPotentialSavings += usage.estimatedCost * 0.15;
    }

    // Usage pattern suggestions
    if (usage.requests > req.tenant.limits.maxMonthlyMessages * 0.8) {
      suggestions.push({
        category: "Capacity Planning",
        suggestion: "Approaching monthly limits - consider upgrading plan or optimizing usage patterns",
        potentialSaving: 0,
        priority: 'high'
      });
    }

    return res.json({
      suggestions,
      totalPotentialSavings: Math.round(totalPotentialSavings * 100) / 100,
      currentCost: usage.estimatedCost,
      optimizedCost: Math.max(0, usage.estimatedCost - totalPotentialSavings),
      analysisDate: new Date()
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Usage] Failed to get optimization suggestions");
    return res.status(500).json({ 
      error: "Failed to get optimization suggestions" 
    });
  }
});

export default router;