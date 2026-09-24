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
import { eq, and, gt, inArray } from "drizzle-orm";
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
    phone?: string;
    fromMe: boolean;
    messageId: string;
    body: string;
    timestamp: Date;
    pushName?: string;
    /** Anuncio de Facebook/Instagram del que llegó este contacto, si llegó de uno. */
    anuncio?: { titulo: string; cuerpo: string; url: string; anuncioId: string };
    /** Texto del mensaje que el cliente citó al responder. Ver extraerMensajeCitado. */
    citado?: string;
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

    // ── LO QUE CONTESTÓ OTRO SE GUARDA, PERO NO SE RESPONDE ────────────────
    //
    // `fromMe` llega acá solo cuando el mensaje salió del número y NO lo mandó
    // este bot (whatsapp.ts ya descartó nuestro propio eco): o el dueño desde
    // su celular, o la IA de Meta atendiendo.
    //
    // Se guarda para que el historial esté completo --si Meta ya le dijo el
    // precio, este bot tiene que saberlo-- y se corta acá: NO se encola
    // respuesta. Observar no es contestar; dos IAs escribiéndole al mismo
    // cliente es peor que una sola.
    if (params.fromMe) {
      await this.registrarRespuestaAjena(params, tenantId);
      return;
    }

    try {
      // 1. Obtener o crear conversación
      // Preferir el número ya resuelto (params.phone) -- para JIDs @lid,
      // remoteJid NO es un teléfono real (ver whatsapp.ts). Solo si no
      // llega resuelto, se cae al parseo directo del JID (compatibilidad).
      // La misma función que usan la ruta de la API y el orquestador: tres
      // formas distintas de limpiar el número es como el mismo cliente
      // terminaba con dos conversaciones.
      const { normalizarTelefono, variantesDeTelefono } = await import("../customer-profile");
      const phone = normalizarTelefono(params.phone || params.remoteJid.split('@')[0]);
      const tenantIdNum = tenantId;
      
      let convo = (await db.select().from(conversations)
        .where(and(
          inArray(conversations.contactPhone, variantesDeTelefono(phone)),
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

        // ── ATRIBUCIÓN (GAP-1 / Fase 5) ────────────────────────────────────
        // Si el contacto llegó desde un anuncio de Meta/Instagram, se copia el
        // contexto al lead (adContext + source) para poder cruzar después con
        // payments y medir CAC/ROAS reales. Sin esto, el dato se quedaba
        // muerto en messages.metadata.
        if (lead?.id && params.anuncio) {
          try {
            const { attachAdContextToLead } = await import("../marketing-team/attribution");
            await attachAdContextToLead(lead.id, params.anuncio);
          } catch (err) {
            logger.error({ err }, '[MessageHandler] No se pudo adjuntar adContext al lead');
          }
        }
        
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

      // ¿Este mismo mensaje ya se guardó? (reenvío de WhatsApp tras reconectar)
      //
      // Al aceptar los mensajes tipo "append" —los que WhatsApp reenvía cuando
      // el bot vuelve— puede llegar uno que ya se había procesado antes del
      // reinicio. La deduplicación por id vive en memoria, así que un reinicio
      // la borra y no sirve para este caso. Se comprueba contra la base, que
      // es lo único que sobrevive.
      //
      // Ventana de 10 minutos: si el cliente escribe lo mismo dos veces con
      // horas de diferencia ("hola" hoy y mañana), son dos mensajes reales y
      // hay que contestar los dos.
      const hace10min = new Date(Date.now() - 10 * 60 * 1000);
      const [repetido] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(
          eq(messages.conversationId, convo.id),
          eq(messages.role, "customer"),
          eq(messages.content, params.body),
          gt(messages.createdAt, hace10min),
        ))
        .limit(1);
      if (repetido) {
        logger.info({ conversationId: convo.id }, "[MessageHandler] Mensaje ya recibido antes del reinicio — no se procesa de nuevo");
        return;
      }

      // 2. Guardar mensaje en base de datos
      // El anuncio del que vino se guarda con el mensaje: el agente lo lee para
      // saber qué producto le interesó al cliente, porque el texto que manda
      // Meta ("¡Hola! Quiero más información") es idéntico para todos.
      await db.insert(messages).values({
        conversationId: convo.id,
        role: "customer",
        content: params.body,
        stage: convo.currentStage,
        metadata: {
          ...(params.anuncio
            ? {
                adTitle: params.anuncio.titulo,
                adBody: params.anuncio.cuerpo,
                adUrl: params.anuncio.url,
                adId: params.anuncio.anuncioId,
              }
            : {}),
          ...(params.citado ? { citado: params.citado } : {}),
        },
      });

      if (params.anuncio) {
        logger.info({
          conversationId: convo.id,
          adTitle: params.anuncio.titulo,
          adUrl: params.anuncio.url,
        }, '[MessageHandler] Contacto llegó desde un anuncio');

        // Lead ya existente (conversación previa) sin contexto de anuncio:
        // adjuntarlo ahora para no perder la atribución.
        if (convo.leadId) {
          try {
            const existing = (await db
              .select({ id: leads.id, adContext: leads.adContext })
              .from(leads)
              .where(eq(leads.id, convo.leadId))
              .limit(1))[0];
            if (existing && !existing.adContext) {
              const { attachAdContextToLead } = await import("../marketing-team/attribution");
              await attachAdContextToLead(existing.id, params.anuncio);
            }
          } catch (err) {
            logger.error({ err }, '[MessageHandler] No se pudo adjuntar adContext a lead existente');
          }
        }
      }

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
        // La conversación ya está resuelta acá: se pasa para que el
        // orquestador NO la vuelva a deducir del JID y termine en otra.
        conversationId: convo.id,
        phone,
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
   * Guarda una respuesta que salió del número pero no la escribió este bot.
   *
   * ── Por qué se guarda con rol "agent" ─────────────────────────────────
   *
   * Porque para el cliente ES la respuesta del negocio, no importa quién la
   * haya tecleado. Y guardarla así hace que TODO lo que ya sabe leer el motor
   * la tome en cuenta sin tocar una línea más: `datosYaDichos` deja de creer
   * que falta contar el precio si Meta ya lo dijo, `no-repetir` no vuelve a
   * mandar lo mismo, y la métrica de tiempo de respuesta la cuenta como
   * atendida.
   *
   * Queda `metadata.origen: "externo"` para poder separarlas después --en el
   * panel, o para medir cuánto atendió Meta y cuánto este bot--, pero el rol
   * es el que hace que el sistema la entienda.
   *
   * ── Y NO se crea conversación si no existe ────────────────────────────
   *
   * Si no hay conversación, es un chat que el dueño arrancó él y del que no
   * sabemos nada. Crear una fila con un solo mensaje suelto ensucia el inbox
   * y el conteo de leads con contactos que nunca escribieron.
   */
  private async registrarRespuestaAjena(
    params: { remoteJid: string; phone?: string; messageId: string; body: string; timestamp: Date },
    tenantId: number,
  ): Promise<void> {
    try {
      const { normalizarTelefono, variantesDeTelefono } = await import("../customer-profile");
      const phone = normalizarTelefono(params.phone || params.remoteJid.split("@")[0]);
      if (!phone) return;

      const [convo] = await db.select().from(conversations)
        .where(and(
          inArray(conversations.contactPhone, variantesDeTelefono(phone)),
          eq(conversations.tenantId, tenantId),
        ))
        .limit(1);
      if (!convo) return;

      // Mismo mensaje dos veces: WhatsApp reenvía al reconectar.
      const [yaEsta] = await db.select({ id: messages.id }).from(messages)
        .where(and(
          eq(messages.conversationId, convo.id),
          eq(messages.content, params.body),
        ))
        .limit(1);
      if (yaEsta) return;

      await db.insert(messages).values({
        conversationId: convo.id,
        role: "agent",
        content: params.body,
        stage: convo.currentStage || "greeting",
        metadata: { origen: "externo", messageId: params.messageId } as any,
      });

      await db.update(conversations)
        .set({ lastMessage: params.body.substring(0, 200), lastMessageAt: dbNow() })
        .where(eq(conversations.id, convo.id));

      logger.info(`[MessageHandler] Respuesta externa observada en la conversación ${convo.id}`);
    } catch (err: any) {
      // Observar nunca puede romper la atención al cliente.
      logger.warn({ err: err?.message }, "[MessageHandler] No se pudo registrar la respuesta externa");
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
