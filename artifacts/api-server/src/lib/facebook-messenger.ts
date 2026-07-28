import { logger } from "./logger";
import { db, conversations, messages, leads, tenants, products } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runAgentReply } from "./agent";
import { tenantManager, type TenantContext } from "./tenantManager";
import { createHmac } from "crypto";

const FB_GRAPH_URL = "https://graph.facebook.com/v21.0";

export interface FacebookPageToken {
  pageId: string;
  pageName: string;
  accessToken: string;
}

export class FacebookMessengerService {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  private getConfig(): {
    pageAccessToken: string;
    appSecret: string;
    appId: string;
    pageId: string;
  } {
    const fb = this.tenant.facebook || {};
    return {
      pageAccessToken: fb.accessToken || fb.messengerPageToken || process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || "",
      appSecret: fb.appSecret || process.env.FB_APP_SECRET || "",
      appId: fb.appId || process.env.FB_APP_ID || "4238613976451604",
      pageId: fb.pageId || process.env.FB_PAGE_ID || "",
    };
  }

  private getAppToken(): string {
    const { appId, appSecret } = this.getConfig();
    return appId && appSecret ? `${appId}|${appSecret}` : "";
  }

  isConfigured(): boolean {
    const { pageAccessToken } = this.getConfig();
    return !!pageAccessToken;
  }

  getStatus(): {
    configured: boolean;
    hasPageToken: boolean;
    hasAppSecret: boolean;
    pageId: string;
    webhookConfigured: boolean;
    subscribed: boolean;
  } {
    const { pageAccessToken, appSecret, pageId } = this.getConfig();
    return {
      configured: !!pageAccessToken,
      hasPageToken: !!pageAccessToken,
      hasAppSecret: !!appSecret,
      pageId,
      webhookConfigured: true,
      subscribed: !!pageAccessToken,
    };
  }

  async sendText(psid: string, text: string): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me/messages?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: psid },
            message: { text },
          }),
        }
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Messenger] Error enviando mensaje");
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error({ err }, "[FB-Messenger] Error enviando mensaje");
      return false;
    }
  }

  async sendProductCard(psid: string, product: any): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;
    const price = Number(product.price).toLocaleString("es-CO");
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me/messages?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: psid },
            message: {
              attachment: {
                type: "template",
                payload: {
                  template_type: "generic",
                  elements: [{
                    title: product.name,
                    image_url: product.image_url || "",
                    subtitle: `$${price} COP`,
                    default_action: {
                      type: "web_url",
                      url: product.paymentLinkCustom || `${process.env.APP_URL || ""}/productos/${product.id}`,
                    },
                    buttons: [
                      {
                        type: "web_url",
                        url: product.paymentLinkMercadoPago || `${process.env.APP_URL || ""}/pagar/${product.id}`,
                        title: "Comprar ahora",
                      },
                    ],
                  }],
                },
              },
            },
          }),
        }
      );
      const data = await res.json();
      return !data.error;
    } catch (err: any) {
      logger.error({ err }, "[FB-Messenger] Error enviando card");
      return false;
    }
  }

  async setTyping(psid: string, state: "typing_on" | "typing_off"): Promise<void> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return;
    try {
      await fetch(
        `${FB_GRAPH_URL}/me/messages?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipient: { id: psid },
            sender_action: state,
          }),
        }
      );
    } catch {}
  }

  async handleIncomingMessage(
    psid: string,
    text: string,
    senderName: string,
    tenantId: number = 1
  ): Promise<string | null> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return null;

    await this.setTyping(psid, "typing_on");

    let conversationId: number;

    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.contactPhone, `fb:${psid}`))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const [lead] = await db.insert(leads).values({
        tenantId,
        name: senderName,
        phone: `fb:${psid}`,
        source: "facebook_messenger",
        stage: "new",
      }).returning();

      const [convo] = await db.insert(conversations).values({
        tenantId,
        contactName: senderName,
        contactPhone: `fb:${psid}`,
        status: "ai",
        currentStage: "greeting",
        leadId: lead.id,
        channel: "facebook_messenger",
      }).returning();
      conversationId = convo.id;
    }

    await db.insert(messages).values({
      conversationId,
      role: "customer",
      content: text,
    });

    const reply = await runAgentReply(conversationId);

    await this.setTyping(psid, "typing_off");

    if (reply?.content) {
      await this.sendText(psid, reply.content);
    }

    if (reply?.parts) {
      for (const part of reply.parts) {
        if (part.kind === "card" && part.productId) {
          const [product] = await db
            .select()
            .from(products)
            .where(eq(products.id, part.productId))
            .limit(1);
          if (product) {
            await this.sendProductCard(psid, product);
          }
        }
      }
    }

    return reply?.content || null;
  }

  async getSubscribedApps(): Promise<string[]> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return [];
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me/subscribed_apps?access_token=${pageAccessToken}`
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Messenger] Error getting subscribed apps");
        return [];
      }
      return (data.data || []).map((a: any) => a.name);
    } catch (err: any) {
      logger.error({ err }, "[FB-Messenger] Error getting subscribed apps");
      return [];
    }
  }

  async subscribeToWebhook(): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me/subscribed_apps?access_token=${pageAccessToken}`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Messenger] Error subscribing to webhook");
        return false;
      }
      logger.info("[FB-Messenger] Subscribed to page webhook");
      return true;
    } catch (err: any) {
      logger.error({ err }, "[FB-Messenger] Error subscribing");
      return false;
    }
  }

  async getPageInfo(): Promise<{ name: string; id: string; picture: string } | null> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return null;
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me?fields=name,id,picture&access_token=${pageAccessToken}`
      );
      const data = await res.json();
      if (data.error) return null;
      return {
        name: data.name || "",
        id: data.id || "",
        picture: data.picture?.data?.url || "",
      };
    } catch {
      return null;
    }
  }
}

export const facebookMessengerService = new FacebookMessengerService();
