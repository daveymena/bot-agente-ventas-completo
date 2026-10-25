import { logger } from "./logger";
import { runAgentReply } from "./agent";
import { getWhatsAppForTenant, peekWhatsAppForTenant } from "./whatsapp-factory";
import { FacebookMessengerService } from "./facebook-messenger";
import { FacebookCommentsService } from "./facebook-comments";
import { tenantManager, type TenantContext } from "./tenantManager";

async function negocio(tenantId: number): Promise<TenantContext | null> {
  const t = await tenantManager.getTenantById(tenantId).catch(() => null);
  if (!t) logger.warn({ tenantId }, "[ChannelManager] negocio no encontrado");
  return t;
}

export type Channel = "whatsapp" | "facebook_messenger" | "facebook_comment" | "facebook_marketplace";

export interface IncomingMessage {
  channel: Channel;
  contactId: string;
  contactName: string;
  text: string;
  tenantId?: number;
  metadata?: Record<string, any>;
}

export interface ChannelStatus {
  channel: Channel;
  connected: boolean;
  label: string;
  error?: string;
}

export class ChannelManager {
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

  async processMessage(msg: IncomingMessage): Promise<string | null> {
    // Sin negocio no se responde por ningún canal: antes caía al negocio 1 y
    // un mensaje sin dueño salía por el WhatsApp del dueño de la plataforma.
    const tenantId = Number(msg.tenantId) || 0;
    if (!tenantId) {
      logger.warn({ channel: msg.channel }, "[ChannelManager] mensaje sin negocio: no se responde");
      return null;
    }

    switch (msg.channel) {
      case "whatsapp": {
        // sendText() devuelve void (lanza excepción si falla) -- no un valor
        // verificable, a diferencia del proxy de whatsapp-singleton.ts que sí
        // devolvía la respuesta cruda de sock.sendMessage().
        const phone = msg.contactId.startsWith("57") ? msg.contactId : `57${msg.contactId}`;
        try {
          await getWhatsAppForTenant(tenantId).sendText(phone, msg.text);
          return msg.text;
        } catch (err) {
          logger.warn({ err }, "[ChannelManager] Error enviando por WhatsApp");
          return null;
        }
      }

      // Los servicios se arman con el negocio del mensaje. Los singletons
      // `facebookMessengerService` / `facebookCommentsService` están hechos
      // con el negocio de RELLENO: contestaban con el token del dueño de la
      // plataforma sin importar de qué página venía el mensaje.
      case "facebook_messenger": {
        const t = await negocio(tenantId);
        if (!t) return null;
        return await new FacebookMessengerService(t).handleIncomingMessage(
          msg.contactId,
          msg.text,
          msg.contactName,
          tenantId
        );
      }

      case "facebook_comment": {
        const t = await negocio(tenantId);
        if (!t) return null;
        return await new FacebookCommentsService(t).handleIncomingComment(
          {
            id: msg.metadata?.commentId || `comment_${Date.now()}`,
            message: msg.text,
            postId: msg.metadata?.postId || "",
            parentId: msg.metadata?.parentId || null,
            from: { id: msg.contactId, name: msg.contactName },
            createdTime: new Date().toISOString(),
          },
          tenantId
        );
      }

      default:
        logger.warn({ channel: msg.channel }, "[ChannelManager] Unknown channel");
        return null;
    }
  }

  async sendMessage(channel: Channel, contactId: string, text: string, tenantId: number = 1): Promise<boolean> {
    switch (channel) {
      case "whatsapp": {
        const phone = contactId.startsWith("57") ? contactId : `57${contactId.replace("whatsapp:", "")}`;
        try {
          await getWhatsAppForTenant(tenantId).sendText(phone, text);
          return true;
        } catch (err) {
          logger.warn({ err }, "[ChannelManager] Error enviando por WhatsApp");
          return false;
        }
      }
      case "facebook_messenger": {
        const t = await negocio(tenantId);
        return t ? await new FacebookMessengerService(t).sendText(contactId, text) : false;
      }
      case "facebook_comment": {
        const t = await negocio(tenantId);
        return t ? await new FacebookCommentsService(t).replyToComment(contactId, text) : false;
      }
      default:
        return false;
    }
  }

  async sendProductCard(channel: Channel, contactId: string, product: any, tenantId: number = Number(product?.tenantId) || 0): Promise<boolean> {
    if (channel === "facebook_messenger") {
      const t = tenantId ? await negocio(tenantId) : null;
      return t ? await new FacebookMessengerService(t).sendProductCard(contactId, product) : false;
    }
    return false;
  }

  async getStatus(tenantId: number = 1): Promise<ChannelStatus[]> {
    const statuses: ChannelStatus[] = [];

    statuses.push({
      channel: "whatsapp",
      connected: peekWhatsAppForTenant(tenantId)?.isConnected() ?? false,
      label: "WhatsApp",
    });

    const t = await negocio(tenantId);
    statuses.push({
      channel: "facebook_messenger",
      connected: t ? new FacebookMessengerService(t).isConfigured() : false,
      label: "Facebook Messenger",
    });

    statuses.push({
      channel: "facebook_comment",
      connected: t ? new FacebookCommentsService(t).isConfigured() : false,
      label: "Facebook Comments",
    });

    return statuses;
  }

  startPollingFacebookComments(intervalMs: number = 60000, tenantId: number = 1): void {
    const key = `fb_comments_${tenantId}`;
    if (this.pollingIntervals.has(key)) return;

    logger.info({ intervalMs, tenantId }, "[ChannelManager] Starting Facebook comments polling");

    // Solo lo que se comente DESPUÉS de encender el sondeo. Antes miraba la
    // última hora y decidía "ya atendido" comparando el texto del comentario
    // con el ÚLTIMO mensaje de la conversación: después de contestar, el
    // último era el nuestro, así que el mismo comentario se volvía a contestar
    // cada minuto durante una hora. Ahora el registro de atendidos vive en
    // FacebookCommentsService (lo comparte con el webhook).
    const desde = new Date().toISOString();

    const interval = setInterval(async () => {
      try {
        const t = await negocio(tenantId);
        if (!t) return;
        const svc = new FacebookCommentsService(t);
        if (!svc.isConfigured()) return;

        const recentComments = await svc.getRecentComments(undefined, 1);
        const ownPageId = String(t.facebook?.pageId || process.env.FB_PAGE_ID || "");

        for (const comment of recentComments) {
          // No responder comentarios de la propia página (evita bucles)
          if (ownPageId && comment.from?.id === ownPageId) continue;
          if (!comment.createdTime || comment.createdTime < desde) continue;
          await svc.handleIncomingComment(comment, tenantId);
        }
      } catch (err: any) {
        logger.error({ err }, "[ChannelManager] Error polling comments");
      }
    }, intervalMs);

    this.pollingIntervals.set(key, interval);
  }

  stopPolling(tenantId: number = 1): void {
    const key = `fb_comments_${tenantId}`;
    const interval = this.pollingIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
      logger.info({ tenantId }, "[ChannelManager] Stopped polling");
    }
  }

  stopAll(): void {
    for (const [key, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
    logger.info("[ChannelManager] All polling stopped");
  }
}

export const channelManager = new ChannelManager();
