import { safeISO } from "../lib/date-utils";
import { Router, type IRouter } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
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
import { whatsapp } from "../lib/whatsapp";

const router: IRouter = Router();
const STAGES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;

router.get("/summary", async (_req, res, next) => {
  try {
    const allLeads = await db.select().from(leads);
    const allConvos = await db.select().from(conversations);

    const totalLeads = allLeads.length;
    const wonLeads = allLeads.filter((l) => l.stage === "won");
    const wonDeals = wonLeads.length;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const revenueThisMonth = wonLeads
      .filter((l) => l.createdAt >= startOfMonth)
      .reduce((acc, l) => acc + Number(l.value), 0);
    const conversionRate = totalLeads === 0 ? 0 : Math.round((wonDeals / totalLeads) * 100);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayMsgs = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(gte(messages.createdAt, startOfDay));

    return res.json(
      GetDashboardSummaryResponse.parse({
        totalLeads,
        activeConversations: allConvos.filter((c) => c.status !== "closed").length,
        conversionRate,
        totalRevenue: revenueThisMonth,
        avgResponseTime: 45,
        messagesLast24h: Number(todayMsgs[0]?.count ?? 0),
        newLeadsToday: allLeads.filter((l) => l.createdAt >= startOfDay).length,
        closedDeals: wonDeals,
      }),
    );
  } catch (e) {
    return next(e);
  }
});

router.get("/activity", async (_req, res, next) => {
  try {
    const rows = await db.select().from(activityEvents).orderBy(desc(activityEvents.createdAt)).limit(20);
    return res.json(
      GetRecentActivityResponse.parse(
        rows.map((r) => ({
          id: r.id,
          type: r.type,
          description: r.title + (r.subtitle ? ` — ${r.subtitle}` : ""),
          createdAt: r.safeISO(createdAt),
          metadata: null,
        })),
      ),
    );
  } catch (e) {
    return next(e);
  }
});

router.get("/funnel", async (_req, res, next) => {
  try {
    const rows = await db.select().from(leads);
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

router.get("/messages-timeline", async (_req, res, next) => {
  try {
    const days = 14;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const rows = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`,
        role: messages.role,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(gte(messages.createdAt, start))
      .groupBy(sql`date_trunc('day', ${messages.createdAt})`, messages.role);

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
