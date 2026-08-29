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
      .where(gte(messages.createdAt, oneHourAgo.toISOString()));

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
// ════════════════════════════════════════════════════════════════════════
// SALUD DE LA CADENA DE IA
// ════════════════════════════════════════════════════════════════════════
//
// Este archivo entero llevaba 345 líneas sin que nadie lo importara, mientras
// `analytics.ts:336` decía en un comentario que "no existe infraestructura de
// monitoreo" y devolvía `errorRate = 0 // not tracked`.
//
// Lo que había escrito acá vigila tiempo de respuesta y confianza. Está bien,
// pero NO habría cazado nada de lo que se rompió el 2026-08-29, porque nada de
// eso falló: todo DEGRADÓ en silencio.
//
//   · GROQ_MODEL apuntaba a llama-3.1-8b-instant, dado de baja
//   · el filtro de herramientas del puente MCP estaba anulado por un spread
//   · Advantage+ Audience estaba apagado en TODAS las campañas
//   · oc-groq pedía un modelo que Groq retiró
//   · el bot de ventas contestaba con el modelo chico teniendo el grande
//   · un 429 de un minuto apartaba al proveedor una hora
//
// Ninguno devolvió un error. Todos devolvieron una respuesta peor, más lenta o
// más barata, y el admin lo descubrió por el resultado -- o no lo descubrió.
//
// Lo que sigue registra exactamente eso: QUÉ contestó de verdad y QUIÉN está
// castigado. Es el dato que convierte "el bot anda raro" en "hace 40 minutos
// que contesta el modelo de respaldo porque Groq está apartado".

interface TurnoAtendido {
  proveedor: string;
  modelo: string;
  /** true si NO fue el primero de la cadena: alguien de más arriba falló. */
  fueRespaldo: boolean;
  cuando: number;
}

interface ProveedorCastigado {
  proveedor: string;
  clase: string;
  motivo: string;
  hasta: number;
  cuando: number;
}

const VENTANA_MS = 60 * 60 * 1000; // se mira la última hora
const MAX_TURNOS = 200;

const turnos: TurnoAtendido[] = [];
const castigos: ProveedorCastigado[] = [];

/** Qué modelo atendió el turno de verdad. Lo llama la cadena, no el modelo. */
export function registrarTurnoAtendido(proveedor: string, modelo: string, fueRespaldo: boolean): void {
  turnos.push({ proveedor, modelo, fueRespaldo, cuando: Date.now() });
  if (turnos.length > MAX_TURNOS) turnos.splice(0, turnos.length - MAX_TURNOS);
}

/** Un proveedor que se aparta. El dato que faltaba para explicar la lentitud. */
export function registrarProveedorCastigado(
  proveedor: string,
  clase: string,
  cooldownMs: number,
  motivo?: string,
): void {
  castigos.push({
    proveedor,
    clase,
    motivo: String(motivo || "").slice(0, 200),
    hasta: Date.now() + cooldownMs,
    cuando: Date.now(),
  });
  if (castigos.length > MAX_TURNOS) castigos.splice(0, castigos.length - MAX_TURNOS);
}

/**
 * El estado de la cadena en una sola llamada, en castellano.
 *
 * Pensado para que se lea de un vistazo y responda la pregunta que el admin
 * hace de verdad --"¿por qué está contestando raro?"-- sin abrir logs.
 */
export function saludDeLaCadena(): {
  estado: "bien" | "degradado" | "critico";
  resumen: string;
  turnosUltimaHora: number;
  porcentajeConRespaldo: number;
  modeloMasUsado: string | null;
  castigadosAhora: Array<{ proveedor: string; clase: string; minutosRestantes: number; motivo: string }>;
} {
  const ahora = Date.now();
  const recientes = turnos.filter((t) => ahora - t.cuando < VENTANA_MS);
  const activos = castigos
    .filter((c) => c.hasta > ahora)
    // Un proveedor puede aparecer varias veces: interesa su castigo más largo.
    .reduce((acc: ProveedorCastigado[], c) => {
      const yaEsta = acc.find((x) => x.proveedor === c.proveedor);
      if (!yaEsta) acc.push(c);
      else if (c.hasta > yaEsta.hasta) Object.assign(yaEsta, c);
      return acc;
    }, []);

  const conRespaldo = recientes.filter((t) => t.fueRespaldo).length;
  const porcentaje = recientes.length > 0 ? Math.round((conRespaldo / recientes.length) * 100) : 0;

  const cuenta = new Map<string, number>();
  for (const t of recientes) {
    const k = `${t.proveedor}/${t.modelo}`;
    cuenta.set(k, (cuenta.get(k) || 0) + 1);
  }
  const modeloMasUsado = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // El umbral no es un número redondo: si MÁS DE LA MITAD de los turnos los
  // atiende un respaldo, el proveedor principal no está sirviendo y eso ya no
  // es un pico, es el estado normal.
  const estado: "bien" | "degradado" | "critico" =
    porcentaje > 50 || activos.length >= 3 ? "critico"
    : porcentaje > 15 || activos.length > 0 ? "degradado"
    : "bien";

  const castigadosAhora = activos.map((c) => ({
    proveedor: c.proveedor,
    clase: c.clase,
    minutosRestantes: Math.max(1, Math.round((c.hasta - ahora) / 60000)),
    motivo: c.motivo,
  }));

  const quienesCastigados = castigadosAhora
    .map((c) => `${c.proveedor} (${c.clase}, ${c.minutosRestantes} min)`)
    .join(", ");

  let resumen: string;
  if (recientes.length === 0) {
    // ⚠️ Sin turnos NO quiere decir sin problemas, y decir "no hay nada que
    // medir" mientras hay proveedores apartados es justo el silencio que este
    // módulo existe para romper. Es más: cero turnos CON castigos es el peor
    // escenario posible -- puede significar que no contesta nadie.
    resumen = quienesCastigados
      ? `Sin turnos en la última hora, y hay proveedores apartados: ${quienesCastigados}.`
      : "Sin turnos en la última hora: no hay nada que medir todavía.";
  } else if (estado === "bien") {
    resumen = `${recientes.length} turnos en la última hora, atendidos por ${modeloMasUsado}. Nadie apartado.`;
  } else {
    resumen =
      `${porcentaje}% de los ${recientes.length} turnos de la última hora los atendió un modelo de respaldo`
      + (modeloMasUsado ? `; el que más contestó fue ${modeloMasUsado}` : "")
      + (quienesCastigados ? `. Apartados ahora: ${quienesCastigados}` : ".");
  }

  return {
    estado,
    resumen,
    turnosUltimaHora: recientes.length,
    porcentajeConRespaldo: porcentaje,
    modeloMasUsado,
    castigadosAhora,
  };
}

/** Solo para las pruebas: deja el registro en blanco. */
export function _reiniciarSaludDeLaCadena(): void {
  turnos.length = 0;
  castigos.length = 0;
}
