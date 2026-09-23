/**
 * Sistema de cola de mensajes para desacoplar WhatsApp del procesamiento IA
 * Permite que el receptor de mensajes de WhatsApp y el procesador de IA sean independientes
 */

import { EventEmitter } from 'events';

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
 * Cola de mensajes en memoria con eventos
 * En producción esto podría usar Redis o similar
 */
export class MessageQueue extends EventEmitter {
  private queue: QueuedMessage[] = [];
  private processing = false;
  private maxRetries = 3;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Encola un nuevo mensaje recibido
   */
  enqueue(message: Omit<QueuedMessage, 'id' | 'processed' | 'retryCount' | 'createdAt'>): QueuedMessage {
    const queuedMessage: QueuedMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      processed: false,
      retryCount: 0,
      createdAt: new Date(),
    };

    this.queue.push(queuedMessage);
    this.emit('message:received', queuedMessage);
    
    return queuedMessage;
  }

  /**
   * Obtiene el siguiente mensaje pendiente
   */
  dequeue(admitir?: (m: QueuedMessage) => boolean): QueuedMessage | null {
    const ahora = Date.now();
    const pending = this.queue.find(m =>
      !m.processed &&
      !m.processing &&
      m.retryCount < this.maxRetries &&
      // Un mensaje en espera por el tope horario no se toca hasta su hora.
      (!m.noAntesDe || m.noAntesDe <= ahora) &&
      // El orquestador salta las conversaciones que ya se están atendiendo:
      // dos respuestas en paralelo al mismo cliente se pisarían.
      (!admitir || admitir(m))
    );
    if (pending) {
      pending.processing = true;
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
    const msg = this.queue.find(m => m.id === messageId);
    if (msg) msg.parts = parts;
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
    const msg = this.queue.find(m => m.id === messageId);
    if (msg) {
      msg.noAntesDe = Date.now() + ms;
      msg.processing = false;
    }
  }

  /**
   * Marca un mensaje como procesado
   */
  markProcessed(messageId: string): void {
    const msg = this.queue.find(m => m.id === messageId);
    if (msg) {
      msg.processed = true;
      this.emit('message:processed', msg);
    }
  }

  /**
   * Marca un mensaje como fallido e incrementa reintentos
   */
  markFailed(messageId: string): void {
    const msg = this.queue.find(m => m.id === messageId);
    if (msg) {
      msg.retryCount++;
      msg.processing = false;
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
    this.queue = this.queue.filter(m => (!m.processed && m.retryCount < this.maxRetries) || m.createdAt > oneHourAgo);
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
    }, 10 * 60 * 1000);
  }
  return messageQueueInstance;
}
