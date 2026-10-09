/**
 * Tomas de ambiente generadas con Sora (OpenAI Videos API) para el video de
 * anuncio.
 *
 * 09-10-2026, el dueño: "vamos a probar Sora". Reglas de uso:
 * - Solo tomas SIN el producto (la persona con el problema, el resultado):
 *   Sora no reproduce el producto exacto y mostrar uno inventado engaña. El
 *   producto sale siempre con sus fotos reales.
 * - Sin foto de referencia: las fotos del proveedor tienen personas reales y
 *   la API las rechaza.
 * - Tope de escenas por video (SORA_ESCENAS_POR_VIDEO, por defecto 2) de 4 s:
 *   a ~US$0,10/s son ~US$0,80 por video como máximo.
 * - Si algo falla, devuelve null y la escena sale con la foto, como antes.
 *
 * La API no está verificada contra la referencia oficial (solo documentación
 * de terceros): por eso todo error se registra con el cuerpo de la respuesta.
 */
import { writeFile } from "node:fs/promises";
import { logger } from "./logger";

const BASE = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const MODELO = process.env.SORA_MODEL || "sora-2";
const SEGUNDOS = process.env.SORA_SEGUNDOS || "4";
const TAMANO = "720x1280";

export function escenasSoraPorVideo(): number {
  const n = Number(process.env.SORA_ESCENAS_POR_VIDEO ?? 2);
  return Number.isFinite(n) ? Math.max(0, Math.min(4, Math.floor(n))) : 2;
}

export async function claveOpenAI(tenantId: number): Promise<string | null> {
  try {
    const { clavesDelTenant } = await import("./ai-keys-tenant");
    const k = (await clavesDelTenant(tenantId))?.openai?.apiKey;
    if (k) return k;
  } catch { /* sin clave del negocio */ }
  return process.env.OPENAI_API_KEY || null;
}

/** El pedido a Sora: toma real, vertical, sin texto ni marcas, sin el producto. */
export function promptDeToma(toma: string, contexto: string): string {
  return [
    `Vertical 9:16 realistic smartphone-style commercial footage, natural light, Latin American setting.`,
    toma.trim(),
    contexto ? `Mood of the ad: ${contexto.trim()}.` : "",
    `No on-screen text, no captions, no logos, no brand names. Do not show the advertised product or any product close-up: only the person and the situation.`,
  ].filter(Boolean).join(" ");
}

/**
 * Genera una toma y la guarda en `destino` (mp4). null si no hay clave, si la
 * API falla o si tarda más que `esperaMs`.
 */
export async function tomaConSora(tenantId: number, toma: string, contexto: string, destino: string, esperaMs = 240_000): Promise<string | null> {
  const clave = await claveOpenAI(tenantId);
  if (!clave || !toma.trim()) return null;
  const auth = { Authorization: `Bearer ${clave}` };
  try {
    const form = new FormData();
    form.set("model", MODELO);
    form.set("prompt", promptDeToma(toma, contexto));
    form.set("seconds", SEGUNDOS);
    form.set("size", TAMANO);
    const r = await fetch(`${BASE}/videos`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(30_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j?.id) {
      logger.warn({ status: r.status, error: j?.error?.message || JSON.stringify(j).slice(0, 300) }, "[Sora] no aceptó el pedido");
      return null;
    }
    const id = String(j.id);
    const hasta = Date.now() + esperaMs;
    let estado = String(j.status || "");
    while (estado !== "completed") {
      if (estado === "failed" || estado === "cancelled") {
        logger.warn({ id, estado }, "[Sora] la toma falló");
        return null;
      }
      if (Date.now() > hasta) {
        logger.warn({ id, estado }, "[Sora] la toma tardó demasiado");
        return null;
      }
      await new Promise((ok) => setTimeout(ok, 5000));
      const s = await fetch(`${BASE}/videos/${id}`, { headers: auth, signal: AbortSignal.timeout(20_000) });
      const sj: any = await s.json().catch(() => ({}));
      estado = String(sj?.status || "");
      if (!s.ok) {
        logger.warn({ id, status: s.status, error: sj?.error?.message }, "[Sora] no se pudo leer el estado");
        return null;
      }
    }
    const c = await fetch(`${BASE}/videos/${id}/content`, { headers: auth, signal: AbortSignal.timeout(60_000) });
    if (!c.ok) {
      logger.warn({ id, status: c.status }, "[Sora] no se pudo bajar la toma");
      return null;
    }
    const buf = Buffer.from(await c.arrayBuffer());
    if (buf.length < 10_000) return null;
    await writeFile(destino, buf);
    logger.info({ id, bytes: buf.length, modelo: MODELO, segundos: SEGUNDOS }, "[Sora] toma generada");
    return destino;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Sora] error");
    return null;
  }
}
