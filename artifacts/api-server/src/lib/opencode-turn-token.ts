/**
 * Token de turno para el puente MCP de Atlas (ver mcp-bridge.ts).
 *
 * OpenCode (el contenedor `operato`) llama de vuelta a nuestro endpoint MCP
 * para ejecutar herramientas de lectura y proponer acciones -- ese endpoint
 * necesita saber a qué tenant pertenece el turno SIN confiar en nada que
 * OpenCode le mande en el cuerpo de la llamada (un modelo de IA no es un
 * límite de seguridad). Mismo patrón que `remarketing.ts`
 * (buildUnsubscribeToken/verifyUnsubscribeToken): HMAC recalculable, sin
 * tabla nueva en la base -- pero acá además lleva un `exp` corto porque el
 * token vive solo mientras dura UN turno de Atlas (segundos a un par de
 * minutos), a diferencia de un link de baja que tiene que seguir siendo
 * válido para siempre.
 *
 * Secreto DEDICADO (ATLAS_MCP_SECRET), no reusar COOKIE_SECRET: si este
 * token se filtrara (queda en tránsito hacia un contenedor externo, aunque
 * sea uno propio), el radio de daño tiene que quedar acotado a "puede llamar
 * herramientas de lectura de Atlas durante unos minutos", nunca "puede
 * falsificar una sesión de usuario real".
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TurnTokenPayload {
  tenantId: number;
  sessionId: string;
  turnId: string;
  /** Herramientas firmadas para este turno; no se acepta solo el filtro de URL. */
  allowedTools: string[];
  /** Epoch ms en que el token deja de ser válido. */
  exp: number;
}

const DEFAULT_TTL_MS = 3 * 60 * 1000;

function secret(): string {
  const s = process.env.ATLAS_MCP_SECRET;
  if (!s) {
    throw new Error("ATLAS_MCP_SECRET no configurado: el puente MCP queda deshabilitado por seguridad");
  }
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function mintTurnToken(data: { tenantId: number; sessionId: string; turnId: string; allowedTools: string[] }, ttlMs = DEFAULT_TTL_MS): string {
  const payload: TurnTokenPayload = { ...data, exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Devuelve el payload si el token es válido y no venció, o `null`. Nunca
 * lanza -- un token malformado/vencido/con firma inválida es simplemente
 * "no autenticado", no un error de servidor.
 */
export function verifyTurnToken(token: unknown): TurnTokenPayload | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;

  try {
    const expected = Buffer.from(sign(payloadB64), "base64url");
    const given = Buffer.from(signature, "base64url");
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TurnTokenPayload;
    if (typeof payload.tenantId !== "number" || typeof payload.sessionId !== "string" || typeof payload.turnId !== "string" || typeof payload.exp !== "number" || !Array.isArray(payload.allowedTools) || payload.allowedTools.some((tool) => typeof tool !== "string")) {
      return null;
    }
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
