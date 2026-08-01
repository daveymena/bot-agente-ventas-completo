/**
 * MessageHandler - Servicio independiente para recibir mensajes de WhatsApp
 * 
 * Responsabilidades:
 * 1. Escuchar eventos de Baileys (WhatsApp)
 * 2. Guardar mensajes en la base de datos
 * 3. Encolar mensajes para procesamiento por el AgentOrchestrator
 * 
 * NO debe contener lógica de IA ni procesamiento de respuestas
 */

import { getMessageQueue, QueuedMessage } from '../message-queue';
import { db } from "@workspace/db";
import { messages, conversations, leads } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { addTenantToInsert, type TenantContext } from '../tenantManager';
import { logger } from '../logger';
import { dbNow } from '../date-utils';

export interface MessageHandlerConfig {
  tenantId: string;
  enabled: boolean;
}

export class MessageHandler {
  private queue = getMessageQueue();
  private configs: Map<string, MessageHandlerConfig> = new Map();
  private tenantContext: TenantContext | null = null;

  constructor() {
    logger.info('[MessageHandler] Initialized - WhatsApp message receiver only');
  }

  /**
   * Configura un tenant para recibir mensajes
   */
  configureTenant(tenantId: string, config: Partial<MessageHandlerConfig>, tenantCtx?: TenantContext): void {
    const existing = this.configs.get(tenantId) || { tenantId, enabled: true };
    this.configs.set(tenantId, { ...existing, ...config });
    if (tenantCtx) {
      this.tenantContext = tenantCtx;
    }
  }

  /**
   * Maneja un mensaje recibido de WhatsApp
   * Este método es llamado por el evento 'messages.upsert' de Baileys
   */
  async handleIncomingMessage(params: {
    tenantId: string;
    remoteJid: string;
    fromMe: boolean;
    messageId: string;
    body: string;
    timestamp: Date;
    pushName?: string;
  }): Promise<void> {
    // El mensaje solo llega acá si vino por el socket de Baileys de ESE
    // tenant (whatsapp-factory.ts aísla un socket por tenant) -- eso YA es
    // la prueba de que el tenant es real y su instancia está activa. Antes
    // había un "isEnabled" que exigía un registro previo en `configs`
    // (poblado solo para el tenant "1" en el boot de app.ts) o comparar
    // contra el número 1 a fuerza bruta: cualquier OTRO tenant, aunque su
    // WhatsApp estuviera correctamente conectado y aislado, tenía sus
    // mensajes descartados en silencio acá.
    const tenantId = typeof params.tenantId === 'string' ? parseInt(params.tenantId) : params.tenantId;
    if (!Number.isFinite(tenantId)) {
      logger.warn(`[MessageHandler] tenantId inválido: "${params.tenantId}"`);
      return;
    }

    // Ignorar mensajes enviados por nosotros
    if (params.fromMe) {
      return;
    }

    try {
      // 1. Obtener o crear conversación
      // Limpiar el teléfono para evitar duplicados por formato (ej: +57 vs 57)
      const phone = params.remoteJid.split('@')[0].replace(/\D/g, ''); 
      const tenantIdNum = tenantId;
      
      let convo = (await db.select().from(conversations)
        .where(and(
          eq(conversations.contactPhone, phone),
          eq(conversations.tenantId, tenantIdNum)
        ))
        .limit(1))[0];
      
      if (!convo) {
        // Crear nueva conversación y lead si no existe
        const pushName = params.pushName || phone;
        
        const [lead] = await db.insert(leads).values(addTenantToInsert({ 
          name: pushName, 
          phone, 
          stage: "new", 
          value: "0", 
          source: "whatsapp" 
        }, tenantIdNum)).returning();
        
        const [created] = await db.insert(conversations).values(addTenantToInsert({ 
          contactName: pushName, 
          contactPhone: phone, 
          status: "ai", 
          currentStage: "greeting", 
          leadId: lead?.id, 
          unreadCount: 0 
        }, tenantIdNum)).returning();
        
        convo = created!;
        logger.info(`[MessageHandler] New conversation created: ${convo.id} for phone ${phone}`);
      }

      // 2. Guardar mensaje en base de datos
      await db.insert(messages).values({
        conversationId: convo.id,
        role: "customer",
        content: params.body,
        stage: convo.currentStage,
      });

      // dbNow(): en Postgres lastMessageAt exige un objeto Date, no un
      // string (ver date-utils.ts) — esto corre en CADA mensaje entrante
      // de WhatsApp, antes incluso de que el agente responda.
      await db.update(conversations).set({
        lastMessage: params.body,
        lastMessageAt: dbNow()
      }).where(eq(conversations.id, convo.id));


      // 3. Encolar para procesamiento
      const queuedMessage = this.queue.enqueue({
        tenantId: params.tenantId,
        from: params.remoteJid,
        to: params.tenantId, // El número del tenant
        body: params.body,
        timestamp: params.timestamp,
        messageId: params.messageId,
        isGroup: params.remoteJid.endsWith('@g.us'),
      });

      logger.info({
        tenantId: params.tenantId,
        messageId: params.messageId,
        queueId: queuedMessage.id,
        conversationId: convo.id,
      }, '[MessageHandler] Message received and queued');

    } catch (error) {
      logger.error({
        error,
        tenantId: params.tenantId,
        messageId: params.messageId,
      }, '[MessageHandler] Failed to handle incoming message');
    }
  }

  /**
   * Obtiene estadísticas de mensajes recibidos
   */
  getStats() {
    return {
      queue: this.queue.getStats(),
      configuredTenants: Array.from(this.configs.keys()),
    };
  }
}

// Singleton
let messageHandlerInstance: MessageHandler | null = null;

export function getMessageHandler(): MessageHandler {
  if (!messageHandlerInstance) {
    messageHandlerInstance = new MessageHandler();
  }
  return messageHandlerInstance;
}
