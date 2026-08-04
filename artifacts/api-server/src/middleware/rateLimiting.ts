// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { tenantManager, type TenantRequest } from "../lib/tenantManager";

// Rate Limiting Types
export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  onLimitReached?: (req: Request, res: Response) => void;
}

export interface CostTrackingConfig {
  aiCostPerRequest: number; // Cost per AI API call
  whatsappCostPerMessage: number; // Cost per WhatsApp message
  maxMonthlyCost: number; // Maximum monthly cost per tenant
  alertThreshold: number; // Alert when reaching % of max cost
}

export interface UsageMetrics {
  requests: number;
  aiCalls: number;
  whatsappMessages: number;
  estimatedCost: number;
  lastReset: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  totalHits: number;
}

// In-memory storage for rate limiting (in production, use Redis)
class RateLimitStorage {
  private storage: Map<string, { count: number; resetTime: Date }> = new Map();
  private costStorage: Map<string, UsageMetrics> = new Map();

  // Rate limiting methods
  increment(key: string, windowMs: number): RateLimitResult {
    const now = new Date();
    const existing = this.storage.get(key);

    if (!existing || now > existing.resetTime) {
      // Create new window
      const resetTime = new Date(now.getTime() + windowMs);
      this.storage.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remaining: 0, // Will be calculated by caller
        resetTime,
        totalHits: 1
      };
    }

    // Increment existing window
    existing.count++;
    this.storage.set(key, existing);

    return {
      allowed: true, // Will be determined by caller based on maxRequests
      remaining: 0, // Will be calculated by caller
      resetTime: existing.resetTime,
      totalHits: existing.count
    };
  }

  // Cost tracking methods
  trackUsage(tenantId: string, type: 'ai_call' | 'whatsapp_message' | 'api_request', cost: number = 0): void {
    const key = `cost_${tenantId}`;
    const now = new Date();
    const existing = this.costStorage.get(key);

    if (!existing || this.isNewMonth(existing.lastReset, now)) {
      // Reset monthly usage
      this.costStorage.set(key, {
        requests: type === 'api_request' ? 1 : 0,
        aiCalls: type === 'ai_call' ? 1 : 0,
        whatsappMessages: type === 'whatsapp_message' ? 1 : 0,
        estimatedCost: cost,
        lastReset: now
      });
      return;
    }

    // Update existing usage
    if (type === 'api_request') existing.requests++;
    if (type === 'ai_call') existing.aiCalls++;
    if (type === 'whatsapp_message') existing.whatsappMessages++;
    existing.estimatedCost += cost;

    this.costStorage.set(key, existing);
  }

  getUsage(tenantId: string): UsageMetrics | null {
    return this.costStorage.get(`cost_${tenantId}`) || null;
  }

  private isNewMonth(lastReset: Date, now: Date): boolean {
    return lastReset.getMonth() !== now.getMonth() || 
           lastReset.getFullYear() !== now.getFullYear();
  }

  // Cleanup old entries
  cleanup(): void {
    const now = new Date();
    
    // Clean rate limit storage
    for (const [key, value] of this.storage.entries()) {
      if (now > value.resetTime) {
        this.storage.delete(key);
      }
    }

    // Clean cost storage (keep current month only)
    for (const [key, value] of this.costStorage.entries()) {
      if (this.isNewMonth(value.lastReset, now)) {
        // Archive old data before deleting (in production, save to database)
        logger.info({ 
          tenantId: key.replace('cost_', ''), 
          archivedUsage: value 
        }, "[RateLimit] Archiving monthly usage data");
        this.costStorage.delete(key);
      }
    }
  }
}

// Rate Limiting Middleware Class
export class RateLimitingMiddleware {
  private storage = new RateLimitStorage();
  private cleanupInterval: NodeJS.Timeout;

  // Default configurations
  private defaultConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: process.env.NODE_ENV === 'production' ? 100 : 1000, // 1000 en desarrollo, 100 en producción
    keyGenerator: (req) => req.ip || 'unknown'
  };

  private defaultCostConfig: CostTrackingConfig = {
    aiCostPerRequest: 0.002, // $0.002 per AI call
    whatsappCostPerMessage: 0.005, // $0.005 per WhatsApp message
    maxMonthlyCost: 100, // $100 per month
    alertThreshold: 80 // Alert at 80%
  };

  constructor() {
    // Start cleanup interval (every hour)
    this.cleanupInterval = setInterval(() => {
      this.storage.cleanup();
    }, 60 * 60 * 1000);
  }

  /**
   * Creates rate limiting middleware for API endpoints
   */
  createRateLimit(config: Partial<RateLimitConfig> = {}) {
    const finalConfig = { ...this.defaultConfig, ...config };

    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      try {
        const key = finalConfig.keyGenerator!(req);
        const tenantId = req.tenant?.id || 1;

        // Check tenant-specific limits
        const tenantLimits = await tenantManager.checkTenantLimits(tenantId);
        
        // Apply tenant API rate limit if more restrictive
        const tenantMaxRequests = req.tenant?.limits.apiCallsPerMinute || finalConfig.maxRequests;
        const effectiveMaxRequests = Math.min(finalConfig.maxRequests, tenantMaxRequests);

        const result = this.storage.increment(key, finalConfig.windowMs);
        const remaining = Math.max(0, effectiveMaxRequests - result.totalHits);
        const allowed = result.totalHits <= effectiveMaxRequests;

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': effectiveMaxRequests.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
          'X-Tenant-ID': tenantId.toString()
        });

        if (!allowed) {
          logger.warn({
            tenantId,
            key,
            totalHits: result.totalHits,
            maxRequests: effectiveMaxRequests,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          }, "[RateLimit] Rate limit exceeded");

          if (finalConfig.onLimitReached) {
            finalConfig.onLimitReached(req, res);
            return;
          }

          return res.status(429).json({
            error: "Rate limit exceeded",
            message: `Too many requests. Limit: ${effectiveMaxRequests} per ${finalConfig.windowMs / 1000} seconds`,
            retryAfter: Math.ceil((result.resetTime.getTime() - Date.now()) / 1000)
          });
        }

        // Track API usage for cost monitoring
        this.storage.trackUsage(tenantId.toString(), 'api_request');

        logger.debug({
          tenantId,
          key,
          remaining,
          totalHits: result.totalHits
        }, "[RateLimit] Request allowed");

        next();

      } catch (error) {
        logger.error({ error }, "[RateLimit] Rate limiting error");
        // Allow request on error to avoid blocking legitimate traffic
        next();
      }
    };
  }

  /**
   * Creates cost tracking middleware for AI API calls
   */
  createCostTracker(config: Partial<CostTrackingConfig> = {}) {
    const finalConfig = { ...this.defaultCostConfig, ...config };

    return async (req: TenantRequest, res: Response, next: NextFunction) => {
      const tenantId = req.tenant?.id?.toString() || '1';
      
      // Track AI call cost
      this.storage.trackUsage(tenantId, 'ai_call', finalConfig.aiCostPerRequest);

      // Check if approaching cost limits
      const usage = this.storage.getUsage(tenantId);
      if (usage) {
        const costPercentage = (usage.estimatedCost / finalConfig.maxMonthlyCost) * 100;
        
        if (costPercentage >= finalConfig.alertThreshold) {
          logger.warn({
            tenantId,
            currentCost: usage.estimatedCost,
            maxCost: finalConfig.maxMonthlyCost,
            percentage: costPercentage,
            usage
          }, "[CostControl] Approaching cost limit");

          // Add cost warning header
          res.set('X-Cost-Warning', `${costPercentage.toFixed(1)}% of monthly limit used`);
        }

        if (costPercentage >= 100) {
          logger.error({
            tenantId,
            currentCost: usage.estimatedCost,
            maxCost: finalConfig.maxMonthlyCost,
            usage
          }, "[CostControl] Monthly cost limit exceeded");

          return res.status(402).json({
            error: "Cost limit exceeded",
            message: "Monthly cost limit has been reached. Please upgrade your plan or wait for next billing cycle.",
            currentCost: usage.estimatedCost,
            maxCost: finalConfig.maxMonthlyCost
          });
         }
       }

       next();
       return;
     };
   }

  /**
   * Tracks WhatsApp message costs
   */
  trackWhatsAppMessage(tenantId: string, config: Partial<CostTrackingConfig> = {}): void {
    const finalConfig = { ...this.defaultCostConfig, ...config };
    this.storage.trackUsage(tenantId, 'whatsapp_message', finalConfig.whatsappCostPerMessage);
  }

  /**
   * Gets usage statistics for a tenant
   */
  getUsageStats(tenantId: string): UsageMetrics | null {
    return this.storage.getUsage(tenantId);
  }

  /**
   * Gets usage statistics for all tenants
   */
  getAllUsageStats(): Array<{ tenantId: string; usage: UsageMetrics }> {
    const stats: Array<{ tenantId: string; usage: UsageMetrics }> = [];
    
    for (const [key, usage] of (this.storage as any).costStorage.entries()) {
      if (key.startsWith('cost_')) {
        const tenantId = key.replace('cost_', '');
        stats.push({ tenantId, usage });
      }
    }

    return stats;
  }

  /**
   * Resets usage for a tenant (admin function)
   */
  resetUsage(tenantId: string): void {
    (this.storage as any).costStorage.delete(`cost_${tenantId}`);
    logger.info({ tenantId }, "[RateLimit] Usage reset for tenant");
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Singleton instance
export const rateLimitingMiddleware = new RateLimitingMiddleware();

// Predefined middleware configurations
export const apiRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
  keyGenerator: (req: TenantRequest) => `api_${req.tenant?.id || 'default'}_${req.ip}`
});

export const whatsappRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // Max 10 WhatsApp operations per minute
  keyGenerator: (req: TenantRequest) => `whatsapp_${req.tenant?.id || 'default'}`
});

export const aiCostTracker = rateLimitingMiddleware.createCostTracker({
  aiCostPerRequest: 0.002,
  maxMonthlyCost: 100,
  alertThreshold: 80
});

export const conversationRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // Max 30 messages per minute per conversation
  keyGenerator: (req: TenantRequest) => {
    const conversationId = req.params.conversationId || req.body.conversationId;
    return `conversation_${req.tenant?.id || 'default'}_${conversationId}`;
  }
});

// Recuperación de contraseña es pública (sin req.tenant), así que se limita
// por IP + email para evitar que alguien la use para bombardear de emails a
// una cuenta ajena o para tantear qué correos existen a fuerza de intentos.
export const passwordResetRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5,
  keyGenerator: (req: TenantRequest) => `pwreset_${req.ip}_${(req.body as any)?.email || ""}`
});

export const authRateLimit = rateLimitingMiddleware.createRateLimit({
  windowMs: 15 * 60 * 1000,
  maxRequests: 12,
  keyGenerator: (req: TenantRequest) => `auth_${req.ip}_${(req.body as any)?.email || ""}`,
});

// Utility functions
export function trackWhatsAppCost(tenantId: string): void {
  rateLimitingMiddleware.trackWhatsAppMessage(tenantId);
}

export function getUsageAnalytics(tenantId?: string) {
  if (tenantId) {
    return rateLimitingMiddleware.getUsageStats(tenantId);
  }
  return rateLimitingMiddleware.getAllUsageStats();
}

export function resetTenantUsage(tenantId: string): void {
  rateLimitingMiddleware.resetUsage(tenantId);
}

// Payment-specific rate limiting (5 attempts per minute per tenant)
const paymentAttempts = new Map<number, { count: number; resetTime: Date }>();

export function paymentRateLimit(req: any, res: any, next: any) {
  const tenantId = req.tenant?.id || 1;
  const now = new Date();
  const existing = paymentAttempts.get(tenantId);

  if (!existing || now > existing.resetTime) {
    paymentAttempts.set(tenantId, { count: 1, resetTime: new Date(now.getTime() + 60000) });
    return next();
  }

  existing.count++;
  if (existing.count > 5) {
    logger.warn({ tenantId }, "[PaymentRateLimit] Too many payment attempts");
    return res.status(429).json({
      error: "Too many payment attempts",
      message: "Demasiados intentos de pago. Por favor espera un minuto.",
      retryAfter: Math.ceil((existing.resetTime.getTime() - now.getTime()) / 1000)
    });
  }

  next();
}

// Export types
export type { RateLimitConfig, CostTrackingConfig, UsageMetrics, RateLimitResult };
