/**
 * FACEBOOK — Audiencias personalizadas y similares REALES (2026-09-29)
 * =====================
 * Prospecting amplio quema plata; lo que baja el CPA es retargeting +
 * lookalikes. Este módulo crea en la cuenta REAL:
 * - sitio web (píxel, 180 días),
 * - lista de clientes (teléfonos del WhatsApp/CRM, hasheados SHA-256),
 * - similares (lookalike 1-3% por país) sobre cualquiera de las anteriores.
 *
 * Usa el token de USUARIO (ads_management), nunca el de página. No gasta:
 * crear audiencias no pauta; el gasto sigue con sus candados.
 */
import crypto from "node:crypto";
import { FB_GRAPH_BASE } from "./meta-api-version";
import { db, conversations } from "@workspace/db";
import { eq, and, isNotNull, ne } from "drizzle-orm";
import { logger } from "./logger";

export interface AudienciaConfig {
  userToken: string;
  adAccountId: string;
  pixelId?: string;
}

async function graphPOST(cfg: AudienciaConfig, endpoint: string, body: Record<string, any>): Promise<any> {
  const url = `${FB_GRAPH_BASE}/${endpoint}?access_token=${encodeURIComponent(cfg.userToken)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Meta: ${data?.error?.message || res.status} (código ${data?.error?.code ?? "?"})`);
  }
  return data;
}

async function graphGET(cfg: AudienciaConfig, endpoint: string, query: Record<string, string> = {}): Promise<any> {
  const params = new URLSearchParams({ access_token: cfg.userToken, ...query });
  const res = await fetch(`${FB_GRAPH_BASE}/${endpoint}?${params}`, { signal: AbortSignal.timeout(15000) });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Meta: ${data?.error?.message || res.status} (código ${data?.error?.code ?? "?"})`);
  }
  return data;
}

function act(cfg: AudienciaConfig): string {
  const id = String(cfg.adAccountId || "").replace(/^act_/, "");
  if (!id) throw new Error("Falta adAccountId (cuenta publicitaria).");
  return `act_${id}`;
}

/** Lista audiencias de la cuenta (para reutilizar, no duplicar). */
export async function listarAudiencias(cfg: AudienciaConfig, limite = 50): Promise<Array<{ id: string; name: string; subtype: string; approximate_count?: number }>> {
  const d = await graphGET(cfg, `${act(cfg)}/customaudiences`, { fields: "id,name,subtype,approximate_count", limit: String(limite) });
  return (d.data || []).map((a: any) => ({ id: a.id, name: a.name, subtype: a.subtype, approximate_count: a.approximate_count }));
}

/** Audiencia de visitantes del sitio (píxel). `dominio` ej: "ventasproia.com". */
export async function crearAudienciaWeb(cfg: AudienciaConfig, nombre: string, dominio: string, dias = 180): Promise<{ id: string }> {
  if (!cfg.pixelId) throw new Error("Falta pixelId: conectá el píxel en /settings.");
  if (!dominio) throw new Error("Falta el dominio (ej ventasproia.com).");
  const segundos = Math.min(Math.max(dias, 1), 180) * 86400;
  const r = await graphPOST(cfg, `${act(cfg)}/customaudiences`, {
    name: nombre,
    subtype: "WEBSITE",
    description: `Visitantes ${dominio} (${dias}d) — VentasPro`,
    rule: {
      inclusions: {
        operator: "or",
        rules: [{
          event_sources: [{ id: cfg.pixelId, type: "pixel" }],
          retention_seconds: segundos,
          filter: { operator: "or", filters: [{ field: "url", operator: "i_contains", value: dominio }] },
        }],
      },
    },
  });
  logger.info({ audienceId: r.id, dominio }, "[Audiencias] web creada");
  return { id: r.id };
}

/** Normaliza un teléfono a dígitos con indicativo (CO por defecto) para hashear. */
export function normalizarTelefonoParaMeta(tel: unknown, indicativoDefecto = "57"): string | null {
  let d = String(tel || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) d = indicativoDefecto + d;
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/** SHA-256 en minúsculas como exige Meta para CUSTOM + PHONE. */
export function hashMeta(valor: string): string {
  return crypto.createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}

/**
 * Audiencia de clientes desde los teléfonos ÚNICOS del tenant
 * (conversaciones de WhatsApp/CRM). Sube hashes, nunca números en claro.
 */
export async function crearAudienciaClientes(
  cfg: AudienciaConfig,
  tenantId: number,
  nombre: string,
  limite = 5000,
): Promise<{ id: string; subidos: number }> {
  const filas = await db
    .select({ contactPhone: conversations.contactPhone })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), isNotNull(conversations.contactPhone), ne(conversations.contactPhone, "")))
    .limit(Math.min(Math.max(limite, 100), 20000));
  const vistos = new Set<string>();
  const hashes: string[] = [];
  for (const f of filas) {
    const n = normalizarTelefonoParaMeta((f as any).contactPhone);
    if (n && !vistos.has(n)) { vistos.add(n); hashes.push(hashMeta(n)); }
  }
  if (hashes.length < 100) {
    throw new Error(`Solo ${hashes.length} teléfonos únicos: Meta exige mínimo 100 para una lista de clientes.`);
  }
  const r = await graphPOST(cfg, `${act(cfg)}/customaudiences`, {
    name: nombre,
    subtype: "CUSTOM",
    description: `Clientes WhatsApp/CRM (${hashes.length}) — VentasPro`,
  });
  // Lotes de 10.000 (límite de Meta por llamada).
  for (let i = 0; i < hashes.length; i += 10000) {
    await graphPOST(cfg, `${r.id}/users`, {
      schema: ["PHONE"],
      data: hashes.slice(i, i + 10000).map((h) => [h]),
    });
  }
  logger.info({ audienceId: r.id, subidos: hashes.length }, "[Audiencias] clientes creada");
  return { id: r.id, subidos: hashes.length };
}

/** Lookalike 1-3% sobre una audiencia origen, por país. */
export async function crearLookalike(
  cfg: AudienciaConfig,
  nombre: string,
  origenId: string,
  pais = "CO",
  ratio = 0.01,
): Promise<{ id: string }> {
  const r = Math.min(Math.max(ratio, 0.01), 0.1);
  const res = await graphPOST(cfg, `${act(cfg)}/customaudiences`, {
    name: nombre,
    subtype: "LOOKALIKE",
    origin_audience_id: origenId,
    lookalike_spec: { country: pais.toUpperCase(), ratio: [r], type: "similarity" },
  });
  logger.info({ audienceId: res.id, origenId, pais }, "[Audiencias] lookalike creado");
  return { id: res.id };
}
