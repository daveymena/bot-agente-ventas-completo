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
import { conversations, messages } from "@workspace/db";
import { eq, and, gt, desc } from "drizzle-orm";
import { logger } from '../logger';

export interface AgentOrchestratorConfig {
  tenantId: string;
  enabled: boolean;
  processingIntervalMs: number;
}

export class AgentOrchestrator {
  private queue = getMessageQueue();
  /** Último error real al procesar un mensaje, para poder verlo desde /api/health.
   *  Sin esto, "el bot no contestó" solo se puede diagnosticar adivinando. */
  static ultimoError: { cuando: string; conversacion?: number; mensaje: string } | null = null;
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
      // Los 20s son para que WhatsApp termine de reconectar: si se encolan
      // antes, processNextMessage los difiere por "no conectado" y vuelven a
      // quedar esperando.
      const idNum = Number(tenantId);
      if (Number.isFinite(idNum)) {
        setTimeout(() => { this.recuperarSinResponder(idNum).catch(() => {}); }, 20_000).unref?.();
        // Y cada 5 minutos: un mensaje puede quedarse sin responder por
        // cualquier motivo (el proveedor de IA falló, WhatsApp estaba
        // reconectando, un error puntual), no solo por un reinicio. Barrer
        // periódicamente hace que el sistema se cure solo en vez de depender
        // de que alguien mire. Encolar de nuevo es barato: si la conversación
        // ya fue respondida, no entra.
        setInterval(() => { this.recuperarSinResponder(idNum).catch(() => {}); }, 5 * 60_000).unref?.();
      }
    }
  }

  /**
   * Inicia el bucle de procesamiento
   */
  /**
   * Recupera los mensajes de clientes que quedaron SIN responder.
   *
   * La cola vive en memoria (`private queue: QueuedMessage[]`), así que un
   * reinicio del contenedor la borra entera. Todo mensaje que estuviera
   * esperando turno en ese momento se pierde en silencio: el cliente escribe,
   * el mensaje queda guardado en la base, y nadie le contesta nunca.
   *
   * Pasó de verdad (17-08-2026): un cliente de Guatemala llegó de un anuncio
   * pago con "¡Hola! Quiero más información" y no recibió respuesta -- el
   * despliegue reinició el proceso justo con su mensaje en la cola. Es la
   * peor forma de perder plata: se paga el clic, el cliente escribe, y del
   * otro lado hay silencio.
   *
   * Al arrancar se buscan las conversaciones cuyo ÚLTIMO mensaje es del
   * cliente (o sea, quedaron sin respuesta) dentro de las últimas 24h, y se
   * vuelven a encolar. Más viejo que eso no se recupera: contestarle a
   * alguien dos días después es peor que no contestarle.
   */
  private async recuperarSinResponder(tenantId: number): Promise<void> {
    try {
      // Se usa el constructor de consultas de Drizzle, no SQL crudo con
      // db.execute: db.execute no se usa en ningún otro lado de este código,
      // así que la forma exacta de su resultado (¿`.rows`? ¿el array pelado?)
      // no está probada acá -- y una recuperación que falla en silencio es
      // peor que no tenerla, porque da falsa tranquilidad.
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recientes = await db
        .select({ id: conversations.id, phone: conversations.contactPhone })
        .from(conversations)
        .where(and(
          eq(conversations.tenantId, tenantId),
          gt(conversations.lastMessageAt, hace24h),
        ))
        .orderBy(conversations.lastMessageAt)
        .limit(30);

      let recuperadas = 0;
      for (const c of recientes) {
        // ¿El último mensaje es del cliente? Entonces quedó sin responder.
        const [ultimo] = await db
          .select({ role: messages.role })
          .from(messages)
          .where(eq(messages.conversationId, c.id))
          .orderBy(desc(messages.createdAt), desc(messages.id))
          .limit(1);
        if (ultimo?.role !== "customer") continue;

        this.queue.enqueue({
          tenantId: String(tenantId),
          from: `${c.phone}@s.whatsapp.net`,
          to: String(tenantId),
          body: "",                       // el agente lee el historial de la BD
          timestamp: new Date(),
          messageId: `recuperado_${c.id}_${Date.now()}`,
          isGroup: false,
          conversationId: Number(c.id),
          phone: String(c.phone),
        });
        recuperadas++;
      }
      if (recuperadas > 0) {
        logger.warn({ tenantId, recuperadas }, "[AgentOrchestrator] Conversaciones sin responder recuperadas");
      }
    } catch (e: any) {
      logger.error({ err: e?.message, tenantId }, "[AgentOrchestrator] No se pudieron recuperar los mensajes sin responder");
    }
  }

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
      AgentOrchestrator.ultimoError = {
        cuando: new Date().toISOString(),
        conversacion: message.conversationId,
        mensaje: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      };

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
