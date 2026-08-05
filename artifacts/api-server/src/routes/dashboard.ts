import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetFunnelResponse,
  GetMessagesTimelineResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import {
  db,
  activityEvents,
  conversations,
  leads,
  messages,
} from "@workspace/db";
import { getWhatsAppForTenant } from "../lib/whatsapp-factory";

const router: IRouter = Router();
const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

/** El dashboard es el resumen de LA cuenta que lo pide, nunca de todas. */
function tenantIdOf(req: any): number | null {
  const id = req?.tenant?.id;
  return typeof id === "number" ? id : null;
}

const USE_SQLITE = process.env.USE_SQLITE === "true";
const DATE_FN = USE_SQLITE
  ? sql<string>`strftime('%Y-%m-%d', ${messages.createdAt})`
  : sql<string>`to_char(${messages.createdAt}, 'YYYY-MM-DD')`;

// SQLite (sql.js) no puede enlazar objetos Date como parámetros y las fechas se
// guardan como TEXT con formato "YYYY-MM-DD HH:MM:SS". En Postgres la columna es
// timestamp y acepta Date directamente. Este helper devuelve el valor correcto
// para cada motor y evita el error 500 al comparar fechas.
const toDbDate = (d: Date): string | Date =>
  USE_SQLITE ? d.toISOString().slice(0, 19).replace("T", " ") : d;

router.get("/summary", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const allLeads = await db.select().from(leads).where(eq(leads.tenantId, tenantId));
    const allConvos = await db.select().from(conversations).where(eq(conversations.tenantId, tenantId));

    const totalLeads = allLeads.length;
    const wonLeads = allLeads.filter((l) => l.stage === "won");
    const wonDeals = wonLeads.length;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const revenueThisMonth = wonLeads
      .filter((l) => new Date(l.createdAt as any) >= startOfMonth)
      .reduce((acc, l) => acc + Number(l.value), 0);
    const conversionRate = totalLeads === 0 ? 0 : Math.round((wonDeals / totalLeads) * 100);

    // messages no guarda tenantId: se acota por las conversaciones del tenant.
    const convoIds = allConvos.map((c) => c.id);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayMsgs = convoIds.length
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(and(gte(messages.createdAt, toDbDate(startOfDay) as any), inArray(messages.conversationId, convoIds)))
      : [{ count: 0 }];

    // Estado real de WhatsApp para ESTE tenant (antes se usaba un badge sin
    // fuente real: el campo whatsappConnected no existía en la respuesta,
    // así que el frontend siempre mostraba "Desconectado" sin importar el
    // estado real de la conexión).
    const whatsappConnected = getWhatsAppForTenant(tenantId, (req as any).tenant).isConnected();

    // Tiempo de respuesta real: promedio de los últimos 50 pares mensaje del
    // cliente → respuesta del asistente, en esta cuenta (antes era un 45
    // fijo, igual para todas las cuentas todo el tiempo).
    const recentMsgs = convoIds.length
      ? await db
          .select({ conversationId: messages.conversationId, role: messages.role, createdAt: messages.createdAt })
          .from(messages)
          .where(inArray(messages.conversationId, convoIds))
          .orderBy(desc(messages.createdAt))
          .limit(400)
      : [];
    const byConvoAsc = [...recentMsgs].reverse(); // orderBy desc + limit trae los más recientes; procesar en orden cronológico
    const responseTimesSec: number[] = [];
    let pendingAt: Date | null = null;
    let pendingConvo: number | null = null;
    for (const m of byConvoAsc) {
      if (m.conversationId !== pendingConvo) {
        pendingAt = null;
        pendingConvo = m.conversationId;
      }
      if (m.role === "customer") {
        pendingAt = m.createdAt as any;
      } else if (m.role === "assistant" && pendingAt) {
        const diff = (new Date(m.createdAt as any).getTime() - new Date(pendingAt).getTime()) / 1000;
        if (diff > 0 && diff < 30 * 60) responseTimesSec.push(diff);
        pendingAt = null;
      }
    }
    const avgResponseTime = responseTimesSec.length > 0
      ? Math.round(responseTimesSec.reduce((a, b) => a + b, 0) / responseTimesSec.length)
      : 0;

    return res.json(
      GetDashboardSummaryResponse.parse({
        totalLeads,
        activeConversations: allConvos.filter((c) => c.status !== "closed").length,
        conversionRate,
        totalRevenue: revenueThisMonth,
        avgResponseTime,
        messagesLast24h: Number(todayMsgs[0]?.count ?? 0),
        newLeadsToday: allLeads.filter((l) => new Date(l.createdAt as any) >= startOfDay).length,
        closedDeals: wonDeals,
        whatsappConnected,
      }),
    );
  } catch (e) {
    return next(e);
  }
});

router.get("/activity", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    // activity_events no tiene columna tenant_id en el esquema actual — todavía
    // se comparte entre cuentas. Requiere una migración de esquema (agregar la
    // columna y backfill) que queda pendiente; no se resuelve con un filtro aquí.
    const rows = await db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(20);
    return res.json(
      GetRecentActivityResponse.parse(
        rows.map((r) => ({
          id: r.id,
          type: r.type,
          description: r.title + (r.subtitle ? ` — ${r.subtitle}` : ""),
          createdAt: safeISO(r.createdAt),
          metadata: null,
        })),
      ),
    );
  } catch (e) {
    return next(e);
  }
});

router.get("/funnel", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const rows = await db.select().from(leads).where(eq(leads.tenantId, tenantId));
    const total = rows.length || 1;
    const grouped = STAGES.map((stage) => {
      const subset = rows.filter((r) => r.stage === stage);
      return {
        stage,
        count: subset.length,
        percentage: Math.round((subset.length / total) * 100),
      };
    });
    return res.json(GetFunnelResponse.parse(grouped));
  } catch (e) {
    return next(e);
  }
});

router.get("/messages-timeline", async (req, res, next) => {
  try {
    const tenantId = tenantIdOf(req);
    if (!tenantId) return res.status(401).json({ message: "No autorizado" });

    const tenantConvos = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.tenantId, tenantId));
    const convoIds = tenantConvos.map((c) => c.id);

    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const rows = convoIds.length
      ? await db
          .select({
            day: DATE_FN,
            role: messages.role,
            count: sql<number>`count(*)`,
          })
          .from(messages)
          .where(and(gte(messages.createdAt, toDbDate(start) as any), inArray(messages.conversationId, convoIds)))
          .groupBy(DATE_FN, messages.role)
      : [];

    const map = new Map<string, { incoming: number; outgoing: number }>();
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = safeISO(d).slice(0, 10);
      map.set(key, { incoming: 0, outgoing: 0 });
    }
    for (const r of rows) {
      const cur = map.get(r.day) ?? { incoming: 0, outgoing: 0 };
      if (r.role === "customer") cur.incoming += Number(r.count);
      else cur.outgoing += Number(r.count);
      map.set(r.day, cur);
    }
    const series = Array.from(map.entries()).map(([date, v]) => ({
      date,
      messages: v.incoming + v.outgoing,
      conversations: 0,
    }));
    return res.json(GetMessagesTimelineResponse.parse(series));
  } catch (e) {
    return next(e);
  }
});

export default router;
