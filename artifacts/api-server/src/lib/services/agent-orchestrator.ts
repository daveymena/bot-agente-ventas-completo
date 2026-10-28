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
import { transporteConectado, enviarPartsAlCliente } from '../transporte-whatsapp';
import { tenantManager } from '../tenantManager';
import { checkMessageLimit } from '../../middleware/featureLimits';
import { db } from "@workspace/db";
import { conversations, messages } from "@workspace/db";
import { eq, and, gt, desc, inArray } from "drizzle-orm";
import { logger } from '../logger';
import { randomUUID } from 'node:crypto';

export interface AgentOrchestratorConfig {
  tenantId: string;
  enabled: boolean;
  processingIntervalMs: number;
}

export class AgentOrchestrator {
  private queue = getMessageQueue();
  /** Último error real al procesar un mensaje, para poder verlo desde /api/health.
   *  Sin esto, "el bot no contestó" solo se puede diagnosticar adivinando. */
  static ultimoError: { cuando: string; conversacion?: number; mensaje: string; donde?: string } | null = null;
  private configs: Map<string, AgentOrchestratorConfig> = new Map();
  private processing = false;
  private intervalId?: NodeJS.Timeout;
  private recuperacionProgramada = false;
  private ultimoRefrescoCola = 0;
  private readonly workerId = `${process.env.HOSTNAME || "worker"}:${process.pid}:${randomUUID()}`;

  /**
   * Cuántas conversaciones se atienden a la vez. Antes era UNA para toda la
   * plataforma: cada respuesta tarda varios segundos (espera de agrupado +
   * IA), así que con varios negocios activos el último cliente de la fila
   * esperaba la suma de todos. Dentro de una misma conversación sigue siendo
   * de a uno (ver `enCurso`).
   */
  private readonly maxEnParalelo = Math.min(128, Math.max(1, Math.floor(Number(process.env.AGENT_CONCURRENCIA) || 4)));
  private activos = 0;
  private claimHeartbeats = new Map<string, NodeJS.Timeout>();
  /** Conversaciones que se están atendiendo ahora mismo. */
  private enCurso = new Set<string>();

  private static claveDe(m: QueuedMessage): string {
    return m.conversationId != null ? `c${m.conversationId}` : `t${m.tenantId}:${m.phone || m.from}`;
  }

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
      // La recuperación cubre a TODOS los negocios: antes solo corría para el
      // tenant configurado acá (el 1), así que un mensaje perdido en un
      // reinicio de cualquier otro negocio no se recuperaba nunca.
      if (!this.recuperacionProgramada) {
        this.recuperacionProgramada = true;
        setTimeout(() => { this.recuperarSinResponder().catch(() => {}); }, 20_000).unref?.();
        // Y cada 5 minutos: un mensaje puede quedarse sin responder por
        // cualquier motivo (el proveedor de IA falló, WhatsApp estaba
        // reconectando, un error puntual), no solo por un reinicio. Barrer
        // periódicamente hace que el sistema se cure solo en vez de depender
        // de que alguien mire. Encolar de nuevo es barato: si la conversación
        // ya fue respondida, no entra.
        setInterval(() => { this.recuperarSinResponder().catch(() => {}); }, 5 * 60_000).unref?.();
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
  private async recuperarSinResponder(): Promise<void> {
    if (!this.queue.canRecoverUnanswered()) return;
    try {
      // Se usa el constructor de consultas de Drizzle, no SQL crudo con
      // db.execute: db.execute no se usa en ningún otro lado de este código,
      // así que la forma exacta de su resultado (¿`.rows`? ¿el array pelado?)
      // no está probada acá -- y una recuperación que falla en silencio es
      // peor que no tenerla, porque da falsa tranquilidad.
      const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recientes = await db
        .select({ id: conversations.id, phone: conversations.contactPhone, tenantId: conversations.tenantId })
        .from(conversations)
        // Solo las que atiende el bot: las que tomó una persona no se tocan.
        .where(and(gt(conversations.lastMessageAt, hace24h), eq(conversations.status, "ai")))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(100);

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
        if (c.tenantId == null) continue;
        // Solo WhatsApp: esta cola contesta por WhatsApp. Una conversación de
        // Messenger, Instagram o comentarios ("fb:123", "ig_comment:9") se
        // encolaba igual y se intentaba mandar a "fb:123@s.whatsapp.net".
        if (/^(fb|ig|fb_comment|ig_comment):/.test(String(c.phone || ""))) continue;
        // Ya está en la cola o atendiéndose: no se duplica la respuesta.
        if (this.enCurso.has(`c${c.id}`) || this.queue.pendingForConversation(Number(c.id)).length) continue;

        this.queue.enqueue({
          tenantId: String(c.tenantId),
          from: `${c.phone}@s.whatsapp.net`,
          to: String(c.tenantId),
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
        logger.warn({ recuperadas }, "[AgentOrchestrator] Conversaciones sin responder recuperadas");
      }
    } catch (e: any) {
      logger.error({ err: e?.message }, "[AgentOrchestrator] No se pudieron recuperar los mensajes sin responder");
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

    // En despliegue separado, WhatsApp Gateway persiste los mensajes y este
    // worker los incorpora sin reiniciarse. En modo combinado no agrega nada
    // porque los mensajes ya están en memoria.
    const stats = this.queue.getStats();
    if (stats.persistence === "postgres" && stats.pending < 10 && Date.now() - this.ultimoRefrescoCola >= 1000) {
      try {
        await this.queue.refreshFromStore();
        this.ultimoRefrescoCola = Date.now();
      } catch (error) {
        logger.error({ error }, "[AgentOrchestrator] No se pudieron refrescar mensajes persistidos");
        this.intervalId = setTimeout(() => this.runProcessingLoop(), 5000);
        return;
      }
    }

    try { await this.queue.flush(); }
    catch (error) {
      logger.error({ error }, "[AgentOrchestrator] Outbox no durable: se pausa el consumo");
      this.intervalId = setTimeout(() => this.runProcessingLoop(), 5000);
      return;
    }
    if (!this.processing) return;

    // Se llenan los lugares libres con conversaciones que NO se estén
    // atendiendo ya. Cada una corre por su cuenta; el bucle no las espera.
    while (this.activos < this.maxEnParalelo) {
      const aceptar = (m: QueuedMessage) => !this.enCurso.has(AgentOrchestrator.claveDe(m)) && this.configs.get(m.tenantId)?.enabled !== false;
      const message = process.env.VENTASPRO_PROCESS_ROLE === "worker"
        ? await this.queue.claimNextFromStore(this.workerId)
        : this.queue.dequeue(aceptar);
      if (!message) break;
      if (!aceptar(message)) {
        this.queue.posponer(message.id, 5_000);
        continue;
      }
      const clave = AgentOrchestrator.claveDe(message);
      this.activos++;
      this.enCurso.add(clave);
      const leaseHeartbeat = process.env.VENTASPRO_PROCESS_ROLE === "worker"
        ? setInterval(() => {
          void this.queue.renewClaim(message.id, this.workerId).catch(error =>
            logger.error({ error, queueId: message.id }, "[AgentOrchestrator] No se pudo renovar el reclamo del mensaje"),
          );
        }, 30_000)
        : undefined;
      leaseHeartbeat?.unref?.();
      if (leaseHeartbeat) this.claimHeartbeats.set(message.id, leaseHeartbeat);
      this.processMessage(message)
        .catch((error) => {
          this.queue.markFailed(message.id);
          logger.error({ error }, '[AgentOrchestrator] Loop error');
        })
        .finally(() => {
          if (leaseHeartbeat) clearInterval(leaseHeartbeat);
          this.claimHeartbeats.delete(message.id);
          this.activos--;
          this.enCurso.delete(clave);
        });
    }

    // Esperar un poco antes de la siguiente vuelta para no saturar
    const tenants = Array.from(this.configs.values()).filter(t => t.enabled);
    const interval = tenants.length > 0 ? Math.min(...tenants.map(t => t.processingIntervalMs)) : 1000;
    
    this.intervalId = setTimeout(() => this.runProcessingLoop(), interval);
  }

  /**
   * Procesa el siguiente mensaje en la cola
   */
  private async processMessage(message: QueuedMessage): Promise<void> {
    const tenantIdNum = Number(message.tenantId);
    if (!Number.isFinite(tenantIdNum)) {
      logger.warn(`[AgentOrchestrator] tenantId inválido: "${message.tenantId}"`);
      this.queue.markFailed(message.id);
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
    if (!transporteConectado(tenantIdNum)) {
      // Se POSPONE, no se deja "no procesando": `dequeue` devuelve siempre el
      // primer pendiente, así que un mensaje de un negocio desconectado
      // volvía a salir primero en cada vuelta y trababa la cola de TODOS los
      // negocios mientras ese WhatsApp siguiera caído.
      const edadMs = Date.now() - new Date(message.createdAt).getTime();
      if (edadMs > 24 * 60 * 60 * 1000) {
        logger.warn({ tenantId: tenantIdNum, queueId: message.id }, '[AgentOrchestrator] WhatsApp desconectado más de 24h: se descarta el mensaje (queda guardado en la base)');
        this.queue.markProcessed(message.id);
        return;
      }
      logger.debug({ tenantId: tenantIdNum }, '[AgentOrchestrator] Transporte de WhatsApp no conectado para este tenant, se reintenta en 15s');
      this.queue.posponer(message.id, 15_000);
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
        ? await this.getConversationById(message.conversationId, tenantIdNum)
        : await this.getOrCreateConversation(message.tenantId, phone);
      
      if (!convo) {
        logger.error(`[AgentOrchestrator] No se pudo obtener conversación para ${message.from}`);
        this.queue.markFailed(message.id);
        return;
      }

      // La conversación la atiende una PERSONA (el dueño la tomó desde el
      // panel, o el motor la escaló): el bot no contesta. El chequeo existía
      // en el whatsapp.ts viejo (`if (convo.status === "ai")`) y se perdió al
      // pasar a cola + orquestador, así que el panel mostraba "Humano" y el
      // bot le seguía escribiendo al cliente por encima de la persona.
      if ((convo as any).status === "human") {
        logger.info({ conversationId: convo.id }, '[AgentOrchestrator] Conversación en manos de una persona: el bot no responde');
        for (const m of [message, ...this.queue.pendingForConversation(convo.id, message.id)]) this.queue.markProcessed(m.id);
        return;
      }

      // Del otro lado hay un CHATBOT (menús, cargas técnicas, "voy a
      // comunicarte con un asesor"): bot contra bot gasta IA, puede quedar en
      // bucle y es mensajería automática que WhatsApp castiga. Se deja de
      // contestar y se le avisa al dueño una vez. Ver lib/contraparte-bot.ts
      // (caso real: conversación 3 del 07-10).
      if (convo) {
        try {
          const ultimos = await db
            .select({ content: messages.content })
            .from(messages)
            .where(and(eq(messages.conversationId, convo.id), eq(messages.role, "customer")))
            .orderBy(desc(messages.createdAt))
            .limit(10);
          const { pareceUnBot } = await import('../contraparte-bot');
          const v = pareceUnBot(ultimos.map((m: { content: unknown }) => String(m.content || "")).reverse());
          if (v.bot) {
            await db.update(conversations).set({ status: "human" } as any).where(eq(conversations.id, convo.id));
            logger.warn({ conversationId: convo.id, motivo: v.motivo }, '[AgentOrchestrator] La contraparte es un bot automático: el vendedor deja de responder');
            try {
              const { avisarAlDueno } = await import('../avisos');
              await avisarAlDueno(
                Number((convo as any).tenantId),
                `🤖 *Bot detectado* — ${(convo as any).contactName || "un número"} parece un chatbot automático (${v.motivo}). El vendedor dejó de responderle; si es una persona, devolvé la conversación a la IA desde el panel.`,
              );
            } catch { /* avisar no puede frenar nada */ }
            for (const m of [message, ...this.queue.pendingForConversation(convo.id, message.id)]) this.queue.markProcessed(m.id);
            return;
          }
        } catch (e) {
          logger.warn({ err: String(e) }, '[AgentOrchestrator] no se pudo revisar si la contraparte es un bot (se sigue normal)');
        }
      }

      // Una persona suele mandar varios mensajes seguidos. Esperar un instante
      // de silencio permite que Atlas lea el hilo completo y responda una sola
      // vez, en vez de interrumpir al cliente con una respuesta prematura.
      // El mensaje ya está guardado en DB, así que esta espera no pierde nada.
      const agrupados = [message];
      if (!message.parts && message.body && message.conversationId) {
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        agrupados.push(...this.queue.pendingForConversation(message.conversationId, message.id));
      }

      // ── Redactar ────────────────────────────────────────────────────────
      // Si un intento anterior ya obtuvo la respuesta y solo falló el envío,
      // se reusa. Volver a llamar al agente lo haria guardar OTRA respuesta en
      // la base sin haber entregado la primera.
      let partes = message.parts as AgentReplyPart[] | undefined;

      if (!partes) {
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
        partes = reply.parts as AgentReplyPart[];
        // Se guardan ANTES de enviar: si el envio falla, el reintento ya no
        // necesita al agente.
        this.queue.guardarPartes(message.id, partes);
      } else {
        logger.info({ queueId: message.id }, '[AgentOrchestrator] Reenviando respuesta ya redactada');
      }

      await this.queue.flush();

      // ── Enviar ──────────────────────────────────────────────────────────
      const pushName = convo.contactName || phone;
      if (process.env.VENTASPRO_PROCESS_ROLE === "worker" &&
          !await this.queue.renewClaim(message.id, this.workerId)) {
        throw new Error("El worker perdió el reclamo del mensaje antes del envío; no se enviará una respuesta duplicada.");
      }
      await enviarPartsAlCliente(tenantIdNum, phone, pushName, partes, message.from, message.id);

      // NO se persiste aquí: runAgentReply ya guardó la respuesta con
      // saveAgentMessage (con su metadata y actualizando lastMessage) en todos
      // sus caminos de salida. Guardarla otra vez dejaba CADA respuesta al
      // cliente duplicada en la BD, y como el historial alimenta el contexto de
      // la IA, el agente se veía a sí mismo repitiéndose turno tras turno.
      // Marcar como procesado solo si se envió respuesta exitosamente
      for (const recibido of agrupados) this.queue.markProcessed(recibido.id);
      await this.queue.flush();

      logger.info({
        queueId: message.id,
        tenantId: message.tenantId,
      }, '[AgentOrchestrator] Message processed successfully');

    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);

      // Caídas o saturación del gateway no gastan los tres reintentos del
      // mensaje: se conserva la respuesta ya redactada y se vuelve a intentar.
      if (detalle.startsWith("WHATSAPP_GATEWAY_RETRYABLE:")) {
        this.queue.posponer(message.id, 30_000);
        logger.warn({ tenantId: message.tenantId, queueId: message.id }, "[AgentOrchestrator] Gateway temporalmente no disponible; respuesta conservada para reintento");
        return;
      }

      // ── Cortes que se resuelven SOLOS con el tiempo ─────────────────────
      //
      // El tope de mensajes/hora de WhatsApp y la pausa de proteccion del
      // numero no son fallos: son frenos a proposito. Pero llegaban aca como
      // una excepcion cualquiera, se gastaban los tres reintentos en segundos
      // y el mensaje del cliente se perdia para siempre, en silencio.
      //
      // Medido el 2026-08-25 en una tanda de pruebas: tras ~35 mensajes
      // seguidos el bot dejo de responder y no volvio. En produccion eso es un
      // cliente que escribe y nunca recibe nada.
      //
      // Se pospone sin gastar reintento: el tope se libera con el reloj, no
      // insistiendo.
      const esFrenoTemporal = /l[ií]mite de \d+ mensajes|Env[ií]os en pausa de protecci[oó]n/i.test(detalle);
      if (esFrenoTemporal) {
        const ESPERA_MS = 5 * 60 * 1000;
        this.queue.posponer(message.id, ESPERA_MS);
        AgentOrchestrator.ultimoError = {
          cuando: new Date().toISOString(),
          conversacion: message.conversationId,
          mensaje: detalle.slice(0, 300),
          donde: "envio pospuesto 5 min (freno de proteccion, no es un fallo)",
        };
        logger.warn({
          queueId: message.id,
          tenantId: message.tenantId,
          detalle,
        }, '[AgentOrchestrator] Envío frenado por protección: se reintenta en 5 min, sin perder el mensaje');
        return;
      }

      logger.error({
        error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
        errorString: String(error),
        queueId: message.id,
        tenantId: message.tenantId,
      }, '[AgentOrchestrator] Failed to process message');
      // El stack, no solo el mensaje: "Maximum call stack size exceeded" sin
      // stack no dice NADA sobre dónde está la recursión, y adivinar cuesta un
      // despliegue por intento. Se guardan las primeras líneas propias del
      // proyecto (se descartan las de node_modules, que son ruido).
      const stack = error instanceof Error && error.stack
        ? error.stack.split(/\r?\n/).filter((l) => !l.includes("node_modules")).slice(0, 8).join(" | ").slice(0, 900)
        : "";
      AgentOrchestrator.ultimoError = {
        cuando: new Date().toISOString(),
        conversacion: message.conversationId,
        mensaje: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        donde: stack,
      };

      this.queue.markFailed(message.id);
    }
  }

  /**
   * Obtiene o crea una conversación para un mensaje
   */
  /** La conversación exacta que resolvió el MessageHandler, por id. */
  private async getConversationById(
    id: number, tenantId: number,
  ): Promise<{ id: number; currentStage: string | null; contactName: string; contactPhone: string } | null> {
    try {
      const [row] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId))).limit(1);
      return row ?? null;
    } catch (e: any) {
      logger.error({ err: e?.message, conversationId: id }, "[AgentOrchestrator] No se pudo leer la conversación");
      return null;
    }
  }

  private async getOrCreateConversation(tenantId: string, phone: string): Promise<{ id: number; currentStage: string | null; contactName: string; contactPhone: string } | null> {
    try {
      const tenantIdNum = typeof tenantId === 'string' ? parseInt(tenantId) : tenantId;

      // Buscar conversación existente (filtrar por tenantId + phone).
      // El mismo número puede estar guardado en dígitos (como lo entrega
      // Baileys) o como lo escribió una persona: se comparan las dos formas o
      // el cliente termina con dos conversaciones y media memoria en cada una.
      const { variantesDeTelefono, normalizarTelefono } = await import("../customer-profile");
      const existing = await db.select().from(conversations)
        .where(and(
          inArray(conversations.contactPhone, variantesDeTelefono(phone)),
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
        // Se GUARDA normalizado: una sola forma en la base de acá en adelante.
        contactPhone: normalizarTelefono(phone) || phone,
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
    this.processing = false;
    for (const heartbeat of this.claimHeartbeats.values()) clearInterval(heartbeat);
    this.claimHeartbeats.clear();
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
      active: this.activos,
      concurrency: this.maxEnParalelo,
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
