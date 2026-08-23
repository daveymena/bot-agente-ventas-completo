import { safeISO, dbNow } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, lte, ne, or } from "drizzle-orm";
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
import { type AgentReplyPart } from "../lib/whatsapp-singleton";
import { getWhatsAppForTenant } from "../lib/whatsapp-factory";
// El proxy "whatsapp-singleton" siempre apunta a la instancia del tenant por
// defecto (getCurrentTenantId() está fijo) -- usarlo acá enviaba la respuesta
// de un cliente del tenant 2 desde el número de WhatsApp del tenant 1. Se usa
// getWhatsAppForTenant(tenantId) para operar siempre sobre la instancia real
// del tenant dueño de esta conversación.
import { logger } from "../lib/logger";
import { getLeadScore, getLeadScoringDashboard } from "../lib/leadScoring";
import { followUpScheduler, getDueFollowUps } from "../lib/followUpScheduler";
import {
  apiRateLimit,
  conversationRateLimit,
  aiCostTracker,
} from "../middleware/rateLimiting";
import { validateMessageLimit } from "../middleware/featureLimits";

const router: IRouter = Router();

router.use(apiRateLimit);

/**
 * Tenant de la sesión. TODA consulta de conversaciones debe filtrar por él:
 * sin esto un administrador ve las conversaciones, teléfonos y mensajes de
 * los clientes de otro — la fuga más grave posible en un SaaS.
 */
function tenantIdOf(req: any): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const q = ListConversationsQueryParams.parse(req.query);
    const filters = [eq(conversations.tenantId, tenantId)];
    if (q.status) filters.push(eq(conversations.status, q.status));
    if (q.search && q.search.trim()) {
      const term = `%${q.search.trim()}%`;
      filters.push(or(ilike(conversations.contactName, term), ilike(conversations.contactPhone, term))!);
    }
    const rows = await db
      .select()
      .from(conversations)
      .where(and(...filters))
      .orderBy(desc(conversations.lastMessageAt));
    return res.json(ListConversationsResponse.parse(rows.map(serializeConversation)));
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/conversations/pendientes
 *
 * La bandeja ordenada por lo que hay que hacer, no por fecha: de estos diez,
 * a cuál atender primero y qué le falta para que compre. Es la regla del spec
 * de V2 -- "no dejar leads sin siguiente acción".
 *
 * Va en un endpoint aparte y no como campo del listado porque ese pasa por
 * `ListConversationsResponse.parse()`, un esquema generado por orval que hoy
 * no se puede regenerar (ver la nota en routes/products.ts): agregarle un
 * campo lo haría fallar o se perdería en la próxima regeneración.
 *
 * La próxima acción se calcula al vuelo. Guardarla en una columna crearía una
 * segunda verdad que queda vieja apenas el cliente escribe.
 *
 * Declarado ANTES de "/:id" o Express tomaría "pendientes" como un id.
 */
router.get("/pendientes", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { siguienteAccion } = await import("../lib/next-best-action");
    const { cargarPerfil } = await import("../lib/customer-profile");

    const convos = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), ne(conversations.status, "closed")))
      .orderBy(desc(conversations.lastMessageAt))
      .limit(100);

    const ahora = Date.now();
    const items = [];
    for (const c of convos as any[]) {
      // Quién habló último decide si le debemos una respuesta, que es la
      // acción que le gana a todas.
      const [ultimo] = await db
        .select({ role: messages.role, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, c.id))
        .orderBy(desc(messages.id))
        .limit(1);

      const perfil = await cargarPerfil(c.leadId);
      const horasSinEscribir = c.lastMessageAt
        ? Math.max(0, Math.floor((ahora - new Date(c.lastMessageAt).getTime()) / 3600000))
        : 0;

      const nba = siguienteAccion({
        etapa: c.currentStage ?? null,
        estadoDePago: c.paymentStatus ?? null,
        clienteEscribioUltimo: ultimo?.role === "customer",
        horasSinEscribir,
        productosVistos: perfil.productosVistos?.length ?? 0,
        objecionAbierta: perfil.objeciones?.[0]?.tipo ?? null,
        // Sin respuesta del cliente después de que el agente escribió último.
        seguimientoSinRespuesta: ultimo?.role !== "customer" && horasSinEscribir > 48,
      });

      items.push({
        id: c.id,
        contactName: c.contactName,
        contactPhone: c.contactPhone,
        etapa: c.currentStage,
        horasSinEscribir,
        productoEnFoco: perfil.productosVistos?.[0]?.nombre ?? null,
        ...nba,
      });
    }

    items.sort((a, b) => a.prioridad - b.prioridad || b.horasSinEscribir - a.horasSinEscribir);
    return res.json({ total: items.length, items });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/conversations/:id/resumen-comercial
 *
 * El texto que recibe el vendedor humano cuando se le transfiere el chat: con
 * el perfil comercial del lead y la próxima acción alcanza para seguir la
 * venta sin leerse veinte mensajes ni repetirle al cliente preguntas que ya
 * contestó. Es la Fase 8 (handoff con contexto) del plan V2.
 *
 * Va en un endpoint aparte y no como campo del handoff porque ese pasa por
 * `HandoffConversationResponse.parse()`, un esquema generado por orval que hoy
 * no se puede regenerar (ver la nota en routes/products.ts).
 *
 * Declarado ANTES de "/:id" o Express tomaría "resumen-comercial" como un id.
 */
router.get("/:id/resumen-comercial", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = GetConversationParams.parse(req.params);
    const [convo] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
    if (!convo) return res.status(404).json({ message: "Conversación no encontrada" });

    const { resumenParaHumano } = await import("../lib/handoff-brief");
    const { cargarPerfil } = await import("../lib/customer-profile");

    const [ultimo] = await db
      .select({ role: messages.role, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(desc(messages.id))
      .limit(1);

    const [ultimoDelCliente] = await db
      .select({ content: messages.content })
      .from(messages)
      .where(and(eq(messages.conversationId, id), eq(messages.role, "customer")))
      .orderBy(desc(messages.id))
      .limit(1);

    const perfil = await cargarPerfil(convo.leadId);
    const horasSinEscribir = convo.lastMessageAt
      ? Math.max(0, Math.floor((Date.now() - new Date(convo.lastMessageAt).getTime()) / 3600000))
      : 0;

    let puntaje: number | null = null;
    try {
      const leadScore = await getLeadScore(id);
      puntaje = leadScore.totalScore;
    } catch (e) {
      logger.warn({ err: e, conversationId: id }, "[HandoffBrief] No se pudo calcular el puntaje");
    }

    const datos = {
      nombre: convo.contactName ?? null,
      telefono: convo.contactPhone ?? null,
      ciudad: perfil.ciudad ?? null,
      productoEnFoco: perfil.productosVistos?.[0]?.nombre ?? null,
      ultimoMensajeDelCliente: ultimoDelCliente?.content ?? null,
      puntaje,
      etapa: convo.currentStage ?? null,
      estadoDePago: convo.paymentStatus ?? null,
      clienteEscribioUltimo: ultimo?.role === "customer",
      horasSinEscribir,
      productosVistos: perfil.productosVistos?.length ?? 0,
      objecionAbierta: perfil.objeciones?.[0]?.tipo ?? null,
      seguimientoSinRespuesta: ultimo?.role !== "customer" && horasSinEscribir > 48,
    };

    return res.json({ resumen: resumenParaHumano(datos), datos });
  } catch (e) {
    return next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = GetConversationParams.parse(req.params);
    // El id se acota al tenant: pedir el id de otro devuelve 404, no sus datos.
    const [row] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
    if (!row) return res.status(404).json({ message: "Conversación no encontrada" });
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
    return res.json(GetConversationResponse.parse(serializeConversation({ ...row, unreadCount: 0 })));
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = UpdateConversationParams.parse(req.params);
    const body = UpdateConversationBody.parse(req.body);
    const [updated] = await db
      .update(conversations)
      .set(body)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .returning();
    if (!updated) return res.status(404).json({ message: "Conversación no encontrada" });
    return res.json(UpdateConversationResponse.parse(serializeConversation(updated)));
  } catch (e) {
    return next(e);
  }
});

router.get("/:id/messages", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = ListMessagesParams.parse(req.params);
    // messages no guarda tenantId: se valida que la conversación sea del tenant
    // ANTES de leer los mensajes, o cualquiera leería chats ajenos por id.
    const [owner] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
    if (!owner) return res.status(404).json({ message: "Conversación no encontrada" });

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

router.post("/:id/messages", conversationRateLimit, validateMessageLimit(), aiCostTracker, async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = SendMessageParams.parse(req.params);
    const body = SendMessageBody.parse(req.body);
    const [convo] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
      .limit(1);
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
      // dbNow(): Postgres exige Date en esta columna, un string la revienta.
      .set({ lastMessage: body.content, lastMessageAt: dbNow(), status: body.asHuman ? "human" : convo.status })
      .where(eq(conversations.id, id));

    const waInstance = getWhatsAppForTenant(tenantId);
    if (waInstance.isConnected()) {
      try {
        await waInstance.sendText(convo.contactPhone, body.content);
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
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = HandoffConversationParams.parse(req.params);
    const body = HandoffConversationBody.parse(req.body);
    const [updated] = await db
      .update(conversations)
      .set({ status: body.target })
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)))
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
        const waInstance = getWhatsAppForTenant(tenantId);
        if (reply && waInstance.isConnected()) {
          await waInstance.sendAgentParts(updated.contactPhone, updated.contactName, reply.parts as AgentReplyPart[]);
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
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = GetConversationParams.parse(req.params);
    const [conversation] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId))).limit(1);
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
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const dashboardData = await getLeadScoringDashboard(tenantId);
    return res.json(dashboardData);
  } catch (e) {
    return next(e);
  }
});

// Retorna los follow-ups pendientes desde la base de datos
router.get("/follow-ups/due", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const dueFollowUps = await getDueFollowUps(tenantId);
    return res.json(dueFollowUps);
  } catch (e) {
    return next(e);
  }
});

// Retorna los follow-ups de una conversación específica desde la DB
router.get("/:id/follow-ups", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const { id } = GetConversationParams.parse(req.params);
    // Se valida que la conversación sea del tenant ANTES de leer sus follow-ups,
    // mismo criterio que /:id/messages -- si no, cualquiera podía leer los
    // follow-ups (nombre, teléfono, mensaje) de una conversación ajena por id.
    const [owner] = await db.select({ id: conversations.id }).from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId))).limit(1);
    if (!owner) return res.status(404).json({ message: "Conversación no encontrada" });

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
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const followUpId = parseInt(req.params.followUpId || "0");
    if (!followUpId) return res.status(400).json({ message: "ID de follow-up inválido" });

    // followUps no tiene tenantId propio -- se valida vía join con la
    // conversación dueña antes de tocar nada, si no cualquier tenant podía
    // cancelar follow-ups de otro con solo adivinar/iterar el id numérico.
    const [owned] = await db.select({ id: followUps.id }).from(followUps)
      .innerJoin(conversations, eq(followUps.conversationId, conversations.id))
      .where(and(eq(followUps.id, followUpId), eq(conversations.tenantId, tenantId)))
      .limit(1);
    if (!owned) return res.status(404).json({ message: "Follow-up no encontrado" });

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
    lastMessageAt: row.lastMessageAt ? safeISO(row.lastMessageAt) : null,
    unreadCount: row.unreadCount,
    status: row.status,
    currentStage: row.currentStage ?? null,
    agentId: row.agentId ?? null,
    leadId: row.leadId ?? null,
    createdAt: safeISO(row.createdAt),
  };
}

function serializeMessage(row: typeof messages.$inferSelect) {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    stage: row.stage ?? null,
    createdAt: safeISO(row.createdAt),
  };
}

export default router;
