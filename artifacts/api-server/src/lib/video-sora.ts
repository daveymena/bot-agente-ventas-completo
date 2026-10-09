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

// 09-10: con OPENAI_BASE_URL la primera prueba dio "404 {}" (otro servicio,
// no OpenAI). Se resuelve igual que el catálogo de IA (/api/ai/models/openai),
// que sí consulta api.openai.com y lista sora-2.
async function baseOpenAI(): Promise<string> {
  try {
    const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
    const b = (getProviderConfig("openai") as any)?.baseUrl;
    if (b && /openai\.com/i.test(b)) return String(b).replace(/\/+$/, "");
  } catch { /* sin config: la oficial */ }
  return "https://api.openai.com/v1";
}
const MODELO = process.env.SORA_MODEL || "sora-2";
const SEGUNDOS = process.env.SORA_SEGUNDOS || "4";
const TAMANO = "720x1280";

/** El último motivo de fallo, para decírselo al dueño (el log no lo ve nadie). */
let ultimoError: string | null = null;
export function ultimoErrorDeSora(): string | null { return ultimoError; }
function fallo(motivo: string): null {
  ultimoError = motivo.slice(0, 300);
  return null;
}

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
  try {
    const { getProviderConfig } = await import("@workspace/integrations-openai-ai-server");
    const k = (getProviderConfig("openai") as any)?.apiKey;
    if (k) return k;
  } catch { /* sin config */ }
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
  if (!toma.trim()) return null;
  const clave = await claveOpenAI(tenantId);
  if (!clave) return fallo("no hay OPENAI_API_KEY en el servidor ni clave de OpenAI del negocio");
  const auth = { Authorization: `Bearer ${clave}` };
  const BASE = await baseOpenAI();
  try {
    const form = new FormData();
    form.set("model", MODELO);
    form.set("prompt", promptDeToma(toma, contexto));
    form.set("seconds", SEGUNDOS);
    form.set("size", TAMANO);
    const r = await fetch(`${BASE}/videos`, { method: "POST", headers: auth, body: form, signal: AbortSignal.timeout(30_000) });
    const crudo = await r.text().catch(() => "");
    let j: any = {};
    try { j = JSON.parse(crudo); } catch { /* no es JSON: se informa el texto */ }
    if (!r.ok || !j?.id) {
      const motivo = j?.error?.message || crudo.slice(0, 200) || "(sin cuerpo)";
      logger.warn({ status: r.status, url: `${BASE}/videos`, error: motivo }, "[Sora] no aceptó el pedido");
      return fallo(`${BASE}/videos respondió ${r.status}: ${motivo}`);
    }
    const id = String(j.id);
    const hasta = Date.now() + esperaMs;
    let estado = String(j.status || "");
    let detalle = "";
    while (estado !== "completed") {
      if (estado === "failed" || estado === "cancelled") {
        logger.warn({ id, estado, detalle }, "[Sora] la toma falló");
        return fallo(`la toma ${estado === "failed" ? "falló" : "se canceló"} en OpenAI${detalle ? `: ${detalle}` : ""}`);
      }
      if (Date.now() > hasta) {
        logger.warn({ id, estado }, "[Sora] la toma tardó demasiado");
        return fallo(`la toma seguía en "${estado}" a los ${Math.round(esperaMs / 1000)} s`);
      }
      await new Promise((ok) => setTimeout(ok, 5000));
      const s = await fetch(`${BASE}/videos/${id}`, { headers: auth, signal: AbortSignal.timeout(20_000) });
      const sj: any = await s.json().catch(() => ({}));
      estado = String(sj?.status || "");
      detalle = String(sj?.error?.message || sj?.error?.code || "");
      if (!s.ok) {
        logger.warn({ id, status: s.status, error: sj?.error?.message }, "[Sora] no se pudo leer el estado");
        return fallo(`no se pudo leer el estado (${s.status}): ${sj?.error?.message || ""}`);
      }
    }
    const c = await fetch(`${BASE}/videos/${id}/content`, { headers: auth, signal: AbortSignal.timeout(60_000) });
    if (!c.ok) {
      logger.warn({ id, status: c.status }, "[Sora] no se pudo bajar la toma");
      return fallo(`no se pudo bajar la toma (${c.status})`);
    }
    const buf = Buffer.from(await c.arrayBuffer());
    if (buf.length < 10_000) return fallo("la toma llegó vacía");
    await writeFile(destino, buf);
    logger.info({ id, bytes: buf.length, modelo: MODELO, segundos: SEGUNDOS }, "[Sora] toma generada");
    return destino;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Sora] error");
    return fallo(`error de red: ${e?.message || e}`);
  }
}
