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
import { type AgentReplyPart } from '../whatsapp-singleton';
import { getWhatsAppForTenant } from '../whatsapp-factory';
import { tenantManager } from '../tenantManager';
import { checkMessageLimit } from '../../middleware/featureLimits';
import { db } from "@workspace/db";
import { conversations } from "@workspace/db";
import { eq, and } from "drizzle-orm";
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
    // Ejecutar el loop en background (no esperar)
    this.runProcessingLoop().catch(error => {
      logger.error({ error }, '[AgentOrchestrator] Fatal error in processing loop');
      this.processing = false;
      // Reintentar en 5 segundos
      setTimeout(() => this.startProcessing(), 5000);
    });
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

    const tenantIdNum = Number(message.tenantId);
    if (!Number.isFinite(tenantIdNum)) {
      logger.warn(`[AgentOrchestrator] tenantId inválido: "${message.tenantId}"`);
      return;
    }

    // Antes esto chequeaba whatsapp.isConnected() sobre el SINGLETON (proxy
    // fijo al tenant por defecto, ver whatsapp-singleton.ts) sin importar de
    // qué tenant era este mensaje -- si el tenant 1 tenía WhatsApp conectado
    // pero el tenant 2 no, un mensaje del tenant 2 se procesaba igual. Peor
    // aún: la respuesta se enviaba por whatsapp.sendAgentParts (mismo
    // singleton), o sea, el cliente del tenant 2 recibía la respuesta desde
    // el NÚMERO DE WHATSAPP DEL TENANT 1. Ahora usa la instancia real de
    // ESE tenant en ambos pasos.
    const waInstance = getWhatsAppForTenant(tenantIdNum);
    if (!waInstance.isConnected()) {
      logger.debug({ tenantId: tenantIdNum }, '[AgentOrchestrator] WhatsApp not connected for this tenant, deferring message processing');
      message.processing = false;
      return;
    }

    // Límite de mensajes del plan: acá es donde realmente pasa el tráfico
    // (mensajes de clientes por WhatsApp), no en el dashboard. Antes no
    // existía ningún chequeo real -- cualquier tenant, sin importar el plan
    // (incluida la prueba gratis de 30 mensajes), tenía respuestas de IA
    // ilimitadas. Si se alcanzó el límite, el mensaje se descarta (no se
    // reintenta en bucle) y se loguea -- el cliente no recibe respuesta
    // hasta que el dueño actualice su plan.
    const tenantForLimit = await tenantManager.getTenantById(tenantIdNum);
    const limitCheck = await checkMessageLimit(tenantIdNum, tenantForLimit?.plan || "basic");
    if (!limitCheck.allowed) {
      logger.warn({ tenantId: tenantIdNum, current: limitCheck.current, limit: limitCheck.limit }, '[AgentOrchestrator] Monthly message limit reached, dropping message');
      this.queue.markProcessed(message.id);
      return;
    }

    try {
      logger.info({
        queueId: message.id,
        tenantId: message.tenantId,
        from: message.from,
      }, '[AgentOrchestrator] Processing message');

      // La conversación viene resuelta desde el MessageHandler. Deducirla otra
      // vez del JID crudo era lo que partía al cliente en dos hilos: los
      // mensajes entrantes iban a la conversación del número REAL y las
      // respuestas a otra creada con el id interno de WhatsApp. Solo se
      // recalcula si el mensaje viene sin ella (colas viejas, otros canales).
      const phone = message.phone || message.from.split('@')[0];
      const convo = message.conversationId
        ? await this.getConversationById(message.conversationId)
        : await this.getOrCreateConversation(message.tenantId, phone);
      
      if (!convo) {
        logger.error(`[AgentOrchestrator] No se pudo obtener conversación para ${message.from}`);
        this.queue.markFailed(message.id);
        return;
      }

      // Ejecutar el agente (lógica de IA) - usa runAgentReply con conversationId
      const reply = await runAgentReply(convo.id);

      // Si la respuesta es nula o no tiene partes, no hay nada que enviar
      if (!reply || !reply.parts) {
        logger.warn({
          conversationId: convo.id,
          queueId: message.id,
        }, '[AgentOrchestrator] Agent returned null reply or no parts');
        this.queue.markProcessed(message.id);
        return;
      }

      // Enviar respuesta via WhatsApp (Soporta Texto y Tarjetas Multimedia)
      const pushName = convo.contactName || phone;
      await waInstance.sendAgentParts(phone, pushName, reply.parts as AgentReplyPart[], message.from);

      // NO se persiste aquí: runAgentReply ya guardó la respuesta con
      // saveAgentMessage (con su metadata y actualizando lastMessage) en todos
      // sus caminos de salida. Guardarla otra vez dejaba CADA respuesta al
      // cliente duplicada en la BD, y como el historial alimenta el contexto de
      // la IA, el agente se veía a sí mismo repitiéndose turno tras turno.
      // Marcar como procesado solo si se envió respuesta exitosamente
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
  /** La conversación exacta que resolvió el MessageHandler, por id. */
  private async getConversationById(
    id: number,
  ): Promise<{ id: number; currentStage: string | null; contactName: string; contactPhone: string } | null> {
    try {
      const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      return row ?? null;
    } catch (e: any) {
      logger.error({ err: e?.message, conversationId: id }, "[AgentOrchestrator] No se pudo leer la conversación");
      return null;
    }
  }

  private async getOrCreateConversation(tenantId: string, phone: string): Promise<{ id: number; currentStage: string | null; contactName: string; contactPhone: string } | null> {
    try {
      const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId) : tenantId;

      // Buscar conversación existente (filtrar por tenantId + phone)
      const existing = await db.select().from(conversations)
        .where(and(
          eq(conversations.contactPhone, phone),
          eq(conversations.tenantId, tenantIdNum)
        ))
        .limit(1);

      if (existing.length > 0) {
        return existing[0];
      }

      // Si no existe, crear una nueva (el MessageHandler debería haber hecho esto, pero por si acaso)
      logger.warn(`[AgentOrchestrator] Conversación no encontrada para ${phone}, creando nueva...`);
      const { addTenantToInsert } = await import("../tenantManager");

      const [convo] = await db.insert(conversations).values(addTenantToInsert({
        contactName: phone,
        contactPhone: phone,
        status: "ai",
        currentStage: "greeting",
        unreadCount: 0
      }, tenantIdNum)).returning();

      return convo || null;

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
