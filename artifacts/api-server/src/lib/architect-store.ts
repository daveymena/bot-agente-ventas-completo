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

// ── Lecciones de reparaciones ────────────────────────────────────────────────
// Cuando el Operador falla en ejecutar una acción aprobada y logra
// arreglarlo solo (ver attemptSelfRepair en code-agent.ts), se guarda qué
// pasó y cómo se resolvió. Es memoria POR TENANT, no por sesión de chat —
// sessionId fijo "global" — para que la lección sirva en cualquier
// conversación futura, no solo en la que ocurrió el error.
const LESSONS_SESSION = "global";
const MAX_LESSONS_IN_PROMPT = 6;

export async function saveRepairLesson(
  tenantId: number,
  tool: string,
  errorSummary: string,
  fixSummary: string,
): Promise<void> {
  try {
    await db.insert(architectMemory).values({
      tenantId,
      sessionId: LESSONS_SESSION,
      memoryType: "reflection",
      title: `lesson:${tool}`,
      content: `Herramienta "${tool}" falló (${errorSummary.slice(0, 200)}). Se resolvió: ${fixSummary.slice(0, 300)}`,
      tags: [tool],
      metadata: { tool },
    });
  } catch {
    // La lección es un extra, no algo crítico -- si falla guardarla no debe
    // romper la respuesta al admin.
  }
}

export async function loadRecentLessons(tenantId: number): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(architectMemory)
      .where(
        and(
          eq(architectMemory.tenantId, tenantId),
          eq(architectMemory.sessionId, LESSONS_SESSION),
          eq(architectMemory.memoryType, "reflection"),
        ),
      )
      .orderBy(desc(architectMemory.createdAt))
      .limit(MAX_LESSONS_IN_PROMPT);
    return rows.map((r: any) => r.content);
  } catch {
    return [];
  }
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
// Solo se llama cuando YA hay un plan pendiente esperando sí/no (el caller
// filtra por `pending.actions.length > 0`) — no en medio de una conversación
// libre — así que una palabra suelta acá no es ambigua: es LA respuesta a
// "¿Confirmas? Responde sí para ejecutar". Antes esta función exigía una
// frase compuesta ("sí ejecuta", "sí adelante") y rechazaba un "sí" o "ok"
// solos — exactamente lo que el propio mensaje le pide al usuario que
// escriba — así que el admin confirmaba, el plan se descartaba por "no
// reconocido" y la IA volvía a proponer el mismo plan en bucle infinito.
export function isApproval(text: string): boolean {
  let t = text.trim().toLowerCase().replace(/[!.¡¿?]+$/g, "").trim();
  // Muletillas al inicio ("entonces", "bueno", "pues", "vale", "ya") no
  // cambian el sentido: "entonces confirmado" aprueba igual que "confirmado"
  // solo. Sin este strip, isApproval() la rechazaba, el plan pendiente se
  // borraba sin ejecutar y la IA volvía a proponer el MISMO plan — bucle
  // visto en vivo con exactamente esta frase.
  t = t.replace(/^(entonces|bueno|pues|vale|ya)[,\s]+/i, "").trim();
  // La palabra sola (o con una coletilla corta tipo "sí porfa", "dale pues")
  // ES la confirmación. "sí pero cambia el texto" NO debe contar como
  // aprobación — por eso se exige que sea (casi) todo el mensaje, no un
  // prefijo de una frase más larga con un "pero/pero que/cambia" después.
  if (/^(s[ií]|sip|ok(ay)?|dale|confirmo|confirmado|apruebo|adelante|proced[eo]|listo|claro|hazlo|ejec[uú]talo|correcto|perfecto|va|eso)(\s+(porfa|por\s+favor|pues|ya|nomas|no\s+m[aá]s))?$/i.test(t)) {
    return true;
  }
  return /^\s*(s[ií]\s+(haz|por\s+favor|adelante|dale|ejecuta|procede|confirm(o|a|ado|ada)|apruebo|estoy\s+de\s+acuerdo)|dale\s+haz|ejecuta\s+(el\s+)?plan|apruebo\s+(el\s+)?plan|confirm(o|a|ado|ada)\s+(la\s+)?ejecuci|procede\s+con\s+todo|publ[ií]calo(\s+ya)?)/i.test(t);
}

export function isRejection(text: string): boolean {
  return /^\s*(no\b|cancel|espera|det[eé]n|mejor|cambia|cambi[eé]|otra|otro|as[ií] no|ninguno|nada)/i.test(
    text.trim(),
  );
}
