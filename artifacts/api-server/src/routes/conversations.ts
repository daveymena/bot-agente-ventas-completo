import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, lte, or } from "drizzle-orm";
import {
  GetConversationParams,
  GetConversationResponse,
  HandoffConversationBody,
  HandoffConversationParams,
  HandoffConversationResponse,
  ListConversationsQueryParams,
  ListConversationsResponse,
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageBody,
  SendMessageParams,
  SendMessageResponse,
  UpdateConversationBody,
  UpdateConversationParams,
  UpdateConversationResponse,
} from "@workspace/api-zod";
import {
  db,
  conversations,
  messages,
  activityEvents,
  followUps,
} from "@workspace/db";
import { runAgentReply } from "../lib/agent";
import { whatsapp, type AgentReplyPart } from "../lib/whatsapp";
import { logger } from "../lib/logger";
import { getLeadScore, getLeadScoringDashboard } from "../lib/leadScoring";
import { followUpScheduler, getDueFollowUps } from "../lib/followUpScheduler";
import {
  apiRateLimit,
  conversationRateLimit,
  aiCostTracker,
} from "../middleware/rateLimiting";

const router: IRouter = Router();

router.use(apiRateLimit);

router.get("/", async (req, res, next) => {
  try {
    const q = ListConversationsQueryParams.parse(req.query);
    const filters = [];
    if (q.status) filters.push(eq(conversations.status, q.status));
    if (q.search && q.search.trim()) {
      const term = `%${q.search.trim()}%`;
      filters.push(or(ilike(conversations.contactName, term), ilike(conversations.contactPhone, term))!);
    }
    const where = filters.length === 1 ? filters[0] : filters.length > 1 ? and(...filters) : undefined;
    const rows = where
      ? await db.select().from(conversations).where(where).orderBy(desc(conversations.lastMessageAt))
      : await db.select().from(conversations).orderBy(desc(conversations.lastMessageAt));
    return res.json(ListConversationsResponse.parse(rows.map(serializeConversation)));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = GetConversationParams.parse(req.params);
    const [row] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!row) return res.status(404).json({ message: "Conversación no encontrada" });
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
    return res.json(GetConversationResponse.parse(serializeConversation({ ...row, unreadCount: 0 })));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const { id } = UpdateConversationParams.parse(req.params);
    const body = UpdateConversationBody.parse(req.body);
    const [updated] = await db
      .update(conversations)
      .set(body)
      .where(eq(conversations.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Conversación no encontrada" });
    return res.json(UpdateConversationResponse.parse(serializeConversation(updated)));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id/messages", async (req, res, next) => {
  try {
    const { id } = ListMessagesParams.parse(req.params);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt));
    return res.json(ListMessagesResponse.parse(rows.map(serializeMessage)));
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/messages", conversationRateLimit, aiCostTracker, async (req, res, next) => {
  try {
    const { id } = SendMessageParams.parse(req.params);
    const body = SendMessageBody.parse(req.body);
    const [convo] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!convo) return res.status(404).json({ message: "Conversación no encontrada" });

    const role = body.asHuman ? "human" : "agent";
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: id,
        role,
        content: body.content,
        stage: convo.currentStage,
      })
      .returning();
    await db
      .update(conversations)
      .set({ lastMessage: body.content, lastMessageAt: new Date(), status: body.asHuman ? "human" : convo.status })
      .where(eq(conversations.id, id));

    if (whatsapp.isConnected()) {
      try {
        await whatsapp.sendText(convo.contactPhone, body.content);
      } catch (err) {
        logger.warn({ err }, "Send to WhatsApp failed (message persisted)");
      }
    }

    // ✨ NEW: Si es mensaje del cliente, obtener respuesta del agente automáticamente
    let agentReply = null;
    if (body.asHuman === true && convo.status === "ai") {
      try {
        agentReply = await runAgentReply(id);
        logger.debug({ conversationId: id, hasReply: !!agentReply }, "[Agent] Auto-reply generated");
      } catch (err) {
        logger.warn({ err, conversationId: id }, "[Agent] Failed to generate auto-reply");
      }
    }

    return res.json({
      ...SendMessageResponse.parse(serializeMessage(msg!)),
      agentReply: agentReply ? {
        content: agentReply.content,
        stage: agentReply.stage,
        parts: agentReply.parts
      } : null
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/handoff", async (req, res, next) => {
  try {
    const { id } = HandoffConversationParams.parse(req.params);
    const body = HandoffConversationBody.parse(req.body);
    const [updated] = await db
      .update(conversations)
      .set({ status: body.target })
      .where(eq(conversations.id, id))
      .returning();
    if (!updated) return res.status(404).json({ message: "Conversación no encontrada" });
    await db.insert(activityEvents).values({
      type: "handoff",
      title: `Conversación pasó a ${body.target === "ai" ? "agente IA" : "operador humano"}`,
      subtitle: updated.contactName,
    });

    if (body.target === "ai") {
      try {
        const reply = await runAgentReply(id);
        if (reply && whatsapp.isConnected()) {
          await whatsapp.sendAgentParts(updated.contactPhone, updated.contactName, reply.parts as AgentReplyPart[]);
        }
      } catch (err) {
        logger.warn({ err }, "Agent reply after handoff failed");
      }
    }

    const [after] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return res.json(HandoffConversationResponse.parse(serializeConversation(after ?? updated)));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id/lead-score", async (req, res, next) => {
  try {
    const { id } = GetConversationParams.parse(req.params);
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    if (!conversation) return res.status(404).json({ message: "Conversación no encontrada" });

    const leadScore = await getLeadScore(id);
    return res.json({
      conversationId: id,
      contactName: conversation.contactName,
      contactPhone: conversation.contactPhone,
      leadScore
    });
  } catch (e) {
    return next(e);
  }
});

router.get("/dashboard/lead-scoring", async (req, res, next) => {
  try {
    const dashboardData = await getLeadScoringDashboard();
    return res.json(dashboardData);
  } catch (e) {
    return next(e);
  }
});

// Retorna los follow-ups pendientes desde la base de datos
router.get("/follow-ups/due", async (req, res, next) => {
  try {
    const dueFollowUps = await getDueFollowUps();
    return res.json(dueFollowUps);
  } catch (e) {
    return next(e);
  }
});

// Retorna los follow-ups de una conversación específica desde la DB
router.get("/:id/follow-ups", async (req, res, next) => {
  try {
    const { id } = GetConversationParams.parse(req.params);
    const convFollowUps = await db.select().from(followUps)
      .where(eq(followUps.conversationId, id))
      .orderBy(desc(followUps.scheduledFor));
    return res.json(convFollowUps);
  } catch (e) {
    return next(e);
  }
});

// Cancela (marca como completado) un follow-up por su ID numérico
router.delete("/follow-ups/:followUpId", async (req, res, next) => {
  try {
    const followUpId = parseInt(req.params.followUpId || "0");
    if (!followUpId) return res.status(400).json({ message: "ID de follow-up inválido" });

    const [cancelled] = await db.update(followUps)
      .set({ completed: true })
      .where(eq(followUps.id, followUpId))
      .returning();

    if (!cancelled) {
      return res.status(404).json({ message: "Follow-up no encontrado" });
    }
    return res.json({ success: true, message: "Follow-up cancelado" });
  } catch (e) {
    return next(e);
  }
});

function serializeConversation(row: typeof conversations.$inferSelect) {
  return {
    id: row.id,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    avatarColor: row.avatarColor,
    lastMessage: row.lastMessage ?? null,
    lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
    unreadCount: row.unreadCount,
    status: row.status,
    currentStage: row.currentStage ?? null,
    agentId: row.agentId ?? null,
    leadId: row.leadId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    stage: row.stage ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export default router;
