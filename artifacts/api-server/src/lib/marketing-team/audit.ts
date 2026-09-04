/**
 * ============================================================
 * MARKETING TEAM — AUDIT LOG (MASTER PLAN §32)
 * ============================================================
 * Registra todas las acciones importantes del equipo en
 * marketing_audit_logs. Regla: el resultado solo es SUCCESS si la
 * acción fue verificada contra la API (Meta / DB). Nunca se finge
 * éxito.
 */

import { db, marketingAuditLogs } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { logger } from "../logger";

export interface AuditEntry {
  tenantId: number;
  agent: string;
  taskId?: number | null;
  action: string;
  resource?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  approval?: string | null; // admin | system | auto_within_limits
  reason?: string | null;
  result?: "PENDING" | "SUCCESS" | "FAILED" | "MANUAL_ACTION_REQUIRED";
  error?: string | null;
  requestId?: string | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<number | null> {
  try {
    const [row] = await db
      .insert(marketingAuditLogs)
      .values({
        tenantId: entry.tenantId,
        agent: entry.agent,
        taskId: entry.taskId ?? null,
        action: entry.action,
        resource: entry.resource ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        approval: entry.approval ?? null,
        reason: entry.reason ?? null,
        result: entry.result ?? "PENDING",
        error: entry.error ?? null,
        requestId: entry.requestId ?? randomUUID(),
      })
      .returning({ id: marketingAuditLogs.id });
    return row?.id ?? null;
  } catch (err) {
    logger.error({ err, entry }, "[MarketingAudit] No se pudo registrar la acción");
    return null;
  }
}

export async function listAuditLogs(tenantId: number, limit = 100) {
  const { desc, eq } = await import("drizzle-orm");
  return db
    .select()
    .from(marketingAuditLogs)
    .where(eq(marketingAuditLogs.tenantId, tenantId))
    .orderBy(desc(marketingAuditLogs.createdAt))
    .limit(limit);
}
