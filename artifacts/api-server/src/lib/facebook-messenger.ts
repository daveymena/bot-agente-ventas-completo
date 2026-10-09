import { logger } from "./logger";
import { db, conversations, messages, leads, tenants, products } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { runAgentReply } from "./agent";
import { toEmojiStyle } from "./conversation-engine";
import { tenantManager, type TenantContext } from "./tenantManager";
import { respaldoEnvFacebook } from "./tenant-facebook-credentials";
import { createHmac } from "crypto";

import { FB_GRAPH_BASE } from "./meta-api-version";
import { CAMPOS_WEBHOOK_PAGINA } from "./meta-campos-webhook";
const FB_GRAPH_URL = FB_GRAPH_BASE;

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
    const env = respaldoEnvFacebook(this.tenant.id); // .env = cuenta del dueño: solo para él
    return {
      pageAccessToken: fb.accessToken || fb.messengerPageToken || env(process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN),
      appSecret: fb.appSecret || process.env.FB_APP_SECRET || "",
      appId: fb.appId || process.env.FB_APP_ID || "",
      pageId: fb.pageId || env(process.env.FB_PAGE_ID),
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
    text = toEmojiStyle(text);
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

    const appUrl = (process.env.APP_URL || "").replace(/\/$/, "");
    const priceNum = Number(product.price) || 0;
    const price = priceNum.toLocaleString("es-CO");
    const currency = product.currency || "COP";

    // Resolver imagen a URL absoluta pública (Messenger la exige)
    const rawImage = product.imageUrl || product.image_url || "";
    const imageUrl = rawImage
      ? (/^https?:\/\//i.test(rawImage)
          ? rawImage
          : `${appUrl}${rawImage.startsWith("/") ? "" : "/"}${rawImage}`)
      : "";

    // Link de compra: paymentLink del producto o la tienda pública
    const buyUrl = product.paymentLink || product.deliveryLink || (appUrl ? `${appUrl}/tienda` : "");

    const shortDesc = product.description ? " · " + String(product.description).replace(/\s+/g, " ").slice(0, 60) : "";
    const element: any = {
      title: product.name,
      subtitle: `$${price} ${currency}${shortDesc}`,
    };
    if (imageUrl) element.image_url = imageUrl;
    if (buyUrl) {
      element.default_action = { type: "web_url", url: buyUrl };
      element.buttons = [{ type: "web_url", url: buyUrl, title: "🛒 Comprar ahora" }];
    }

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
                payload: { template_type: "generic", elements: [element] },
              },
            },
          }),
        }
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Messenger] Error enviando card");
        return false;
      }
      return true;
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

  /**
   * Un mensaje entrante de Messenger o de Instagram Direct.
   *
   * Los dos llegan por la Messenger Platform y se contestan con el MISMO
   * token de página por `/me/messages`; lo único que cambia es el prefijo del
   * contacto (`fb:` / `ig:`) y el canal de la conversación.
   *
   * `tenantId` ya no vale 1 por defecto: el webhook nunca lo pasaba, así que
   * los mensajes de la página de CUALQUIER negocio se guardaban en el negocio
   * 1. Ahora el webhook lo resuelve por la página que recibió el mensaje (ver
   * meta-webhook-pagina.ts) y este servicio se construye con ESE negocio.
   */
  async handleIncomingMessage(
    psid: string,
    text: string,
    senderName: string,
    tenantId: number = this.tenant.id,
    canal: "facebook" | "instagram" = "facebook",
  ): Promise<string | null> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) {
      logger.warn({ tenantId, canal }, "[FB-Messenger] El negocio no tiene token de página: el mensaje no se puede contestar");
      return null;
    }

    let conversationId: number;
    const contacto = `${canal === "instagram" ? "ig" : "fb"}:${psid}`;

    // Por negocio: buscar solo por contacto era otra puerta para mezclar
    // conversaciones entre clientes de la plataforma.
    const existing = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.contactPhone, contacto), eq(conversations.tenantId, tenantId)))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const [lead] = await db.insert(leads).values({
        tenantId,
        name: senderName,
        phone: contacto,
        source: canal === "instagram" ? "instagram_direct" : "facebook_messenger",
        stage: "new",
      }).returning();

      const [convo] = await db.insert(conversations).values({
        tenantId,
        contactName: senderName,
        contactPhone: contacto,
        status: "ai",
        currentStage: "greeting",
        leadId: lead.id,
        channel: canal === "instagram" ? "instagram" : "facebook_messenger",
      }).returning();
      conversationId = convo.id;
    }

    await db.insert(messages).values({
      conversationId,
      role: "customer",
      content: text,
    });

    // Una persona tomó la conversación desde el panel: el bot no contesta.
    // Es la misma regla del orquestador de WhatsApp; en Messenger no existía.
    const [estado] = await db.select({ status: conversations.status }).from(conversations)
      .where(eq(conversations.id, conversationId)).limit(1);
    if (String(estado?.status || "") === "human") return null;

    await this.setTyping(psid, "typing_on");
    const reply = await runAgentReply(conversationId);

    await this.setTyping(psid, "typing_off");

    // Enviar en el MISMO orden que WhatsApp: texto y cards intercalados.
    // Si no hay partes, usar el texto completo como respaldo.
    const parts = (reply?.parts && reply.parts.length > 0)
      ? reply.parts
      : (reply?.content ? [{ kind: "text", content: reply.content }] : []);

    for (const part of parts) {
      if (part.kind === "text" && part.content) {
        await this.sendText(psid, part.content);
      } else if (part.kind === "card" && part.productId) {
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

    return reply?.content || null;
  }

  /**
   * La cuenta de Instagram profesional vinculada a la página, o null.
   *
   * Los eventos de Instagram traen en `entry.id` el id de ESA cuenta, no el de
   * la página; para saber de qué negocio son hay que preguntarle a la página
   * cuál es su Instagram. Se cachea una hora: cambia solo si el negocio
   * vincula otra cuenta.
   */
  async cuentaDeInstagram(): Promise<string | null> {
    const { pageAccessToken, pageId } = this.getConfig();
    if (!pageAccessToken || !pageId) return null;
    const clave = `${this.tenant.id}:${pageId}`;
    const guardada = CACHE_INSTAGRAM.get(clave);
    if (guardada && guardada.hasta > Date.now()) return guardada.id;
    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data: any = await res.json();
      const id = data?.instagram_business_account?.id ? String(data.instagram_business_account.id) : null;
      CACHE_INSTAGRAM.set(clave, { id, hasta: Date.now() + 60 * 60_000 });
      return id;
    } catch (err) {
      logger.warn({ err, tenantId: this.tenant.id }, "[FB-Messenger] No se pudo leer la cuenta de Instagram de la página");
      return null;
    }
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
      // Sin `subscribed_fields` Graph rechaza la suscripción de la página
      // ("(#100) The parameter subscribed_fields is required"): el botón
      // "Suscribir" del panel no podía funcionar. Y la lista va COMPLETA
      // porque cada POST reemplaza la anterior (ver meta-campos-webhook.ts).
      const res = await fetch(
        `${FB_GRAPH_URL}/me/subscribed_apps?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscribed_fields: CAMPOS_WEBHOOK_PAGINA.join(",") }),
        }
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

const CACHE_INSTAGRAM = new Map<string, { id: string | null; hasta: number }>();

export const facebookMessengerService = new FacebookMessengerService();
