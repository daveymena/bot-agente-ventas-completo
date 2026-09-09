/** Auditoría transversal de Atlas. Nunca guarda secretos ni texto sin límite. */
import { createHash, randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "./logger";

const SENSITIVE_KEY = /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential)/i;
const MAX_TEXT = 2_000;

function redact(value: any, depth = 0): any {
  if (depth > 5) return "[depth-limit]";
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1),
  ]));
}

export interface ControlPlaneAuditEntry {
  tenantId: number;
  sessionId?: string | null;
  turnId?: string | null;
  requestId?: string;
  actor: string;
  tool: string;
  phase: "started" | "finished";
  status: "allowed" | "success" | "failed" | "blocked";
  arguments?: unknown;
  result?: unknown;
  error?: string | null;
}

/**
 * Escribe una fila y enlaza su hash con la última del tenant dentro de un
 * advisory lock transaccional. Las acciones críticas deben usar failClosed.
 */
export async function recordControlPlaneAudit(
  entry: ControlPlaneAuditEntry,
  failClosed = false,
): Promise<number | null> {
  if (!pool) {
    if (failClosed) throw new Error("Auditoría de Atlas no disponible");
    return null;
  }

  let client: any = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [entry.tenantId]);
    const previous = await client.query(
      "SELECT entry_hash FROM control_plane_audit WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1",
      [entry.tenantId],
    );
    const previousHash = previous.rows[0]?.entry_hash || null;
    const requestId = entry.requestId || randomUUID();
    const argumentsJson = redact(entry.arguments ?? {});
    const resultJson = entry.result === undefined ? null : redact(entry.result);
    const canonical = JSON.stringify({
      tenantId: entry.tenantId,
      requestId,
      actor: entry.actor,
      tool: entry.tool,
      phase: entry.phase,
      status: entry.status,
      arguments: argumentsJson,
      result: resultJson,
      error: entry.error || null,
      previousHash,
    });
    const entryHash = createHash("sha256").update(canonical).digest("hex");
    const inserted = await client.query(
      `INSERT INTO control_plane_audit
        (tenant_id, session_id, turn_id, request_id, actor, tool, phase, status,
         arguments, result, error, previous_hash, entry_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)
       RETURNING id`,
      [
        entry.tenantId,
        entry.sessionId || null,
        entry.turnId || null,
        requestId,
        entry.actor,
        entry.tool,
        entry.phase,
        entry.status,
        JSON.stringify(argumentsJson),
        resultJson === null ? null : JSON.stringify(resultJson),
        entry.error ? String(entry.error).slice(0, MAX_TEXT) : null,
        previousHash,
        entryHash,
      ],
    );
    await client.query("COMMIT");
    return inserted.rows[0]?.id ? Number(inserted.rows[0].id) : null;
  } catch (error: any) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error({ err: error?.message, tenantId: entry.tenantId, tool: entry.tool }, "[AtlasAudit] No se pudo registrar la acción");
    if (failClosed) throw new Error("Auditoría de Atlas no disponible");
    return null;
  } finally {
    client?.release();
  }
}
