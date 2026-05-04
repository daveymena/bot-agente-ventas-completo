import { logger } from "./logger";
import { db, conversations, messages, activityEvents } from "@workspace/db";
import { eq, desc, gte, sql } from "drizzle-orm";

// Tipos para el sistema de monitoreo
export interface ConversationMetrics {
  conversationId: number;
  customerPhone: string;
  customerName: string;
  messageCount: number;
  avgResponseTime: number;
  currentStage: string;
  lastActivity: Date;
  aiConfidence: number;
  leadScore: number;
  status: string;
}

export interface SystemMetrics {
  totalConversations: number;
  activeConversations: number;
  messagesPerHour: number;
  avgResponseTime: number;
  aiSuccessRate: number;
  errorRate: number;
  topStages: Array<{ stage: string; count: number }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: Date;
    conversationId?: number;
  }>;
}

export interface AgentDecisionLog {
  conversationId: number;
  customerMessage: string;
  agentResponse: string;
  reasoning: string;
  confidence: number;
  processingTime: number;
  contextUsed: any;
  stageTransition?: {
    from: string;
    to: string;
    reason: string;
  };
  timestamp: Date;
}

class MonitoringSystem {
  private static instance: MonitoringSystem;
  private agentDecisions: AgentDecisionLog[] = [];
  private performanceMetrics: Map<string, number[]> = new Map();
  private alertThresholds = {
    responseTime: 5000, // 5 segundos
    errorRate: 0.1, // 10%
    lowConfidence: 0.6 // 60%
  };

  static getInstance(): MonitoringSystem {
    if (!MonitoringSystem.instance) {
      MonitoringSystem.instance = new MonitoringSystem();
    }
    return MonitoringSystem.instance;
  }

  // Registrar decisión del agente con contexto completo
  logAgentDecision(decision: Omit<AgentDecisionLog, 'timestamp'>) {
    const logEntry: AgentDecisionLog = {
      ...decision,
      timestamp: new Date()
    };

    this.agentDecisions.push(logEntry);
    
    // Mantener solo los últimos 1000 registros en memoria
    if (this.agentDecisions.length > 1000) {
      this.agentDecisions = this.agentDecisions.slice(-1000);
    }

    // Log estructurado para análisis
    logger.info({
      type: 'AGENT_DECISION',
      conversationId: decision.conversationId,
      customerMessage: decision.customerMessage.substring(0, 100),
      agentResponse: decision.agentResponse.substring(0, 100),
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      processingTime: decision.processingTime,
      stageTransition: decision.stageTransition,
      contextKeys: Object.keys(decision.contextUsed || {}),
      timestamp: logEntry.timestamp.toISOString()
    }, "[MONITOR] Agent Decision Logged");

    // Verificar alertas
    this.checkAlerts(logEntry);
  }

  // Registrar métricas de rendimiento
  recordMetric(metricName: string, value: number) {
    if (!this.performanceMetrics.has(metricName)) {
      this.performanceMetrics.set(metricName, []);
    }
    
    const metrics = this.performanceMetrics.get(metricName)!;
    metrics.push(value);
    
    // Mantener solo las últimas 100 mediciones
    if (metrics.length > 100) {
      metrics.shift();
    }

    // Log para métricas críticas
    if (metricName === 'response_time' && value > this.alertThresholds.responseTime) {
      logger.warn({
        metric: metricName,
        value,
        threshold: this.alertThresholds.responseTime
      }, "[MONITOR] Performance Alert: Slow Response Time");
    }
  }

  // Verificar alertas automáticas
  private checkAlerts(decision: AgentDecisionLog) {
    // Alerta por baja confianza
    if (decision.confidence < this.alertThresholds.lowConfidence) {
      logger.warn({
        conversationId: decision.conversationId,
        confidence: decision.confidence,
        threshold: this.alertThresholds.lowConfidence,
        customerMessage: decision.customerMessage.substring(0, 50)
      }, "[MONITOR] Alert: Low AI Confidence");
    }

    // Alerta por tiempo de respuesta alto
    if (decision.processingTime > this.alertThresholds.responseTime) {
      logger.warn({
        conversationId: decision.conversationId,
        processingTime: decision.processingTime,
        threshold: this.alertThresholds.responseTime
      }, "[MONITOR] Alert: Slow Processing Time");
    }
  }

  // Obtener métricas del sistema en tiempo real
  async getSystemMetrics(): Promise<SystemMetrics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Consultas a la base de datos
    const [totalConversations] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations);

    const [activeConversations] = await db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(eq(conversations.status, 'ai'));

    const [recentMessages] = await db
      .select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(gte(messages.createdAt, oneHourAgo));

    const stageStats = await db
      .select({
        stage: conversations.currentStage,
        count: sql<number>`count(*)`
      })
      .from(conversations)
      .groupBy(conversations.currentStage)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const recentActivity = await db
      .select()
      .from(activityEvents)
      .orderBy(desc(activityEvents.createdAt))
      .limit(10);

    // Calcular métricas de rendimiento
    const responseTimeMetrics = this.performanceMetrics.get('response_time') || [];
    const avgResponseTime = responseTimeMetrics.length > 0 
      ? responseTimeMetrics.reduce((a, b) => a + b, 0) / responseTimeMetrics.length 
      : 0;

    const recentDecisions = this.agentDecisions.slice(-50);
    const aiSuccessRate = recentDecisions.length > 0
      ? recentDecisions.filter(d => d.confidence > 0.7).length / recentDecisions.length
      : 1;

    return {
      totalConversations: totalConversations.count,
      activeConversations: activeConversations.count,
      messagesPerHour: recentMessages.count,
      avgResponseTime,
      aiSuccessRate,
      errorRate: 1 - aiSuccessRate,
      topStages: stageStats.map(s => ({
        stage: s.stage || 'unknown',
        count: s.count
      })),
      recentActivity: recentActivity.map(a => ({
        type: a.type,
        description: a.title,
        timestamp: a.createdAt,
        conversationId: undefined // No está en el schema actual
      }))
    };
  }

  // Obtener métricas de una conversación específica
  async getConversationMetrics(conversationId: number): Promise<ConversationMetrics | null> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) return null;

    const conversationMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt));

    const agentDecisions = this.agentDecisions.filter(d => d.conversationId === conversationId);
    const avgConfidence = agentDecisions.length > 0
      ? agentDecisions.reduce((sum, d) => sum + d.confidence, 0) / agentDecisions.length
      : 0;

    const avgResponseTime = agentDecisions.length > 0
      ? agentDecisions.reduce((sum, d) => sum + d.processingTime, 0) / agentDecisions.length
      : 0;

    return {
      conversationId,
      customerPhone: conversation.contactPhone,
      customerName: conversation.contactName,
      messageCount: conversationMessages.length,
      avgResponseTime,
      currentStage: conversation.currentStage || 'unknown',
      lastActivity: conversation.lastMessageAt || conversation.createdAt,
      aiConfidence: avgConfidence,
      leadScore: 0, // Se puede integrar con el sistema de lead scoring
      status: conversation.status
    };
  }

  // Obtener decisiones recientes del agente
  getRecentAgentDecisions(limit: number = 20): AgentDecisionLog[] {
    return this.agentDecisions
      .slice(-limit)
      .reverse(); // Más recientes primero
  }

  // Obtener análisis de rendimiento
  getPerformanceAnalysis() {
    const analysis: any = {};
    
    for (const [metricName, values] of this.performanceMetrics.entries()) {
      if (values.length === 0) continue;
      
      const sorted = [...values].sort((a, b) => a - b);
      analysis[metricName] = {
        count: values.length,
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)]
      };
    }
    
    return analysis;
  }

  // Limpiar datos antiguos
  cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.agentDecisions = this.agentDecisions.filter(d => d.timestamp > oneHourAgo);
    
    logger.info({
      remainingDecisions: this.agentDecisions.length
    }, "[MONITOR] Cleanup completed");
  }
}

export const monitoring = MonitoringSystem.getInstance();

// Función helper para logging de decisiones del agente
export function logAgentThinking(
  conversationId: number,
  customerMessage: string,
  reasoning: string,
  context: any
) {
  logger.info({
    type: 'AGENT_THINKING',
    conversationId,
    customerMessage: customerMessage.substring(0, 100),
    reasoning,
    contextSummary: {
      hasIntroduced: context.hasIntroduced,
      currentTopic: context.currentTopic,
      interestLevel: context.leadBehavior?.interestLevel,
      communicationStyle: context.leadBehavior?.communicationStyle,
      emotionalState: context.leadBehavior?.emotionalState?.sentiment
    },
    timestamp: new Date().toISOString()
  }, "[MONITOR] Agent Thinking Process");
}

// Función helper para logging de errores del sistema
export function logSystemError(
  component: string,
  error: Error,
  context?: any
) {
  logger.error({
    type: 'SYSTEM_ERROR',
    component,
    error: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  }, "[MONITOR] System Error");
}

// Función helper para logging de métricas de negocio
export function logBusinessMetric(
  metricName: string,
  value: number,
  context?: any
) {
  logger.info({
    type: 'BUSINESS_METRIC',
    metric: metricName,
    value,
    context,
    timestamp: new Date().toISOString()
  }, "[MONITOR] Business Metric");
}