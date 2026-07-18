import { db, responseAnalytics, agents, conversations } from "@workspace/db";
import { eq, and, desc, gte, sql, lte } from "drizzle-orm";
import { logger } from "./logger";
import type { ResponseAnalytics, InsertResponseAnalytics, ResponseOutcome } from "@workspace/db";

export class ResponseAnalyticsEngine {
  async trackResponse(data: InsertResponseAnalytics): Promise<ResponseAnalytics> {
    const [record] = await db
      .insert(responseAnalytics)
      .values({
        ...data,
        outcome: data.outcome || null,
        sentimentScore: data.sentimentScore ?? null,
        cardProductId: data.cardProductId ?? null,
        metadata: data.metadata || null,
      })
      .returning();
    return record;
  }

  async updateOutcome(id: number, outcome: ResponseOutcome, metadata?: Record<string, any>): Promise<void> {
    await db
      .update(responseAnalytics)
      .set({ outcome, metadata: metadata || null })
      .where(eq(responseAnalytics.id, id));
  }

  async getStats(agentId?: number, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    let query = db
      .select({
        total: sql<number>`count(*)`,
        withCard: sql<number>`sum(case when ${responseAnalytics.hadCard} then 1 else 0 end)`,
        sales: sql<number>`sum(case when ${responseAnalytics.outcome} = 'sale_completed' then 1 else 0 end)`,
        leadProgress: sql<number>`sum(case when ${responseAnalytics.outcome} = 'lead_progressed' then 1 else 0 end)`,
        confused: sql<number>`sum(case when ${responseAnalytics.outcome} = 'customer_confused' then 1 else 0 end)`,
        left: sql<number>`sum(case when ${responseAnalytics.outcome} = 'customer_left' then 1 else 0 end)`,
        avgLength: sql<number>`avg(${responseAnalytics.responseLength})`,
        avgResponseMs: sql<number>`avg(${responseAnalytics.responseTimeMs})`,
        avgSentiment: sql<number>`avg(${responseAnalytics.sentimentScore})`,
      })
      .from(responseAnalytics)
      .where(gte(responseAnalytics.createdAt, since));

    if (agentId) {
      query = query.where(eq(responseAnalytics.agentId, agentId));
    }

    const [stats] = await query;
    return stats;
  }

  async getConversionRate(agentId?: number, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const total = await db
      .select({ count: sql<number>`count(*)` })
      .from(responseAnalytics)
      .where(
        agentId
          ? and(eq(responseAnalytics.agentId, agentId), gte(responseAnalytics.createdAt, since))
          : gte(responseAnalytics.createdAt, since)
      );

    const sales = await db
      .select({ count: sql<number>`count(*)` })
      .from(responseAnalytics)
      .where(
        agentId
          ? and(eq(responseAnalytics.agentId, agentId), eq(responseAnalytics.outcome, "sale_completed"), gte(responseAnalytics.createdAt, since))
          : and(eq(responseAnalytics.outcome, "sale_completed"), gte(responseAnalytics.createdAt, since))
      );

    const totalCount = Number(total[0]?.count || 0);
    const salesCount = Number(sales[0]?.count || 0);
    return {
      total: totalCount,
      sales: salesCount,
      conversionRate: totalCount > 0 ? Math.round((salesCount / totalCount) * 100) : 0,
    };
  }

  async getAgentRanking(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return db
      .select({
        agentId: responseAnalytics.agentId,
        total: sql<number>`count(*)`,
        sales: sql<number>`sum(case when ${responseAnalytics.outcome} = 'sale_completed' then 1 else 0 end)`,
        confused: sql<number>`sum(case when ${responseAnalytics.outcome} = 'customer_confused' then 1 else 0 end)`,
        avgSentiment: sql<number>`avg(${responseAnalytics.sentimentScore})`,
      })
      .from(responseAnalytics)
      .where(gte(responseAnalytics.createdAt, since))
      .groupBy(responseAnalytics.agentId)
      .orderBy(desc(sql<number>`sum(case when ${responseAnalytics.outcome} = 'sale_completed' then 1 else 0 end)`));
  }

  async getWeeklyReport() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const stats = await this.getStats(undefined, 7);
    const ranking = await this.getAgentRanking(7);

    const topAgent = ranking[0] || null;
    const worstAgent = ranking.length > 0 ? ranking[ranking.length - 1] : null;

    return {
      period: {
        start: weekAgo.toISOString(),
        end: new Date().toISOString(),
      },
      stats,
      ranking,
      topAgent,
      worstAgent,
      totalAgents: ranking.length,
    };
  }
}

export const responseAnalyticsEngine = new ResponseAnalyticsEngine();
