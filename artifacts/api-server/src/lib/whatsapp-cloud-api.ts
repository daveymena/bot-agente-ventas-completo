/**
 * WhatsApp Cloud API (Graph API de Meta) — transporte alternativo a Baileys.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * Baileys (WhatsApp Web no oficial) escala mal: cada negocio es una sesión
 * persistente en RAM/CPU del servidor. La Cloud API de Meta mantiene la
 * conexión del lado de Meta y solo entrega webhooks, así que cientos de
 * negocios caben en una máquina modesta.
 *
 * ── Cómo convive con Baileys ──────────────────────────────────────────────
 * Este módulo es la SEGUNDA opción: por defecto todo sigue igual (Baileys).
 * Se activa con WHATSAPP_CLOUD_ENABLED=true. Mientras esté apagado, este
 * archivo no hace nada: ni llama a la Graph API ni intercepta mensajes.
 *
 * ── Qué necesita para estar "listo" ───────────────────────────────────────
 * En Meta: un número en un WABA + un System User token permanente con
 * `whatsapp_business_messaging` + el webhook apuntando a
 * `POST /api/whatsapp-cloud/webhook`. Acá solo se leen env vars.
 *
 * Un número NO puede estar a la vez en Baileys y en Cloud API: es una u otra.
 * Por eso el switch es global por número (WHATSAPP_CLOUD_TENANT_ID) y se deja
 * apagado hasta migrar el número.
 */
import { db, products } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { logger } from "./logger";
import { presentarParaWhatsApp } from "./presentacion";
import { unirTextosSeguidos } from "./una-sola-burbuja";
import { type AgentReplyPart } from "./whatsapp-singleton";
import { META_API_VERSION } from "./meta-api-version";

const API_VERSION = process.env.WHATSAPP_CLOUD_API_VERSION || META_API_VERSION;
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;

export interface CloudApiConfig {
  token: string;
  phoneNumberId: string;
  wabaId: string | null;
  verifyToken: string;
  tenantId: number;
}

/** Lee la configuración desde el entorno. Devuelve null si falta lo esencial. */
export function cloudApiConfig(): CloudApiConfig | null {
  const token = (process.env.WHATSAPP_CLOUD_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();
  if (!token || !phoneNumberId) return null;
  const tenantId = Number(process.env.WHATSAPP_CLOUD_TENANT_ID) || 1;
  return {
    token,
    phoneNumberId,
    wabaId: (process.env.WHATSAPP_CLOUD_WABA_ID || "").trim() || null,
    verifyToken: process.env.WHATSAPP_CLOUD_VERIFY_TOKEN || "",
    tenantId,
  };
}

/** ¿La Cloud API está encendida como transporte? */
export function cloudApiHabilitada(): boolean {
  if (process.env.WHATSAPP_TRANSPORT === "cloud") return true;
  if (String(process.env.WHATSAPP_CLOUD_ENABLED || "").toLowerCase() === "true") return true;
  return false;
}

/** El tenant al que responde el número de Cloud API (default 1). */
export function cloudApiTenantId(): number {
  return Number(process.env.WHATSAPP_CLOUD_TENANT_ID) || 1;
}

function limpiarParaCloud(phone: string): string {
  let d = String(phone || "").replace(/[^\d]/g, "");
  if (!d) return "";
  // Número local sin código de país (Colombia): anteponer el indicativo.
  if (d.length <= 10) d = `57${d}`;
  return d;
}

async function llamarCloud(
  cfg: CloudApiConfig,
  payload: Record<string, any>,
): Promise<{ ok: boolean; status: number; error?: string; data?: any }> {
  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    let json: any = null;
    try { json = JSON.parse(raw); } catch { /* no-JSON */ }
    if (!res.ok) {
      return { ok: false, status: res.status, error: String(json?.error?.message || raw.slice(0, 200) || `HTTP ${res.status}`), data: json };
    }
    return { ok: true, status: res.status, data: json };
  } catch (e: any) {
    return { ok: false, status: 0, error: e?.name === "TimeoutError" ? "Timeout" : String(e?.message || e) };
  }
}

/** Envía texto vía Cloud API. */
export async function sendTextCloud(phone: string, text: string): Promise<boolean> {
  const cfg = cloudApiConfig();
  if (!cfg) { logger.warn("[CloudAPI] Sin token/número: no se envía texto"); return false; }
  const to = limpiarParaCloud(phone);
  if (!to) return false;
  const body = presentarParaWhatsApp(text);
  const r = await llamarCloud(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body },
  });
  if (!r.ok) logger.warn({ to, status: r.status, err: r.error }, "[CloudAPI] No se pudo enviar texto");
  return r.ok;
}

/** Envía una imagen (por URL pública) con caption vía Cloud API. */
export async function sendImageCloud(phone: string, imageUrl: string, caption: string): Promise<boolean> {
  const cfg = cloudApiConfig();
  if (!cfg) { logger.warn("[CloudAPI] Sin token/número: no se envía imagen"); return false; }
  const to = limpiarParaCloud(phone);
  if (!to) return false;
  if (!/^https?:\/\//i.test(imageUrl)) {
    // Sin URL pública no hay imagen: se manda el texto solo.
    return sendTextCloud(phone, caption);
  }
  const r = await llamarCloud(cfg, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: { link: imageUrl, caption: caption ? presentarParaWhatsApp(caption) : undefined },
  });
  if (!r.ok) {
    logger.warn({ to, status: r.status, err: r.error }, "[CloudAPI] No se pudo enviar imagen; se manda el texto");
    return sendTextCloud(phone, caption);
  }
  return true;
}

/**
 * Envía las partes del agente vía Cloud API.
 * Espejo simplificado de WhatsAppManager.sendAgentParts: junta textos seguidos
 * y, para las fichas, manda la foto del producto con su texto. No replica los
 * links de pago dinámicos (MercadoPago/PayPal) ni el particionado fino de la
 * ficha; es la base lista para migrar, no el reemplazo 1:1 de Baileys.
 */
export async function sendAgentPartsCloud(phone: string, pushName: string, parts: AgentReplyPart[]): Promise<void> {
  const cfg = cloudApiConfig();
  if (!cfg) { logger.warn("[CloudAPI] Sin token/número: no se envían partes"); return; }

  const unidas = unirTextosSeguidos(parts as any) as AgentReplyPart[];

  const cardIds = unidas.flatMap((p) => (p.kind === "card" ? [p.productId] : []));
  const cardCache = new Map<number, any>();
  if (cardIds.length) {
    const rows = await db.select().from(products).where(inArray(products.id, cardIds.filter((id): id is number => id !== undefined)));
    for (const r of rows) cardCache.set((r as any).id, r);
  }

  for (const part of unidas) {
    if (part.kind === "text") {
      await sendTextCloud(phone, part.content || "");
    } else {
      const product = cardCache.get(part.productId!);
      if (!product) continue;
      const price = Number((product as any).price);
      const precio = Number.isFinite(price) && price > 0
        ? `${(product as any).currency === "USD" ? "USD " : "$"}${price.toLocaleString("es-CO")}`
        : "";
      const caption = part.content && part.content.trim()
        ? part.content
        : [`*${(product as any).name}*`, precio].filter(Boolean).join("\n\n");
      await sendImageCloud(phone, (product as any).imageUrl || "", caption);
    }
  }
}

// ─── Webhook entrante ───────────────────────────────────────────────────────

/** Dedupe ligero de ids ya procesados (Meta puede reintentar el webhook). */
const vistos = new Set<string>();
const MAX_VISTOS = 10_000;
function yaProcesado(id: string): boolean {
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > MAX_VISTOS) { const primero = vistos.values().next().value; vistos.delete(primero); }
  return false;
}

/**
 * Extrae los mensajes entrantes de un payload de webhook de Cloud API y los
 * entrega al mismo pipeline que Baileys (MessageHandler). Es la única entrada
 * que falta duplicar para que la Cloud API reciba igual que Baileys.
 */
export async function procesarWebhookCloud(payload: any): Promise<{ procesados: number; ignorados: number }> {
  const cfg = cloudApiConfig();
  if (!cfg) return { procesados: 0, ignorados: 0 };

  const { getMessageHandler } = await import("./services/message-handler");
  const handler = getMessageHandler();

  let procesados = 0;
  let ignorados = 0;

  const entries: any[] = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      if (value.messaging_product !== "whatsapp") continue;
      const phoneNumberId = String(value.metadata?.phone_number_id || "");
      // Si hay un mapa explícito de números, respeta el tenant de ESE número.
      if (phoneNumberId && phoneNumberId !== cfg.phoneNumberId) {
        ignorados++;
        continue;
      }
      for (const msg of Array.isArray(value.messages) ? value.messages : []) {
        const id = String(msg?.id || "");
        if (!id || yaProcesado(id)) { ignorados++; continue; }
        const from = String(msg?.from || "").replace(/[^\d]/g, "");
        if (!from) { ignorados++; continue; }

        let body = "";
        if (msg?.type === "text") body = String(msg?.text?.body || "");
        else if (msg?.type === "image") body = String(msg?.image?.caption || "");
        else if (msg?.type === "interactive") body = String(msg?.interactive?.button_reply?.title || msg?.interactive?.list_reply?.title || "");
        else if (msg?.type === "button") body = String(msg?.button?.text || "");
        // audio/video/documento/sin caption: aún no se transcriben por este camino.
        if (!body.trim()) { ignorados++; continue; }

        // Cobro por conversación: una ventana de 24h por cliente. Se cuenta
        // antes de responder y sin await (medir no puede demorar la respuesta).
        const { contarConversacion } = await import("./cobro-por-conversacion");
        contarConversacion(cfg.tenantId, from);

        await handler.handleIncomingMessage({
          tenantId: String(cfg.tenantId),
          remoteJid: `${from}@s.whatsapp.net`,
          phone: from,
          fromMe: false,
          messageId: id,
          body,
          timestamp: new Date(Number(msg?.timestamp) * 1000 || Date.now()),
          pushName: String(value.contacts?.[0]?.profile?.name || from),
        });
        procesados++;
      }
    }
  }
  return { procesados, ignorados };
}
