/**
 * Sistema de cola de mensajes para desacoplar WhatsApp del procesamiento IA
 * Permite que el receptor de mensajes de WhatsApp y el procesador de IA sean independientes
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';

export interface QueueStore {
  load(): Promise<QueuedMessage[]>;
  /** Bounded page for live consumers; avoids loading an unbounded outbox. */
  loadPending?(): Promise<QueuedMessage[]>;
  /** Atomic claim for multi-process consumers; only one worker owns a job. */
  claimNext?(workerId: string, leaseMs: number): Promise<QueuedMessage | null>;
  renewClaim?(messageId: string, workerId: string, claimVersion: number, leaseMs: number): Promise<boolean>;
  isRecoveryLeader?(): boolean;
  save(messages: QueuedMessage[]): Promise<void>;
  cleanup(before: Date): Promise<void>;
}

export interface QueuedMessage {
  id: string;
  tenantId: string;
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  messageId: string;
  isGroup: boolean;
  /**
   * Conversación YA resuelta por el MessageHandler, y el teléfono real.
   *
   * Sin esto, el orquestador volvía a deducir el teléfono con
   * `message.from.split("@")[0]` -- el JID crudo -- mientras el handler usaba
   * el número resuelto. Dos cálculos distintos sobre el mismo mensaje, y por
   * lo tanto DOS conversaciones para el mismo cliente: los mensajes entrantes
   * en una y las respuestas en la otra.
   *
   * Medido en producción (2026-08-16): conv 7 con 11 mensajes del cliente y
   * cero respuestas, conv 1 con 32 respuestas y cero mensajes del cliente,
   * emparejadas al mismo segundo. El agente respondía leyendo un hilo donde
   * el cliente nunca había preguntado nada, así que siempre saludaba.
   */
  conversationId?: number;
  phone?: string;
  processed: boolean;
  processing?: boolean;
  /** Monotonic PostgreSQL fencing token for a claimed job. */
  claimVersion?: number;
  retryCount: number;
  createdAt: Date;

  /**
   * La respuesta YA generada, cuando falló solo el envío.
   *
   * Sin esto, cada reintento volvía a llamar al agente -- y el agente GUARDA
   * su respuesta antes de que se envíe. Un fallo de envío dejaba hasta tres
   * respuestas casi idénticas en la base, ninguna entregada. Como el historial
   * alimenta el contexto de la IA, en el turno siguiente el agente se veía a
   * sí mismo repitiéndose y volvía a repetir.
   *
   * Con las partes guardadas, el reintento vuelve a ENVIAR, no a redactar.
   */
  parts?: unknown[];

  /**
   * No tocar este mensaje antes de este instante (epoch ms).
   *
   * Cuando el envío se corta por el tope horario de WhatsApp, reintentar en el
   * acto quema los tres intentos en segundos y el mensaje del cliente se
   * pierde para siempre. El tope se libera con el tiempo, no con insistencia.
   */
  noAntesDe?: number;
}

export type MessageQueueEvent = 
  | 'message:received'
  | 'message:processed'
  | 'message:failed'
  | 'queue:drained';

/**
 * Cola con outbox PostgreSQL en producción. Un gateway posee las sesiones;
 * los workers reclaman mensajes por conversación desde el outbox.
 */
export class MessageQueue extends EventEmitter {
  private queue: QueuedMessage[] = [];
  private byId = new Map<string, QueuedMessage>();
  private bySource = new Map<string, QueuedMessage>();
  private tenantTurns = new Map<string, number>();
  private turn = 0;
  private store?: QueueStore;
  private dirty = new Map<string, QueuedMessage>();
  private flushing?: Promise<void>;
  private persistenceError = false;

  /** Called before importing app.ts: no sockets or consumers exist yet. */
  async attachStore(store: QueueStore): Promise<void> {
    if (this.queue.length) throw new Error('Attach queue persistence before accepting messages');
    this.store = store;
    const initial = store.loadPending ? await store.loadPending() : await store.load();
    this.addRestored(initial);
  }

  /**
   * Mantiene un buffer acotado de mensajes persistidos desde otros procesos.
   * Los workers de producción reclaman el siguiente mensaje con `claimNext`,
   * que usa lease y `SKIP LOCKED`; este refresco solo precarga el buffer.
   */
  async refreshFromStore(): Promise<number> {
    if (!this.store) return 0;
    const restored = this.store.loadPending ? await this.store.loadPending() : await this.store.load();
    return this.addRestored(restored);
  }

  private addRestored(restored: QueuedMessage[]): number {
    let added = 0;
    for (const message of restored) {
      if (this.byId.has(message.id)) continue;
      message.timestamp = new Date(message.timestamp);
      message.createdAt = new Date(message.createdAt);
      message.processing = false; // previous process no longer owns the work
      this.queue.push(message);
      this.byId.set(message.id, message);
      if (message.messageId) this.bySource.set(JSON.stringify([message.tenantId, message.messageId]), message);
      added++;
    }
    return added;
  }

  async claimNextFromStore(workerId: string, leaseMs = 2 * 60_000): Promise<QueuedMessage | null> {
    if (!this.store?.claimNext) return this.dequeue();
    const message = await this.store.claimNext(workerId, leaseMs);
    if (!message) return null;
    message.timestamp = new Date(message.timestamp);
    message.createdAt = new Date(message.createdAt);
    message.processing = true;
    const existing = this.byId.get(message.id);
    if (existing) {
      Object.assign(existing, message);
      return existing;
    }
    this.queue.push(message);
    this.byId.set(message.id, message);
    if (message.messageId) this.bySource.set(JSON.stringify([message.tenantId, message.messageId]), message);
    return message;
  }

  async renewClaim(messageId: string, workerId: string, leaseMs = 2 * 60_000): Promise<boolean> {
    const message = this.byId.get(messageId);
    if (!message?.claimVersion || !this.store?.renewClaim) return false;
    return this.store.renewClaim(messageId, workerId, message.claimVersion, leaseMs);
  }

  canRecoverUnanswered(): boolean {
    return this.store?.isRecoveryLeader?.() ?? true;
  }

  private changed(message: QueuedMessage): void {
    if (!this.store) return;
    // Snapshot: later mutations must not change an in-flight database write.
    this.dirty.set(message.id, JSON.parse(JSON.stringify(message)));
    void this.flush().catch(() => { /* retained in dirty; next loop retries */ });
  }

  /** Durable barrier before generating/sending and acknowledging completion. */
  async flush(): Promise<void> {
    if (!this.store) return;
    if (this.flushing) {
      await this.flushing;
      if (this.dirty.size) return this.flush();
      return;
    }
    this.flushing = (async () => {
      while (this.dirty.size) {
        const batch = [...this.dirty.values()].slice(0, 500);
        await this.store!.save(batch);
        for (const m of batch) if (this.dirty.get(m.id) === m) this.dirty.delete(m.id);
      }
      this.persistenceError = false;
    })();
    try { await this.flushing; }
    catch (error) { this.persistenceError = true; throw error; }
    finally { this.flushing = undefined; }
  }
  private maxRetries = 3;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Encola un nuevo mensaje recibido
   */
  enqueue(message: Omit<QueuedMessage, 'id' | 'processed' | 'retryCount' | 'createdAt'>): QueuedMessage {
    const sourceKey = JSON.stringify([message.tenantId, message.messageId]);
    const duplicate = message.messageId ? this.bySource.get(sourceKey) : undefined;
    if (duplicate) return duplicate;
    const queuedMessage: QueuedMessage = {
      ...message,
      id: `msg_${randomUUID()}`,
      processed: false,
      retryCount: 0,
      createdAt: new Date(),
    };

    this.queue.push(queuedMessage);
    this.byId.set(queuedMessage.id, queuedMessage);
    if (message.messageId) this.bySource.set(sourceKey, queuedMessage);
    this.changed(queuedMessage);
    this.emit('message:received', queuedMessage);
    
    return queuedMessage;
  }

  /**
   * Obtiene el siguiente mensaje pendiente
   */
  dequeue(admitir?: (m: QueuedMessage) => boolean): QueuedMessage | null {
    const ahora = Date.now();
    const eligible = (m: QueuedMessage) =>
      !m.processed &&
      !m.processing &&
      m.retryCount < this.maxRetries &&
      // Un mensaje en espera por el tope horario no se toca hasta su hora.
      (!m.noAntesDe || m.noAntesDe <= ahora) &&
      // El orquestador salta las conversaciones que ya se están atendiendo:
      // dos respuestas en paralelo al mismo cliente se pisarían.
      (!admitir || admitir(m));
    // Rotate businesses; a burst from one tenant must not starve its neighbors.
    let pending: QueuedMessage | undefined;
    let earliest = Infinity;
    for (const m of this.queue) {
      const served = this.tenantTurns.get(m.tenantId) || 0;
      if (served < earliest && eligible(m)) { pending = m; earliest = served; }
    }
    if (pending) {
      pending.processing = true;
      this.tenantTurns.set(pending.tenantId, ++this.turn);
    }
    return pending || null;
  }

  /** Mensajes del mismo hilo que llegaron mientras se esperaba el turno. */
  pendingForConversation(conversationId: number, exceptId?: string): QueuedMessage[] {
    return this.queue.filter((m) =>
      m.conversationId === conversationId &&
      m.id !== exceptId &&
      !m.processed &&
      !m.processing &&
      m.retryCount < this.maxRetries,
    );
  }

  /**
   * Guarda la respuesta ya redactada para que el reintento la ENVÍE en vez de
   * volver a pedírsela al agente (que la guardaría de nuevo en la base).
   */
  guardarPartes(messageId: string, parts: unknown[]): void {
    const msg = this.byId.get(messageId);
    if (msg) { msg.parts = parts; this.changed(msg); }
  }

  /**
   * Posterga un mensaje SIN gastarle un reintento.
   *
   * Es para los cortes que se resuelven solos con el tiempo -- el tope de
   * mensajes por hora de WhatsApp, la pausa de protección del número. Gastar
   * los tres intentos en tres segundos contra un límite horario es perder el
   * mensaje del cliente por nada.
   */
  posponer(messageId: string, ms: number): void {
    const msg = this.byId.get(messageId);
    if (msg) {
      msg.noAntesDe = Date.now() + ms;
      msg.processing = false;
      this.changed(msg);
    }
  }

  /**
   * Marca un mensaje como procesado
   */
  markProcessed(messageId: string): void {
    const msg = this.byId.get(messageId);
    if (msg) {
      msg.processed = true;
      msg.processing = false;
      this.changed(msg);
      this.emit('message:processed', msg);
    }
  }

  /**
   * Marca un mensaje como fallido e incrementa reintentos
   */
  markFailed(messageId: string): void {
    const msg = this.byId.get(messageId);
    if (msg) {
      msg.retryCount++;
      msg.processing = false;
      msg.noAntesDe = Date.now() + Math.min(60_000, 1000 * 2 ** msg.retryCount);
      this.changed(msg);
      if (msg.retryCount >= this.maxRetries) {
        this.emit('message:failed', msg);
      }
    }
  }

  /**
   * Obtiene estadísticas de la cola
   */
  getStats() {
    return {
      total: this.queue.length,
      persistence: this.store ? 'postgres' : 'memory',
      persistenceHealthy: !this.persistenceError,
      unflushed: this.dirty.size,
      active: this.queue.filter(m => m.processing && !m.processed).length,
      oldestPendingMs: this.queue.reduce((oldest, m) => !m.processed && m.retryCount < this.maxRetries
        ? Math.max(oldest, Date.now() - m.createdAt.getTime()) : oldest, 0),
      pending: this.queue.filter(m => !m.processed && m.retryCount < this.maxRetries).length,
      processed: this.queue.filter(m => m.processed).length,
      failed: this.queue.filter(m => m.retryCount >= this.maxRetries).length,
    };
  }

  /**
   * Limpia mensajes antiguos procesados (más de 1 hora)
   */
  cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Los que agotaron los reintentos tampoco se vuelven a tocar nunca: sin
    // esto se acumulaban en memoria para siempre.
    this.queue = this.queue.filter(m => {
      const keep = (!m.processed && m.retryCount < this.maxRetries) || m.createdAt > oneHourAgo || this.dirty.has(m.id);
      if (!keep) {
        this.byId.delete(m.id);
        if (m.messageId) this.bySource.delete(JSON.stringify([m.tenantId, m.messageId]));
      }
      return keep;
    });
    if (this.store) void this.flush().then(() => this.store!.cleanup(oneHourAgo)).catch(() => {});
  }
}

// Singleton para la cola de mensajes
let messageQueueInstance: MessageQueue | null = null;

export function getMessageQueue(): MessageQueue {
  if (!messageQueueInstance) {
    messageQueueInstance = new MessageQueue();
    
    // Limpieza automática cada 10 minutos
    setInterval(() => {
      messageQueueInstance?.cleanup();
    }, 10 * 60 * 1000).unref();
  }
  return messageQueueInstance;
}
