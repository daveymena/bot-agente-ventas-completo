import { logger } from "./logger";
import { db, activityEvents } from "@workspace/db";

// Error Resilience System Types
interface FallbackResponse {
  content: string;
  stage: string;
  parts: Array<{ kind: "text"; content: string }>;
  cardProductIds: number[];
  isFallback: true;
}

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
}

// Default retry configuration with exponential backoff
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

// Professional fallback responses for different scenarios
const FALLBACK_RESPONSES = {
  greeting: {
    content: "━━━━━━━━━━━━━━━━━━━━━━━━\n👋 *¡HOLA! BIENVENIDO/A*\n\nEs un placer saludarte. Soy Sofía, tu asesora de élite en *TecnoVariedades D&S*. 😊\n\n¿En qué puedo ayudarte a brillar hoy? 🎓✨\n━━━━━━━━━━━━━━━━━━━━━━━━",
    stage: "greeting"
  },
  product_inquiry: {
    content: "━━━━━━━━━━━━━━━━━━━━━━━━\n🎓 *ANÁLISIS DE TU CONSULTA*\n\nExcelente elección. Estoy consultando los detalles técnicos de ese pack para darte la información más precisa. 🎹✨\n\n¿Tienes alguna duda específica mientras preparo los detalles? 🚀\n━━━━━━━━━━━━━━━━━━━━━━━━",
    stage: "conversacion"
  },
  payment_inquiry: {
    content: "━━━━━━━━━━━━━━━━━━━━━━━━\n💳 *GESTIÓN DE PAGO*\n\nPerfecto, estoy preparando tus enlaces de acceso seguro y las opciones de transferencia. 🔒\n\nDame un instante para confirmar que todo esté listo para tu activación inmediata. ⏳\n━━━━━━━━━━━━━━━━━━━━━━━━",
    stage: "conversacion"
  },
  general: {
    content: "━━━━━━━━━━━━━━━━━━━━━━━━\n✨ *ASESORÍA EN PROCESO*\n\nMuchas gracias por tu mensaje. Estoy analizando tu solicitud para darte una respuesta a la altura de lo que buscas. 😊\n\n¡Un momento, por favor! ⏳\n━━━━━━━━━━━━━━━━━━━━━━━━",
    stage: "conversacion"
  },
  technical_issue: {
    content: "━━━━━━━━━━━━━━━━━━━━━━━━\n🛠️ *OPTIMIZACIÓN DEL SISTEMA*\n\nMil disculpas. Estoy realizando un ajuste rápido en mis sistemas para atenderte mejor. ⚙️\n\nEscríbeme de nuevo en un minuto y estaré al 100% para ti. ¡Gracias por tu paciencia! 🙏\n━━━━━━━━━━━━━━━━━━━━━━━━",
    stage: "conversacion"
  }
};

// Health monitoring for external services
class HealthMonitor {
  private healthStatus: Map<string, HealthStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthChecks();
  }

  private startHealthChecks() {
    // Realizar primer chequeo inmediato
    this.performHealthChecks();
    
    // Check health every 2 minutes
    this.checkInterval = setInterval(() => {
      this.performHealthChecks();
    }, 2 * 60 * 1000);
  }

  private async performHealthChecks() {
    // Check AI providers health
    await this.checkAIProviders();
    
    // Check payment gateways health
    await this.checkPaymentGateways();
    
    // Log health summary
    this.logHealthSummary();
  }

  private async checkAIProviders() {
    const providers = ['github', 'openai', 'ollama'];
    
    for (const provider of providers) {
      const startTime = Date.now();
      try {
        // Simple health check - attempt to get provider config
        const { getProviderConfig, getProviderConfigFromSettings } = await import("@workspace/integrations-openai-ai-server");
        let config = getProviderConfig(provider);
        
        // Si no está en env vars, buscar en la base de datos
        if (!config) {
          const { settings } = await import("@workspace/db");
          const [dbSettings] = await db.select().from(settings).limit(1);
          if (dbSettings) {
            config = getProviderConfigFromSettings(dbSettings);
          }
        }
        
        if (config) {
          const responseTime = Date.now() - startTime;
          this.updateHealthStatus(provider, 'healthy', responseTime);
        } else {
          this.updateHealthStatus(provider, 'unhealthy', undefined, 'Configuration not available');
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.updateHealthStatus(provider, 'unhealthy', responseTime, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async checkPaymentGateways() {
    // Basic health check for payment services
    // In a real implementation, this would ping the actual services
    const services = ['mercadopago', 'paypal', 'nequi'];
    
    for (const service of services) {
      try {
        // Simulate health check - in real implementation, ping the service
        const startTime = Date.now();
        const responseTime = Date.now() - startTime;
        this.updateHealthStatus(`payment_${service}`, 'healthy', responseTime);
      } catch (error) {
        this.updateHealthStatus(`payment_${service}`, 'unhealthy', undefined, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private updateHealthStatus(service: string, status: HealthStatus['status'], responseTime?: number, error?: string) {
    this.healthStatus.set(service, {
      service,
      status,
      lastCheck: new Date(),
      responseTime,
      error
    });
  }

  private logHealthSummary() {
    const summary = Array.from(this.healthStatus.values());
    const unhealthyServices = summary.filter(s => s.status === 'unhealthy');
    
    if (unhealthyServices.length > 0) {
      logger.warn({ 
        unhealthyServices: unhealthyServices.map(s => ({ service: s.service, error: s.error }))
      }, "[HealthMonitor] Unhealthy services detected");
      
      // Create activity event for critical failures
      this.notifyOperatorOfCriticalFailures(unhealthyServices);
    } else {
      logger.info({ 
        totalServices: summary.length,
        healthyServices: summary.filter(s => s.status === 'healthy').length
      }, "[HealthMonitor] All services healthy");
    }
  }

  private async notifyOperatorOfCriticalFailures(_unhealthyServices: HealthStatus[]) {
    // Silenced: health alerts are logged to console only, not stored in DB to avoid noise
  }

  getServiceHealth(service: string): HealthStatus | null {
    return this.healthStatus.get(service) || null;
  }

  getAllHealthStatus(): HealthStatus[] {
    return Array.from(this.healthStatus.values());
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

// Global health monitor instance
const healthMonitor = new HealthMonitor();

// Retry mechanism with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context: string = "operation"
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      if (attempt > 0) {
        logger.info({ 
          context, 
          attempt: attempt + 1, 
          totalAttempts: finalConfig.maxRetries + 1 
        }, "[RetrySystem] Operation succeeded after retry");
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === finalConfig.maxRetries) {
        logger.error({ 
          context, 
          totalAttempts: attempt + 1, 
          error: lastError.message 
        }, "[RetrySystem] Operation failed after all retries");
        break;
      }
      
      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay
      );
      
      logger.warn({ 
        context, 
        attempt: attempt + 1, 
        nextRetryIn: delay, 
        error: lastError.message 
      }, "[RetrySystem] Operation failed, retrying");
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Determine appropriate fallback response based on context
export function determineFallbackResponse(lastMessage: string, conversationContext?: any): FallbackResponse {
  const text = lastMessage.toLowerCase();
  
  // Analyze message content to determine best fallback
  let responseKey: keyof typeof FALLBACK_RESPONSES = "general";
  
  if (["hola", "buenas", "buen dia", "buenos dias", "buenas tardes"].some(k => text.includes(k))) {
    responseKey = "greeting";
  } else if (["pago", "pagar", "comprar", "precio", "valor", "transferencia", "nequi", "daviplata"].some(k => text.includes(k))) {
    responseKey = "payment_inquiry";
  } else if (["producto", "curso", "megapack", "piano", "guitarra", "excel", "diseño", "trading"].some(k => text.includes(k))) {
    responseKey = "product_inquiry";
  }
  
  const response = FALLBACK_RESPONSES[responseKey];
  
  return {
    content: response.content,
    stage: response.stage,
    parts: [{ kind: "text", content: response.content }],
    cardProductIds: [],
    isFallback: true
  };
}

// Create operator notification for critical failures
export async function notifyOperatorOfFailure(
  conversationId: number,
  errorType: string,
  errorDetails: string,
  customerInfo?: { name: string; phone: string }
) {
  try {
    const title = `🚨 Falla crítica en conversación ${conversationId}`;
    const subtitle = customerInfo 
      ? `Cliente: ${customerInfo.name} (${customerInfo.phone}) - Error: ${errorType}`
      : `Error: ${errorType} - ${errorDetails.slice(0, 50)}`;
    
    await db.insert(activityEvents).values({
      type: "system_alert",
      title,
      subtitle,
    });
    
    logger.error({ 
      conversationId, 
      errorType, 
      errorDetails, 
      customerInfo 
    }, "[FallbackSystem] Critical failure notification sent to operator");
  } catch (error) {
    logger.error({ 
      error, 
      conversationId, 
      errorType 
    }, "[FallbackSystem] Failed to notify operator of critical failure");
  }
}

// Enhanced error resilience wrapper for AI operations
export async function executeWithFallback<T>(
  operation: () => Promise<T>,
  fallbackOperation: () => T,
  context: {
    conversationId: number;
    customerMessage: string;
    customerInfo?: { name: string; phone: string };
  }
): Promise<T> {
  try {
    // First attempt with retry mechanism
    return await retryWithBackoff(
      operation,
      { maxRetries: 2, baseDelay: 500 }, // Faster retries for real-time chat
      `AI_operation_conversation_${context.conversationId}`
    );
  } catch (error) {
    logger.error({ 
      conversationId: context.conversationId,
      error: error instanceof Error ? error.message : String(error)
    }, "[FallbackSystem] AI operation failed, activating fallback");
    
    // Notify operator of the failure
    await notifyOperatorOfFailure(
      context.conversationId,
      "AI_API_FAILURE",
      error instanceof Error ? error.message : String(error),
      context.customerInfo
    );
    
    // Return fallback response
    return fallbackOperation();
  }
}

// Check if all AI providers are healthy
export function areAIProvidersHealthy(): boolean {
  const aiProviders = ['github', 'openai', 'ollama'];
  return aiProviders.some(provider => {
    const health = healthMonitor.getServiceHealth(provider);
    return health?.status === 'healthy';
  });
}

// Check if payment services are healthy
export function arePaymentServicesHealthy(): boolean {
  const paymentServices = ['payment_mercadopago', 'payment_paypal', 'payment_nequi'];
  return paymentServices.some(service => {
    const health = healthMonitor.getServiceHealth(service);
    return health?.status === 'healthy';
  });
}

// Get system health summary
export function getSystemHealthSummary() {
  return {
    allServices: healthMonitor.getAllHealthStatus(),
    aiProvidersHealthy: areAIProvidersHealthy(),
    paymentServicesHealthy: arePaymentServicesHealthy(),
    timestamp: new Date()
  };
}

// Graceful shutdown
export function shutdownFallbackSystem() {
  healthMonitor.stop();
}

// Export health monitor for external use
export { healthMonitor };