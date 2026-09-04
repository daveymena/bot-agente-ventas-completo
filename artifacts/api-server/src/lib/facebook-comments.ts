import { logger } from "./logger";
import { db, conversations, messages, leads } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { runAgentReply } from "./agent";
import { tenantManager, type TenantContext } from "./tenantManager";

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
    return {
      pageId: fb.pageId || process.env.FB_PAGE_ID || "",
      pageAccessToken: fb.accessToken || process.env.FB_ACCESS_TOKEN || "",
    };
  }

  isConfigured(): boolean {
    const cfg = this.getConfig();
    return !!cfg.pageId && !!cfg.pageAccessToken;
  }

  async replyToComment(commentId: string, message: string): Promise<boolean> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return false;

    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/${commentId}/comments?access_token=${pageAccessToken}`,
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
      const res = await fetch(
        `${FB_GRAPH_URL}/${commentId}/private_replies?access_token=${pageAccessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
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

  async handleIncomingComment(comment: CommentData, tenantId: number = 1): Promise<string | null> {
    const { pageAccessToken } = this.getConfig();
    if (!pageAccessToken) return null;

    if (!comment.message || !comment.from?.id) return null;

    const userId = comment.from.id;
    const userName = comment.from.name;
    const text = comment.message;

    let conversationId: number;

    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.contactPhone, `fb_comment:${userId}`))
      .orderBy(desc(conversations.createdAt))
      .limit(1);

    if (existing.length > 0) {
      conversationId = existing[0].id;
    } else {
      const [lead] = await db.insert(leads).values({
        tenantId,
        name: userName,
        phone: `fb_comment:${userId}`,
        source: "facebook_comment",
        stage: "new",
      }).returning();

      const [convo] = await db.insert(conversations).values({
        tenantId,
        contactName: userName,
        contactPhone: `fb_comment:${userId}`,
        status: "ai",
        currentStage: "greeting",
        leadId: lead.id,
        channel: "facebook_comment",
      }).returning();
      conversationId = convo.id;
    }

    await db.insert(messages).values({
      conversationId,
      role: "customer",
      content: text,
    });

    const reply = await runAgentReply(conversationId);

    if (reply?.content) {
      // Patrón profesional: DM con la respuesta completa + comentario público breve.
      // 1) Intentar respuesta privada (abre conversación en Messenger).
      const privateOk = await this.sendPrivateReply(comment.id, reply.content);

      // 2) Respuesta pública: si el DM funcionó, dejar un mensaje corto que invite
      //    al inbox; si falló, publicar la respuesta completa como respaldo.
      if (privateOk) {
        const shortPublic = `¡Hola ${userName.split(" ")[0] || ""}! 😊 Te acabo de enviar toda la información por mensaje privado 📩`;
        await this.replyToComment(comment.id, shortPublic);
      } else {
        await this.replyToComment(comment.id, reply.content);
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

export const facebookCommentsService = new FacebookCommentsService();
