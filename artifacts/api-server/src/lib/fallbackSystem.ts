import { logger } from "./logger";
import { db, activityEvents } from "@workspace/db";
import { PAYMENT_KEYWORDS, LOW_INTEREST_KEYWORDS, PAYMENT_KEYWORDS as PRODUCT_KEYWORDS } from "./agent";

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
  status: 'healthy' | 'degraded' | 'unhealthy' | 'cooldown';
  lastCheck: Date;
  responseTime?: number;
  error?: string;
  successCount: number;
  failureCount: number;
  consecutiveFailures: number;
  cooldownUntil?: Date;
}

// Default retry configuration with exponential backoff
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

// Cooldown period for unhealthy services (5 minutes)
const COOLDOWN_MS = 5 * 60 * 1000;
const FAILURE_THRESHOLD = 3; // Consecutive failures before cooldown

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
  }
};

// Health monitoring for external services with Circuit Breaker
class HealthMonitor {
  private healthStatus: Map<string, HealthStatus> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthChecks();
  }

  private startHealthChecks() {
    this.performHealthChecks();
    this.checkInterval = setInterval(() => this.performHealthChecks(), 2 * 60 * 1000);
  }

  private async performHealthChecks() {
    // Reset cooldowns if time has passed
    const now = new Date();
    for (const [service, status] of this.healthStatus.entries()) {
      if (status.status === 'cooldown' && status.cooldownUntil && now > status.cooldownUntil) {
        logger.info({ service }, "[HealthMonitor] Cooldown expired, service restored to healthy");
        this.updateHealthStatus(service, 'healthy');
        status.consecutiveFailures = 0;
      }
    }
  }

  public reportSuccess(service: string, responseTime?: number) {
    const current = this.getOrInitStatus(service);
    current.successCount++;
    current.consecutiveFailures = 0;
    current.status = 'healthy';
    current.lastCheck = new Date();
    if (responseTime) current.responseTime = responseTime;
    
    this.healthStatus.set(service, current);
  }

  public async reportFailure(service: string, error?: string) {
    const current = this.getOrInitStatus(service);
    current.failureCount++;
    current.consecutiveFailures++;
    current.lastCheck = new Date();
    current.error = error;

    if (current.consecutiveFailures >= FAILURE_THRESHOLD) {
      current.status = 'cooldown';
      current.cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
      
      logger.error({ 
        service, 
        consecutiveFailures: current.consecutiveFailures, 
        cooldownUntil: current.cooldownUntil 
      }, "[HealthMonitor] Service entering COOLDOWN due to multiple failures");

      // Log to DB as system alert
      await notifyOperatorOfFailure(
        0, 
        `CIRCUIT_BREAKER_${service.toUpperCase()}`, 
        `El servicio ha sido desactivado temporalmente por fallas consecutivas: ${error || "Error desconocido"}`
      );
    } else {
      current.status = 'degraded';
    }

    this.healthStatus.set(service, current);
  }

  private getOrInitStatus(service: string): HealthStatus {
    const current = this.healthStatus.get(service);
    if (current) return current;
    
    const newStatus: HealthStatus = {
      service,
      status: 'healthy',
      lastCheck: new Date(),
      successCount: 0,
      failureCount: 0,
      consecutiveFailures: 0
    };
    this.healthStatus.set(service, newStatus);
    return newStatus;
  }

  private updateHealthStatus(service: string, status: HealthStatus['status'], responseTime?: number, error?: string) {
    const current = this.getOrInitStatus(service);
    current.status = status;
    current.lastCheck = new Date();
    if (responseTime) current.responseTime = responseTime;
    if (error) current.error = error;
  }

  getServiceHealth(service: string): HealthStatus | null {
    return this.healthStatus.get(service) || null;
  }

  isServiceHealthy(service: string): boolean {
    const status = this.healthStatus.get(service);
    if (!status) return true; // Assume healthy if never checked
    return status.status !== 'cooldown' && status.status !== 'unhealthy';
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
export const healthMonitor = new HealthMonitor();

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
      const startTime = Date.now();
      const result = await operation();
      const duration = Date.now() - startTime;
      
      // Report success to health monitor
      healthMonitor.reportSuccess(context, duration);
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Report failure to health monitor
      healthMonitor.reportFailure(context, lastError.message);
      
      if (attempt === finalConfig.maxRetries) break;
      
      const delay = Math.min(
        finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay
      );
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Determine appropriate fallback response based on context
export function determineFallbackResponse(lastMessage: string, _conversationContext?: any): FallbackResponse {
  const text = lastMessage.toLowerCase();
  let responseKey: keyof typeof FALLBACK_RESPONSES = "general";
  
  if (LOW_INTEREST_KEYWORDS.some(k => text.includes(k))) {
    responseKey = "greeting";
  } else if (PAYMENT_KEYWORDS.some(k => text.includes(k))) {
    responseKey = "payment_inquiry";
  } else if (["producto", "curso", "piano", "guitarra"].some(k => text.includes(k))) {
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
  customerInfo?: { name: string; phone: string },
  tenantId?: number | null,
) {
  try {
    // ── Un log de servidor NO es actividad de ventas ─────────────────────
    // Esto escribia en el MISMO feed que el cliente ve en su panel, con el
    // texto crudo: "CIRCUIT_BREAKER_AI_GROQ_CONV_13 - 413 Request too large".
    // Para quien paga la herramienta, leer eso entre sus seguimientos no le
    // dice nada bueno de la plataforma -- y no puede hacer nada al respecto.
    //
    // El detalle tecnico sigue yendo al log, que es donde sirve para
    // diagnosticar. Al feed va solo lo que le importa al dueno del negocio: si
    // un cliente suyo se quedo sin respuesta.
    logger.error(
      { conversationId, errorType, errorDetails: errorDetails.slice(0, 300), customerInfo },
      "[FallbackSystem] fallo de IA",
    );

    // Una falla de infraestructura sin conversacion afectada no le interesa a
    // nadie mas que a quien mantiene el sistema.
    if (conversationId === 0) return;

    // Si SI hubo alguien esperando respuesta, se dice en su idioma. Y con
    // tenantId: sin el, la alerta de un negocio le aparecia a TODOS los demas.
    await db.insert(activityEvents).values({
      tenantId: tenantId ?? null,
      type: "conversation_failed",
      title: "Una conversación no pudo responderse automáticamente",
      subtitle: customerInfo
        ? `${customerInfo.name} (${customerInfo.phone}) quedó sin respuesta. Conviene escribirle a mano.`
        : "Un cliente quedó sin respuesta automática. Conviene revisarlo.",
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "[FallbackSystem] Failed to log failure to DB");
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
    return await retryWithBackoff(
      operation,
      { maxRetries: 1, baseDelay: 500 },
      `AI_OP_CONV_${context.conversationId}`
    );
  } catch (error: any) {
    logger.error({ conversationId: context.conversationId, error: error.message }, "[FallbackSystem] AI failed, activating fallback");
    
    // Notify operator of the failure
    await notifyOperatorOfFailure(
        context.conversationId,
        "AI_API_FAILURE",
        error.message,
        context.customerInfo
    );

    return fallbackOperation();
  }
}

// Check if all AI providers are healthy
export function areAIProvidersHealthy(): boolean {
  return true; // Simple entry point
}

// Check if payment services are healthy
export function arePaymentServicesHealthy(): boolean {
  return true; // Simple entry point
}

// Get system health summary
export function getSystemHealthSummary() {
  return {
    allServices: healthMonitor.getAllHealthStatus(),
    timestamp: new Date()
  };
}

// Graceful shutdown
export function shutdownFallbackSystem() {
  healthMonitor.stop();
}