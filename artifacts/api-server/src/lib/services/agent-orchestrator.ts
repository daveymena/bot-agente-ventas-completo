/**
 * AgentOrchestrator - Servicio independiente para procesar mensajes con IA
 * 
 * Responsabilidades:
 * 1. Consumir mensajes de la cola
 * 2. Ejecutar la lógica del agente (IA)
 * 3. Enviar respuestas via WhatsApp
 * 
 * NO debe recibir eventos directos de WhatsApp
 * Depende del MessageQueue para obtener mensajes
 */

import { getMessageQueue, QueuedMessage } from '../message-queue';
import { runAgentReply } from '../agent';
import { whatsapp } from '../whatsapp';
import { db } from "@workspace/db";
import { messages } from "@workspace/db";
import { conversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from '../logger';

export interface AgentOrchestratorConfig {
  tenantId: string;
  enabled: boolean;
  processingIntervalMs: number;
}

export class AgentOrchestrator {
  private queue = getMessageQueue();
  private configs: Map<string, AgentOrchestratorConfig> = new Map();
  private processing = false;
  private intervalId?: NodeJS.Timeout;

  constructor() {
    logger.info('[AgentOrchestrator] Initialized - IA processor worker');
  }

  /**
   * Configura un tenant para procesamiento
   */
  configureTenant(tenantId: string, config: Partial<AgentOrchestratorConfig>): void {
    const existing = this.configs.get(tenantId) || {
      tenantId,
      enabled: true,
      processingIntervalMs: 1000,
    };
    const updated = { ...existing, ...config };
    this.configs.set(tenantId, updated);

    // Iniciar procesamiento si hay tenants configurados
    if (updated.enabled && !this.processing) {
      this.startProcessing();
    }
  }

  /**
   * Inicia el bucle de procesamiento
   */
  private startProcessing(): void {
    if (this.processing) return;
    this.processing = true;
    this.runProcessingLoop();
    logger.info('[AgentOrchestrator] Sequential processing loop started');
  }

  private async runProcessingLoop(): Promise<void> {
    if (!this.processing) return;

    try {
      await this.processNextMessage();
    } catch (error) {
      logger.error({ error }, '[AgentOrchestrator] Loop error');
    }

    // Esperar un poco antes de la siguiente vuelta para no saturar
    const tenants = Array.from(this.configs.values()).filter(t => t.enabled);
    const interval = tenants.length > 0 ? Math.min(...tenants.map(t => t.processingIntervalMs)) : 1000;
    
    this.intervalId = setTimeout(() => this.runProcessingLoop(), interval);
  }

  /**
   * Procesa el siguiente mensaje en la cola
   */
  private async processNextMessage(): Promise<void> {
    const message = this.queue.dequeue();
    if (!message) {
      return;
    }

    const config = this.configs.get(message.tenantId);
    // Fuerza bruta: Permitir tenant 1 siempre
    const isEnabled = message.tenantId === "1" || message.tenantId === "0" || !!config?.enabled;

    if (!isEnabled) {
      logger.warn(`[AgentOrchestrator] Tenant ${message.tenantId} not enabled`);
      return;
    }

    try {
      logger.info({
        queueId: message.id,
        tenantId: message.tenantId,
        from: message.from,
      }, '[AgentOrchestrator] Processing message');

      // Obtener conversación basada en el número de teléfono
      const phone = message.from.split('@')[0];
      const convo = await this.getOrCreateConversation(message.tenantId, phone);
      
      if (!convo) {
        logger.error(`[AgentOrchestrator] No se pudo obtener conversación para ${message.from}`);
        this.queue.markFailed(message.id);
        return;
      }

      // Ejecutar el agente (lógica de IA) - usa runAgentReply con conversationId
      // El motor de ventas tiene prioridad absoluta para mantener la coherencia de Sofía
      const reply = await runAgentReply(convo.id);

      // Enviar respuesta via WhatsApp (Soporta Texto y Tarjetas Multimedia)
      if (reply && reply.parts) {
        const pushName = convo.contactName || phone;
        await whatsapp.sendAgentParts(phone, pushName, reply.parts, message.from);
        
        // Guardar cada parte en la BD para el historial del dashboard
        for (const part of reply.parts) {
          if (part.kind === 'text' && part.content) {
            await db.insert(messages).values({
              conversationId: convo.id,
              role: "agent",
              content: part.content,
              stage: convo.currentStage,
            });
          } else if (part.kind === 'card') {
            await db.insert(messages).values({
              conversationId: convo.id,
              role: "agent",
              content: `[CARD: ${part.productId}]`,
              stage: convo.currentStage,
            });
          }
        }
      }

      // Marcar como procesado
      this.queue.markProcessed(message.id);

      logger.info({
        queueId: message.id,
        tenantId: message.tenantId,
      }, '[AgentOrchestrator] Message processed successfully');

    } catch (error) {
      logger.error({
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        errorString: String(error),
        queueId: message.id,
        tenantId: message.tenantId,
      }, '[AgentOrchestrator] Failed to process message');

      this.queue.markFailed(message.id);
    }
  }

  /**
   * Obtiene o crea una conversación para un mensaje
   */
  private async getOrCreateConversation(tenantId: string, phone: string): Promise<{ id: number; currentStage: string | null; contactName: string; contactPhone: string } | null> {
    try {
      // Buscar conversación existente
      const existing = await db.select().from(conversations).where(eq(conversations.contactPhone, phone)).limit(1);
      
      if (existing.length > 0) {
        return existing[0];
      }
      
      // Si no existe, el MessageHandler debería haberla creado
      logger.warn(`[AgentOrchestrator] Conversación no encontrada para ${phone}, el MessageHandler debería haberla creado`);
      return null;
      
    } catch (error) {
      logger.error({ error }, '[AgentOrchestrator] Error getting/creating conversation');
      return null;
    }
  }

  /**
   * Detiene el procesamiento
   */
  stopProcessing(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId as any);
      this.intervalId = undefined;
      this.processing = false;
      logger.info('[AgentOrchestrator] Processing stopped');
    }
  }

  /**
   * Obtiene estadísticas del orquestador
   */
  getStats() {
    return {
      queue: this.queue.getStats(),
      processing: this.processing,
      configuredTenants: Array.from(this.configs.entries()).map(([id, cfg]) => ({
        tenantId: id,
        enabled: cfg.enabled,
      })),
    };
  }
}

// Singleton
let orchestratorInstance: AgentOrchestrator | null = null;

export function getAgentOrchestrator(): AgentOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new AgentOrchestrator();
  }
  return orchestratorInstance;
}
