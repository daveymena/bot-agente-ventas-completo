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
  dequeue(): QueuedMessage | null {
    const pending = this.queue.find(m => !m.processed && !m.processing && m.retryCount < this.maxRetries);
    if (pending) {
      pending.processing = true;
    }
    return pending || null;
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
    this.queue = this.queue.filter(m => !m.processed || m.createdAt > oneHourAgo);
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
