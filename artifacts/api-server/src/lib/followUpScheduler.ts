import { eq, and, lte, asc } from "drizzle-orm";
import { db, conversations, messages, activityEvents, followUps, type FollowUp, type InsertFollowUp } from "@workspace/db";
import { logger } from "./logger";
import { leadScoringEngine, type LeadStage } from "./leadScoring";
import { whatsapp } from "./whatsapp";

export class FollowUpScheduler {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMinutes: number = 30): void {
    if (this.isRunning) {
      logger.warn("[FollowUpScheduler] Already running");
      return;
    }

    this.isRunning = true;
    logger.info({ intervalMinutes }, "[FollowUpScheduler] Starting scheduler");

    this.processDueFollowUps().catch(error => {
      logger.error({ error }, "[FollowUpScheduler] Initial processing failed");
    });

    this.intervalId = setInterval(() => {
      this.processDueFollowUps().catch(error => {
        logger.error({ error }, "[FollowUpScheduler] Scheduled processing failed");
      });
    }, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    logger.info("[FollowUpScheduler] Scheduler stopped");
  }

  async scheduleFollowUp(
    conversationId: number,
    stage: string,
    score: number,
    scheduledFor?: Date
  ): Promise<FollowUp | null> {
    try {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
      if (!conversation) return null;

      if (!scheduledFor) {
        scheduledFor = this.calculateFollowUpDate(stage);
      }

      const followUpType = this.determineFollowUpType(stage, score);
      const priority = this.determinePriority(stage, score);
      const message = leadScoringEngine.generateFollowUpMessage(stage as LeadStage, conversation.lastMessage || "");

      const [followUp] = await db.insert(followUps).values({
        conversationId,
        leadId: conversation.leadId,
        contactName: conversation.contactName,
        contactPhone: conversation.contactPhone,
        scheduledFor: scheduledFor.toISOString(),
        followUpType,
        message,
        priority,
        stage,
        lastScore: score,
        attempts: 0,
        completed: false
      }).returning();

      logger.info({ followUpId: followUp!.id, conversationId, stage }, "[FollowUpScheduler] Follow-up scheduled in DB");
      return followUp!;
    } catch (error) {
      logger.error({ error, conversationId }, "[FollowUpScheduler] Failed to schedule follow-up");
      return null;
    }
  }

  async processDueFollowUps(): Promise<void> {
    try {
      const now = new Date();
      const dueFollowUps = await db.select().from(followUps)
        .where(and(eq(followUps.completed, false), lte(followUps.scheduledFor, now)))
        .orderBy(asc(followUps.scheduledFor));

      if (dueFollowUps.length === 0) return;

      logger.info({ count: dueFollowUps.length }, "[FollowUpScheduler] Processing due follow-ups from DB");

      for (const followUp of dueFollowUps) {
        await this.processFollowUp(followUp);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      logger.error({ error }, "[FollowUpScheduler] Failed to process due follow-ups");
    }
  }

  private async processFollowUp(followUp: FollowUp): Promise<void> {
    try {
      if (!whatsapp.isConnected()) {
        logger.warn({ followUpId: followUp.id }, "[FollowUpScheduler] WhatsApp not connected");
        return;
      }

      await whatsapp.sendText(followUp.contactPhone, followUp.message);

      await db.update(followUps)
        .set({ completed: true, attempts: followUp.attempts + 1 })
        .where(eq(followUps.id, followUp.id));

      await db.insert(activityEvents).values({
        type: "follow_up_sent",
        title: `Follow-up enviado a ${followUp.contactName}`,
        subtitle: `Tipo: ${followUp.followUpType}`,
      });

      logger.info({ followUpId: followUp.id }, "[FollowUpScheduler] Follow-up sent and marked in DB");
    } catch (error) {
      logger.error({ error, followUpId: followUp.id }, "[FollowUpScheduler] Failed to process follow-up");
      await db.update(followUps)
        .set({ attempts: followUp.attempts + 1 })
        .where(eq(followUps.id, followUp.id));
    }
  }

  async getMetrics(): Promise<{
    totalScheduled: number;
    overdue: number;
    successRate: number;
    responseRate: number;
  }> {
    const all = await db.select().from(followUps);
    const totalScheduled = all.length;
    const completed = all.filter(f => f.completed).length;
    const overdue = all.filter(f => !f.completed && f.scheduledFor < new Date()).length;

    return {
      totalScheduled,
      overdue,
      successRate: totalScheduled > 0 ? Math.round((completed / totalScheduled) * 100) : 0,
      responseRate: 0
    };
  }

  async getDueFollowUpsFromDB(): Promise<FollowUp[]> {
    const now = new Date();
    return db.select().from(followUps)
      .where(and(eq(followUps.completed, false), lte(followUps.scheduledFor, now)))
      .orderBy(asc(followUps.scheduledFor));
  }

  private calculateFollowUpDate(stage: string): Date {
    const now = new Date();
    const delay = 24 * 60 * 60 * 1000;
    return new Date(now.getTime() + delay);
  }

  private determineFollowUpType(stage: string, score: number): string {
    return "check_in";
  }

  private determinePriority(stage: string, score: number): string {
    return "medium";
  }
}

export const followUpScheduler = new FollowUpScheduler();
followUpScheduler.start(30);

export async function scheduleIntelligentFollowUp(conversationId: number, stage: string, score: number) {
  return followUpScheduler.scheduleFollowUp(conversationId, stage, score);
}

export function getFollowUpMetrics(): Promise<{ totalScheduled: number; overdue: number; successRate: number; responseRate: number }> {
  return followUpScheduler.getMetrics();
}

export async function getDueFollowUps(): Promise<FollowUp[]> {
  return followUpScheduler.getDueFollowUpsFromDB();
}
