import { logger } from "./logger";
import { db, conversations, messages, leads } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { runAgentReply } from "./agent";
import { tenantManager, type TenantContext } from "./tenantManager";
import { respaldoEnvFacebook } from "./tenant-facebook-credentials";

import { FB_GRAPH_BASE } from "./meta-api-version";
const FB_GRAPH_URL = FB_GRAPH_BASE;

export interface CommentData {
  id: string;
  message: string;
  postId: string;
  parentId: string | null;
  from: { id: string; name: string };
  createdTime: string;
}

export class FacebookCommentsService {
  private tenant: TenantContext;

  constructor(tenant?: TenantContext) {
    this.tenant = tenant || tenantManager.getDefaultTenant();
  }

  private getConfig(): { pageId: string; pageAccessToken: string } {
    const fb = this.tenant.facebook || {};
    const env = respaldoEnvFacebook(this.tenant.id); // .env = cuenta del dueño: solo para él
    return {
      pageId: fb.pageId || env(process.env.FB_PAGE_ID),
      pageAccessToken: fb.accessToken || env(process.env.FB_ACCESS_TOKEN),
    };
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return !!cfg.pageId && !!cfg.pageAccessToken;
  }

  /**
   * Respuesta PÚBLICA bajo el comentario.
   * Facebook: POST /{comment-id}/comments. Instagram: POST /{comment-id}/replies
   * (en Instagram el edge `/comments` de un comentario no existe).
   */
  async replyToComment(commentId: string, message: string, canal: CanalDeComentario = "facebook"): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;

    try {
      const edge = canal === "instagram" ? "replies" : "comments";
      const res = await fetch(
        `${FB_GRAPH_URL}/${commentId}/${edge}?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        }
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Comments] Error replying to comment");
        return false;
      }
      return true;
    } catch (err: any) {
      logger.error({ err }, "[FB-Comments] Error replying");
      return false;
    }
  }

  /**
   * Envía una respuesta PRIVADA (mensaje directo por Messenger) al autor de un
   * comentario. Es el patrón profesional: responder público breve + DM con detalle.
   * Solo funciona una vez por comentario y dentro de la ventana permitida por Facebook.
   */
  async sendPrivateReply(commentId: string, message: string): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;
    try {
      // Por la Send API con `recipient.comment_id` (Private Replies de la
      // Messenger Platform), que vale para Facebook Y para Instagram. El edge
      // viejo `/{comment-id}/private_replies` está retirado de la Graph API:
      // fallaba siempre y el código caía al respaldo de publicar la respuesta
      // COMPLETA en público, bajo el comentario.
      const res = await fetch(
        `${FB_GRAPH_URL}/me/messages?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text: message } }),
        }
      );
      const data = await res.json();
      if (data.error) {
        logger.warn({ err: data.error }, "[FB-Comments] No se pudo enviar respuesta privada");
        return false;
      }
      return true;
    } catch (err: any) {
      logger.warn({ err }, "[FB-Comments] Error en respuesta privada");
      return false;
    }
  }

  async getPostComments(postId: string, limit: number = 25): Promise<CommentData[]> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return [];

    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/${postId}/comments?access_token=${pageAccessToken}&fields=id,message,from,parent_id,created_time&limit=${limit}&order=reverse_chronological`
      );
      const data = await res.json();
      if (data.error) {
        logger.error({ err: data.error }, "[FB-Comments] Error fetching comments");
        return [];
      }
      return (data.data || []).map((c: any) => ({
        id: c.id,
        message: c.message || "",
        postId,
        parentId: c.parent_id || null,
        from: c.from || { id: "", name: "Unknown" },
        createdTime: c.created_time || "",
      }));
    } catch (err: any) {
      logger.error({ err }, "[FB-Comments] Error fetching");
      return [];
    }
  }

  /**
   * Un comentario nuevo (Facebook o Instagram): se guarda, el vendedor lo
   * contesta por privado y se deja una respuesta pública corta.
   *
   * `tenantId` ya no vale 1 por defecto: el servicio se construye con el
   * negocio dueño de la página (ver meta-webhook-pagina.ts).
   */
  async handleIncomingComment(
    comment: CommentData,
    tenantId: number = this.tenant.id,
    canal: CanalDeComentario = "facebook",
  ): Promise<string | null> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) {
      logger.warn({ tenantId, canal }, "[FB-Comments] El negocio no tiene token de página: el comentario no se puede contestar");
      return null;
    }

    if (!comment.message || !comment.from?.id) return null;

    // Un comentario se contesta UNA vez. Meta reintenta el webhook si tarda,
    // y el sondeo del panel volvía a encontrar el mismo comentario cada
    // minuto durante una hora (comparaba contra el ÚLTIMO mensaje, que
    // después de contestar ya era el nuestro): cada vuelta, otra respuesta
    // pública y otro privado al mismo cliente.
    if (!primeraVezQueSeVe(`${canal}:${comment.id}`)) return null;

    const userId = comment.from.id;
    const userName = comment.from.name || "Usuario";
    const text = comment.message;
    const contacto = `${canal === "instagram" ? "ig_comment" : "fb_comment"}:${userId}`;

    let conversationId: number;

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
        name: userName,
        phone: contacto,
        source: canal === "instagram" ? "instagram_comment" : "facebook_comment",
        stage: "new",
      }).returning();

      const [convo] = await db.insert(conversations).values({
        tenantId,
        contactName: userName,
        contactPhone: contacto,
        status: "ai",
        currentStage: "greeting",
        leadId: lead.id,
        channel: canal === "instagram" ? "instagram_comment" : "facebook_comment",
      }).returning();
      conversationId = convo.id;
    }

    await db.insert(messages).values({
      conversationId,
      role: "customer",
      content: text,
    });

    // Una persona tomó la conversación desde el panel: el bot no contesta.
    const [estado] = await db.select({ status: conversations.status }).from(conversations)
      .where(eq(conversations.id, conversationId)).limit(1);
    if (String(estado?.status || "") === "human") return null;

    const reply = await runAgentReply(conversationId);

    if (reply?.content) {
      // Patrón profesional: DM con la respuesta completa + comentario público breve.
      // 1) Respuesta privada (abre la conversación en Messenger / Instagram Direct).
      const privateOk = await this.sendPrivateReply(comment.id, reply.content);

      // 2) Respuesta pública: si el DM funcionó, dejar un mensaje corto que invite
      //    al inbox; si falló, publicar la respuesta completa como respaldo.
      if (privateOk) {
        const shortPublic = `¡Hola ${userName.split(" ")[0] || ""}! 😊 Te acabo de enviar toda la información por mensaje privado 📩`;
        await this.replyToComment(comment.id, shortPublic, canal);
      } else {
        await this.replyToComment(comment.id, reply.content, canal);
      }
    }

    return reply?.content || null;
  }

  async getRecentComments(pageId?: string, hours: number = 1): Promise<CommentData[]> {
    const { pageId: cfgPageId, pageAccessToken } = this.getConfig();
    const pid = pageId || cfgPageId;
    if (!pid || !pageAccessToken) return [];

    try {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const res = await fetch(
        `${FB_GRAPH_URL}/${pid}/feed?access_token=${pageAccessToken}&fields=id,message,comments{id,message,from,parent_id,created_time}&limit=10`
      );
      const data = await res.json();
      if (data.error) return [];

      const allComments: CommentData[] = [];

      for (const post of data.data || []) {
        if (post.comments?.data) {
          for (const c of post.comments.data) {
            if (c.created_time >= cutoff) {
              allComments.push({
                id: c.id,
                message: c.message || "",
                postId: post.id,
                parentId: c.parent_id || null,
                from: c.from || { id: "", name: "Unknown" },
                createdTime: c.created_time || "",
              });
            }
          }
        }
      }

      return allComments;
    } catch (err: any) {
      logger.error({ err }, "[FB-Comments] Error fetching recent comments");
      return [];
    }
  }
}

export type CanalDeComentario = "facebook" | "instagram";

/**
 * Comentarios ya atendidos en este proceso (webhook, reintentos de Meta y
 * sondeo comparten este registro). Acotado para no crecer sin fin.
 */
const VISTOS = new Map<string, number>();
const VISTOS_MAX = 5000;

export function primeraVezQueSeVe(clave: string): boolean {
  if (VISTOS.has(clave)) return false;
  VISTOS.set(clave, Date.now());
  if (VISTOS.size > VISTOS_MAX) {
    const masViejo = VISTOS.keys().next().value;
    if (masViejo !== undefined) VISTOS.delete(masViejo);
  }
  return true;
}

/** Solo para las pruebas. */
export function _olvidarVistos(): void {
  VISTOS.clear();
}

export const facebookCommentsService = new FacebookCommentsService();
