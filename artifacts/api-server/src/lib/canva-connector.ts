/**
 * Canva Connect API — conector seguro (solo lectura/estado, no OAuth activo sin credenciales)
 * Basado en https://www.canva.com/developers/docs/connect/ (2024-26)
 * - No ejecuta OAuth si CANVA_ENABLED!=true o faltan CLIENT_ID/SECRET
 * - Estado es lectura pura, no toca Canva ni gasta
 * - Cuando esté habilitado, usará PKCE + state anti-CSRF, scopes mínimos
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "./credentials-vault";
import { logger } from "./logger";

const CANVA_API = "https://api.canva.com/rest/v1";

export interface CanvaEstado {
  enabled: boolean;
  motivo: string;
  docs: string; // ruta relativa doc
  redirectUri: string;
  scopes: string[];
  endpoints: string[];
  limitaciones: string;
  env: { CANVA_ENABLED: string; tieneClientId: boolean; tieneSecret: boolean; redirectUri: string };
}

const SCOPES = ["design:content:read","design:content:write","design:meta:read","asset:read","asset:write","brandtemplate:content:read","profile:read"];
const ENDPOINTS = ["POST /rest/v1/oauth/token","GET /rest/v1/designs","POST /rest/v1/designs","POST /rest/v1/autofills","POST /rest/v1/exports","GET /rest/v1/exports/{id}","POST /rest/v1/assets"];

export async function estadoCanva(): Promise<CanvaEstado> {
  const enabled = process.env.CANVA_ENABLED === "true";
  const cid = String(process.env.CANVA_CLIENT_ID || "").trim();
  const sec = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  const redirect = String(process.env.CANVA_REDIRECT_URI || "https://ventasproia.com/api/canva/callback").trim();
  let motivo = "";
  if (!enabled) motivo = "Canva desactivado en este servidor: se usa el generador local de imágenes (sin costo).";
  else if (!cid || !sec) motivo = "Falta configurar las credenciales de Canva en el servidor.";
  else motivo = "Credenciales configuradas. Conecta tu cuenta para traer tus diseños y exportar imágenes.";
  // intenta confirmar que el doc existe
  let docs = "docs/CANVA_INTEGRATION.md";
  try {
    const p = path.resolve(process.cwd(), docs);
    await readFile(p, "utf8");
  } catch { docs = "docs/CANVA_INTEGRATION.md (no encontrado en este deploy)"; }
  return {
    enabled: enabled && !!cid && !!sec,
    motivo,
    docs,
    redirectUri: redirect,
    scopes: SCOPES,
    endpoints: ENDPOINTS,
    limitaciones: "Video automático: solo plan Enterprise · Las plantillas de marca requieren plan Pro o superior · Exportar consume 1 diseño · Para que otros negocios conecten su Canva, la integración debe aprobarla Canva.",
    env: { CANVA_ENABLED: String(process.env.CANVA_ENABLED || "false"), tieneClientId: !!cid, tieneSecret: !!sec, redirectUri: redirect },
  };
}

export async function hayCanvaSeguro(): Promise<boolean> {
  const e = await estadoCanva();
  return e.enabled;
}

/* ── Token por tenant (con refresh automático) ── */

async function leerMetaCanva(tenantId: number): Promise<any> {
  const [row] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const meta = (row as any)?.metadata;
  if (!meta) return {};
  if (typeof meta === "string") { try { return JSON.parse(meta); } catch { return {}; } }
  return meta;
}

/** Access token válido del tenant: refresca solo si venció (tokens duran 4h). */
export async function tokenCanvaDelTenant(tenantId: number): Promise<{ token: string } | { error: string }> {
  const meta = await leerMetaCanva(tenantId);
  const canva = meta?.canva;
  if (!canva?.accessToken) return { error: "Canva no conectado: autoriza en /integraciones primero." };
  const aunValido = !canva.expiraEn || Number(canva.expiraEn) > Date.now() + 60_000;
  if (aunValido) {
    // decryptSecret NO lanza: devuelve "" cuando la clave cambió o el dato está
    // corrupto. Hay que comprobar el resultado o se manda "Bearer " vacío.
    const token = decryptSecret(String(canva.accessToken));
    if (!token) return { error: "No se pudo desencriptar el token (CREDENTIALS_ENCRYPTION_KEY cambió o el dato está corrupto). Reconecta en /integraciones." };
    return { token };
  }
  // vencido: refresh
  if (!canva.refreshToken) return { error: "Token vencido y sin refresh_token: reconecta en /integraciones." };
  try {
    const cid = String(process.env.CANVA_CLIENT_ID || "").trim();
    const sec = String(process.env.CANVA_CLIENT_SECRET || "").trim();
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptSecret(String(canva.refreshToken)),
      client_id: cid,
      client_secret: sec,
    });
    const r = await fetch(`${CANVA_API}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) {
      logger.warn({ tenantId, status: r.status }, "[Canva] refresh falló");
      return { error: "Refresh rechazado: reconecta en /integraciones." };
    }
    meta.canva = {
      ...canva,
      accessToken: encryptSecret(String(j.access_token)),
      refreshToken: j.refresh_token ? encryptSecret(String(j.refresh_token)) : canva.refreshToken,
      expiraEn: Date.now() + (Number(j.expires_in) || 14_400) * 1000,
      actualizadoEn: new Date().toISOString(),
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    return { token: String(j.access_token) };
  } catch (e: any) {
    return { error: `Refresh falló: ${e?.message || e}` };
  }
}

/* ── Diseños: listar + exportar (para maquetas vía Atlas) ── */

export interface DisenoCanva {
  id: string;
  titulo: string;
  thumbnail?: string | null;
  editUrl?: string | null;
  viewUrl?: string | null;
  paginas?: number;
  actualizadoEn?: string | null;
}

/** Lista diseños del usuario conectado (paginado simple). */
export async function listarDisenosCanva(
  tenantId: number,
  opts: { query?: string; limit?: number } = {},
): Promise<{ disenos: DisenoCanva[]; siguiente?: string | null } | { error: string }> {
  const t = await tokenCanvaDelTenant(tenantId);
  if ("error" in t) return t;
  try {
    const params = new URLSearchParams();
    if (opts.query?.trim()) params.set("query", opts.query.trim());
    params.set("limit", String(Math.max(1, Math.min(100, opts.limit || 20))));
    const r = await fetch(`${CANVA_API}/designs?${params.toString()}`, {
      headers: { Authorization: `Bearer ${t.token}` },
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `Canva listó ${r.status}: ${JSON.stringify(j).slice(0, 200)}` };
    const items = Array.isArray(j.items) ? j.items : [];
    return {
      disenos: items.map((d: any) => ({
        id: String(d.id),
        titulo: String(d.title || "Sin título"),
        thumbnail: d.thumbnail?.url || null,
        editUrl: d.urls?.edit_url || null,
        viewUrl: d.urls?.view_url || null,
        paginas: Number(d.page_count || 1),
        actualizadoEn: d.update_time ? new Date(Number(d.update_time) * 1000).toISOString() : null,
      })),
      siguiente: j.continuation || null,
    };
  } catch (e: any) {
    return { error: `Listar diseños falló: ${e?.message || e}` };
  }
}

/**
 * Exporta un diseño a imagen/PDF (para maquetas de producto).
 * Canva exporta en segundo plano: crea el trabajo y espera hasta ~50s.
 */
export async function exportarDisenoCanva(
  tenantId: number,
  designId: string,
  formato: "png" | "jpg" | "pdf" = "png",
): Promise<{ urls: string[]; formato: string } | { error: string }> {
  const t = await tokenCanvaDelTenant(tenantId);
  if ("error" in t) return t;
  try {
    const r = await fetch(`${CANVA_API}/exports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ design_id: designId, format: { type: formato } }),
      signal: AbortSignal.timeout(20_000),
    });
    const j: any = await r.json().catch(() => ({}));
    // Canva envuelve TODOS los trabajos asíncronos en { job: {...} }; leer j.id
    // aquí hacía que la función fallara siempre aunque el job sí se creara.
    if (!r.ok || !j.job?.id) {
      return { error: `Exportar falló (${r.status}): ${JSON.stringify(j).slice(0, 200)}` };
    }
    const jobId = String(j.job.id);
    // Espera real ~48s (2s fijos entre sondeos). Un solo 429/5xx transitorio no
    // debe abortar: se cuenta como intento y se sigue sondeando.
    const ESPERA_MS = 2000;
    const MAX_INTENTOS = 24;
    for (let i = 0; i < MAX_INTENTOS; i++) {
      await new Promise((res) => setTimeout(res, ESPERA_MS));
      let s: Response;
      try {
        s = await fetch(`${CANVA_API}/exports/${jobId}`, {
          headers: { Authorization: `Bearer ${(t as { token: string }).token}` },
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        continue; // red/timeout: reintenta en el siguiente ciclo
      }
      const sj: any = await s.json().catch(() => ({}));
      if (s.status === 429 || s.status >= 500) continue; // transitorio: reintenta
      const job = sj?.job;
      if (job?.status === "success") {
        const urls = Array.isArray(job.urls) ? job.urls : [];
        if (!urls.length) return { error: "Canva no devolvió ninguna URL de exportación." };
        // Canva devuelve URLs de descarga; validar dominio evita un redirect
        // abierto / SSRF si la respuesta viniera manipulada.
        const seguras = urls.filter((u: unknown) => {
          try {
            const parsed = new URL(String(u));
            return parsed.protocol === "https:" &&
              (parsed.hostname === "canva.com" || parsed.hostname.endsWith(".canva.com"));
          } catch { return false; }
        });
        if (seguras.length !== urls.length) {
          return { error: "Canva devolvió una URL de descarga con un dominio no permitido." };
        }
        return { urls: seguras, formato };
      }
      if (job?.status === "failed") {
        return { error: `Exportación falló: ${JSON.stringify(job.error || {}).slice(0, 200)}` };
      }
    }
    return { error: `Exportación tardó más de ~${Math.round((ESPERA_MS * MAX_INTENTOS) / 1000)}s: reintenta.` };
  } catch (e: any) {
    return { error: `Exportar diseño falló: ${e?.message || e}` };
  }
}
