import { logger } from "./logger";
import { db, tenants, conversations, messages } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runAgentReply } from "./agent";
import { getWhatsAppForTenant } from "./whatsapp-factory";
import { facebookMessengerService } from "./facebook-messenger";
import { facebookCommentsService } from "./facebook-comments";
import { tenantManager } from "./tenantManager";

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

      case "facebook_messenger": {
        return await facebookMessengerService.handleIncomingMessage(
          msg.contactId,
          msg.text,
          msg.contactName,
          tenantId
        );
      }

      case "facebook_comment": {
        return await facebookCommentsService.handleIncomingComment(
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
        return await facebookMessengerService.sendText(contactId, text);
      }
      case "facebook_comment": {
        return await facebookCommentsService.replyToComment(contactId, text);
      }
      default:
        return false;
    }
  }

  async sendProductCard(channel: Channel, contactId: string, product: any): Promise<boolean> {
    if (channel === "facebook_messenger") {
      return await facebookMessengerService.sendProductCard(contactId, product);
    }
    return false;
  }

  async getStatus(tenantId: number = 1): Promise<ChannelStatus[]> {
    const statuses: ChannelStatus[] = [];

    statuses.push({
      channel: "whatsapp",
      connected: getWhatsAppForTenant(tenantId).isConnected(),
      label: "WhatsApp",
    });

    statuses.push({
      channel: "facebook_messenger",
      connected: facebookMessengerService.isConfigured(),
      label: "Facebook Messenger",
    });

    statuses.push({
      channel: "facebook_comment",
      connected: facebookCommentsService.isConfigured(),
      label: "Facebook Comments",
    });

    return statuses;
  }

  startPollingFacebookComments(intervalMs: number = 60000, tenantId: number = 1): void {
    const key = `fb_comments_${tenantId}`;
    if (this.pollingIntervals.has(key)) return;

    logger.info({ intervalMs, tenantId }, "[ChannelManager] Starting Facebook comments polling");

    const interval = setInterval(async () => {
      try {
        if (!facebookCommentsService.isConfigured()) return;

        const recentComments = await facebookCommentsService.getRecentComments(undefined, 1);
        const ownPageId = process.env.FB_PAGE_ID || "";

        for (const comment of recentComments) {
          // No responder comentarios de la propia página (evita bucles)
          if (ownPageId && comment.from?.id === ownPageId) continue;

          const convoKey = `fb_comment:${comment.from.id}`;
          const existing = await db
            .select()
            .from(conversations)
            .where(eq(conversations.contactPhone, convoKey))
            .limit(1);

          if (existing.length > 0) {
            // Comparar contra el ÚLTIMO mensaje del cliente (no el más antiguo)
            const lastMsg = await db
              .select()
              .from(messages)
              .where(eq(messages.conversationId, existing[0].id))
              .orderBy(desc(messages.createdAt))
              .limit(1);

            if (lastMsg.length > 0 && lastMsg[0].content === comment.message) {
              continue;
            }
          }

          await facebookCommentsService.handleIncomingComment(comment, tenantId);
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
