/**
 * Solicitudes de eliminación de datos de Meta (callback de la app).
 *
 * Meta envía un `signed_request` firmado con el App Secret:
 *   <firma base64url>.<payload base64url>
 * La firma es HMAC-SHA256 del payload. El payload trae `user_id`, el id de la
 * persona de Facebook que pidió borrar sus datos.
 */
import { createHmac, timingSafeEqual, createHash } from "node:crypto";

export type ResultadoFirma =
  | { ok: true; userId: string }
  | { ok: false; motivo: string };

function base64urlADatos(s: string): Buffer {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  return Buffer.from(norm + pad, "base64");
}

export function verificarSignedRequest(signedRequest: string, appSecret: string): ResultadoFirma {
  if (!appSecret) return { ok: false, motivo: "la app no tiene App Secret configurado" };
  const partes = String(signedRequest || "").split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: "formato inválido" };
  const [firmaB64, payloadB64] = partes;

  const esperada = createHmac("sha256", appSecret).update(payloadB64).digest();
  const recibida = base64urlADatos(firmaB64);
  if (recibida.length !== esperada.length || !timingSafeEqual(recibida, esperada)) {
    return { ok: false, motivo: "firma no coincide" };
  }

  let payload: { user_id?: unknown; algorithm?: unknown };
  try {
    payload = JSON.parse(base64urlADatos(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, motivo: "payload no es JSON" };
  }
  if (payload.algorithm && String(payload.algorithm).toUpperCase() !== "HMAC-SHA256") {
    return { ok: false, motivo: "algoritmo no soportado" };
  }
  const userId = payload.user_id != null ? String(payload.user_id) : "";
  if (!userId) return { ok: false, motivo: "falta user_id" };
  return { ok: true, userId };
}

/** Código de confirmación estable para una solicitud, que la persona puede consultar. */
export function codigoDeConfirmacion(userId: string): string {
  return createHash("sha256").update(`eliminacion:${userId}`).digest("hex").slice(0, 16);
}

/** Firma un payload como lo haría Meta (para pruebas y para verificar la integración). */
export function firmarParaPrueba(payload: Record<string, unknown>, appSecret: string): string {
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const f = createHmac("sha256", appSecret).update(p).digest("base64url");
  return `${f}.${p}`;
}
