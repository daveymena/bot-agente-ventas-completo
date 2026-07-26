/**
 * Almacén persistente del Architect/Operador.
 *
 * Usa la tabla `architect_memory` para que la conversación y el "plan
 * pendiente de aprobación" sobrevivan al cierre de sesión (antes la memoria
 * vivía solo en el frontend → al recargar, el Architect empezaba de cero).
 *
 * Convención sobre architect_memory:
 *  - Turnos de chat  → memoryType "observation", metadata.role = user|assistant
 *  - Plan pendiente  → memoryType "decision",   title "pending_plan", content = JSON de acciones
 */
import { db, architectMemory } from "@workspace/db";
import { and, eq, asc, desc } from "drizzle-orm";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PlannedAction {
  tool: string;
  args: Record<string, any>;
}

const MAX_HISTORY = 40;

export async function loadArchitectHistory(
  tenantId: number,
  sessionId: string,
): Promise<ChatTurn[]> {
  const rows = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "observation"),
      ),
    )
    .orderBy(asc(architectMemory.createdAt))
    .limit(MAX_HISTORY);

  return rows.map((r: any) => ({
    role: (r.metadata?.role as "user" | "assistant") || "user",
    content: r.content,
  }));
}

export async function saveArchitectTurn(
  tenantId: number,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  if (!content || !content.trim()) return;
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "observation",
    title: `turn:${role}`,
    content: content.slice(0, 8000),
    tags: [],
    metadata: { role },
  });
}

export async function getPendingPlan(
  tenantId: number,
  sessionId: string,
): Promise<{ id: number; actions: PlannedAction[]; reply: string } | null> {
  const [row] = await db
    .select()
    .from(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "decision"),
      ),
    )
    .orderBy(desc(architectMemory.createdAt))
    .limit(1);

  if (!row) return null;
  try {
    const parsed = JSON.parse(row.content);
    return {
      id: row.id,
      actions: parsed.actions || [],
      reply: parsed.reply || "",
    };
  } catch {
    return null;
  }
}

export async function setPendingPlan(
  tenantId: number,
  sessionId: string,
  actions: PlannedAction[],
  reply: string,
): Promise<void> {
  await clearPendingPlan(tenantId, sessionId);
  await db.insert(architectMemory).values({
    tenantId,
    sessionId,
    memoryType: "decision",
    title: "pending_plan",
    content: JSON.stringify({ actions, reply }),
    tags: [],
    metadata: {},
  });
}

export async function clearPendingPlan(
  tenantId: number,
  sessionId: string,
): Promise<void> {
  await db
    .delete(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
        eq(architectMemory.memoryType, "decision"),
      ),
    );
}

/** Borra toda la conversación persistida de una sesión (turnos + plan pendiente). */
export async function clearArchitectHistory(
  tenantId: number,
  sessionId: string,
): Promise<void> {
  await db
    .delete(architectMemory)
    .where(
      and(
        eq(architectMemory.tenantId, tenantId),
        eq(architectMemory.sessionId, sessionId),
      ),
    );
}

// Detección de aprobación/rechazo del plan pendiente en el mensaje del usuario.
export function isApproval(text: string): boolean {
  return /^\s*(s[ií]\b|dale|confirm|ok\b|okey|okay|h[aá]zlo|hacelo|aprob|adelante|proced|de una|listo|correcto|perfecto|ejec[uú]t|env[ií]a|s[ií] por favor|s[ií] hazlo)/i.test(
    text.trim(),
  );
}

export function isRejection(text: string): boolean {
  return /^\s*(no\b|cancel|espera|det[eé]n|mejor|cambia|cambi[eé]|otra|otro|as[ií] no|ninguno|nada)/i.test(
    text.trim(),
  );
}
