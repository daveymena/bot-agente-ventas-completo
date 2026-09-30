/**
 * ============================================================
 * CUENTA PUBLICITARIA AUTORIZADA (Meta Ads, P0 §3.2 del doc de faltantes)
 * ============================================================
 *
 * Antes de publicar o activar CUALQUIER anuncio, el sistema valida que la
 * cuenta en uso sea LA cuenta COP autorizada del negocio, y que esté activa
 * en Meta. Si no, bloquea y dice el motivo exacto: nunca elige otra cuenta
 * sola ni publica a ciegas.
 *
 * Por qué existe: la app razona en COP y el incidente del 2026-08-10 mostró
 * lo que pasa cuando la cuenta real está en otra moneda (US$20.000/día). La
 * conversión y el techo ya existen (facebook.ts); esto cierra la otra mitad:
 * que la cuenta SEA la correcta y ESTÉ en COP antes de crear nada.
 *
 * La cuenta autorizada se guarda en `tenants.settings.metaAds`. Si el negocio
 * todavía no tiene ninguna fijada pero la configurada valida (COP + activa),
 * se fija sola en ese momento y queda auditado: los negocios que ya estaban
 * bien no se rompen, y a partir de ahí quedan clavados a esa cuenta.
 */

import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { FB_GRAPH_BASE } from "./meta-api-version";
import { logger } from "./logger";

/** Lo que se lee de Meta (`act_{id}?fields=account_id,name,account_status,currency,disable_reason`). */
export interface CuentaMeta {
  id: string;
  nombre?: string | null;
  moneda?: string | null;
  /** account_status de Meta: solo 1 (activa) puede gastar. */
  estado?: number | null;
  motivoDeshabilitada?: string | number | null;
}

/** La cuenta clavada del negocio. */
export interface CuentaAutorizada {
  id: string;
  moneda: string;
  fijadaEn: string;
  fijadaPor: string;
}

export interface VeredictoCuenta {
  ok: boolean;
  motivo: string;
  cuenta?: CuentaMeta;
  autorizada?: CuentaAutorizada | null;
  /** true cuando este mismo llamado fijó la cuenta (primera vez válida). */
  fijadaAhora?: boolean;
}

/** 1 = activa. El resto no entrega anuncios (ver ESTADO_DE_CUENTA_META en facebook.ts). */
export const CUENTA_META_ACTIVA = 1;

const TEXTO_ESTADO: Record<number, string> = {
  1: "activa",
  2: "deshabilitada",
  3: "con cargos pendientes",
  7: "en revisión de riesgo",
  8: "con liquidación pendiente",
  9: "en período de gracia",
  100: "en cierre",
  101: "cerrada",
};

/**
 * Pura: ¿se puede publicar con esta cuenta? Orden de chequeo a propósito:
 * primero que EXISTA (no publicar a ciegas), después moneda, después estado,
 * después que sea la autorizada. El motivo siempre dice qué hacer.
 */
export function veredictoDeCuenta(cuenta: CuentaMeta | null, autorizada: CuentaAutorizada | null): VeredictoCuenta {
  if (!cuenta || !String(cuenta.id || "").trim()) {
    return { ok: false, motivo: "Meta no devolvió la cuenta publicitaria: sin confirmar la cuenta no se publica nada." };
  }
  const id = String(cuenta.id).trim();
  const moneda = String(cuenta.moneda || "").toUpperCase();
  if (moneda !== "COP") {
    return {
      ok: false,
      motivo: `La cuenta ${id} está en ${moneda || "moneda desconocida"}: solo se publica en la cuenta COP autorizada del negocio. Elegí la cuenta en COP en el panel (Facebook → Cuenta publicitaria) o pedíselo a Atlas.`,
    };
  }
  if (cuenta.estado != null && Number(cuenta.estado) !== CUENTA_META_ACTIVA) {
    const texto = TEXTO_ESTADO[Number(cuenta.estado)] || `estado ${cuenta.estado}`;
    return {
      ok: false,
      motivo: `La cuenta ${id} está ${texto} en Meta${cuenta.motivoDeshabilitada ? ` (motivo: ${cuenta.motivoDeshabilitada})` : ""}: no puede entregar anuncios. Revisala en el Administrador de Anuncios.`,
    };
  }
  if (autorizada && String(autorizada.id) !== id) {
    return {
      ok: false,
      motivo: `La cuenta en uso (${id}) no es la autorizada del negocio (${autorizada.id}, fijada el ${String(autorizada.fijadaEn || "").slice(0, 10)}). No se cambia de cuenta sola: si hay que cambiarla, que lo haga el dueño en el panel.`,
    };
  }
  return { ok: true, motivo: "Cuenta COP autorizada y activa.", cuenta, autorizada };
}

/** La cuenta clavada del negocio, si hay. */
export async function leerCuentaAutorizada(tenantId: number): Promise<CuentaAutorizada | null> {
  try {
    const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const a = (t?.settings as any)?.metaAds?.cuentaAutorizada;
    if (!a || !String(a.id || "").trim()) return null;
    return { id: String(a.id).trim(), moneda: String(a.moneda || "COP").toUpperCase(), fijadaEn: String(a.fijadaEn || ""), fijadaPor: String(a.fijadaPor || "") };
  } catch {
    return null;
  }
}

/** Clava la cuenta del negocio (primera vez válida, o cambio explícito del dueño). */
export async function fijarCuentaAutorizada(tenantId: number, c: { id: string; moneda: string }, por: string): Promise<void> {
  const [t] = await db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const settings = ((t?.settings as any) || {}) as Record<string, any>;
  const metaAds = { ...(settings.metaAds || {}) };
  metaAds.cuentaAutorizada = { id: String(c.id).trim(), moneda: String(c.moneda || "COP").toUpperCase(), fijadaEn: new Date().toISOString(), fijadaPor: por };
  await db.update(tenants).set({ settings: { ...settings, metaAds } } as any).where(eq(tenants.id, tenantId));
  logger.info({ tenantId, cuenta: c.id, por }, "[MetaAds] Cuenta publicitaria autorizada fijada");
}

/**
 * Cambio EXPLÍCITO de cuenta (panel o Atlas con confirmación). Quien llama ya
 * validó que la cuenta está entre las que ve el token del negocio
 * (validarCambioDeCuenta). Guarda la cuenta activa en metadata.facebook y, si
 * es COP, la deja como autorizada: si no, el candado seguía clavado a la
 * anterior y el cambio no servía para publicar.
 */
export async function cambiarCuentaActiva(
  tenantId: number,
  c: { id: string; nombre?: string; moneda?: string },
  por: string,
): Promise<void> {
  const [t] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const meta: any = t?.metadata ? (typeof t.metadata === "string" ? JSON.parse(t.metadata) : t.metadata) : {};
  const anterior = String(meta?.facebook?.adAccountId || "");
  meta.facebook = {
    ...(meta.facebook || {}),
    adAccountId: String(c.id),
    adAccountName: c.nombre || "",
    adAccountCurrency: String(c.moneda || "").toUpperCase(),
  };
  await db.update(tenants).set({ metadata: meta }).where(eq(tenants.id, tenantId));
  if (String(c.moneda || "").toUpperCase() === "COP") {
    await fijarCuentaAutorizada(tenantId, { id: c.id, moneda: "COP" }, por);
  }
  try {
    const { tenantManager } = await import("./tenantManager");
    tenantManager.clearCache();
  } catch { /* sin caché que limpiar */ }
  try {
    const { writeAuditLog } = await import("./marketing-team/audit");
    await writeAuditLog({ tenantId, agent: "CuentaAutorizada", action: "cuenta_cambiada", resource: String(c.id), result: "SUCCESS", reason: `${por}: ${anterior || "(ninguna)"} -> ${c.id} (${c.moneda || "?"})` });
  } catch { /* el cambio no depende de la auditoría */ }
  logger.info({ tenantId, anterior, nueva: c.id, moneda: c.moneda, por }, "[MetaAds] Cuenta publicitaria activa cambiada");
}

/**
 * Validación completa antes de publicar/activar (doc §3.2). Lee la cuenta en
 * vivo de Meta, la juzga con `veredictoDeCuenta` y, si el negocio no tenía
 * ninguna fijada y esta valida, la fija y lo audita.
 */
export async function validarCuentaPublicitaria(opts: {
  tenantId: number;
  adAccountId?: string | null;
  token?: string | null;
  origen: string;
}): Promise<VeredictoCuenta> {
  const { tenantId, origen } = opts;
  const id = String(opts.adAccountId || "").trim();
  const token = String(opts.token || "").trim();
  const bloquea = async (motivo: string): Promise<VeredictoCuenta> => {
    try {
      const { writeAuditLog } = await import("./marketing-team/audit");
      await writeAuditLog({ tenantId, agent: "CuentaAutorizada", action: "publicar_bloqueado", resource: id || undefined, result: "FAILED", reason: `${origen}: ${motivo}` });
    } catch { /* el bloqueo no depende de la auditoría */ }
    return { ok: false, motivo };
  };
  if (!id) return bloquea("El negocio no tiene cuenta publicitaria configurada: conectala en el panel (Facebook → Configuración) antes de publicar.");
  if (!token) return bloquea("Falta el token de Meta para verificar la cuenta: reconectá Facebook desde el panel.");

  let cruda: any;
  try {
    const params = new URLSearchParams({ fields: "account_id,name,account_status,currency,disable_reason", access_token: token });
    const res = await fetch(`${FB_GRAPH_BASE}/act_${id}?${params}`, { signal: AbortSignal.timeout(15000) });
    cruda = await res.json();
  } catch (e: any) {
    return bloquea(`No se pudo leer la cuenta ${id} en Meta (${e?.message || e}): sin confirmar la cuenta no se publica nada.`);
  }
  if (cruda?.error) {
    return bloquea(`Meta no devolvió la cuenta ${id}: ${cruda.error?.error_user_msg || cruda.error?.message || "sin detalle"}. Revisá el token y la cuenta en el panel.`);
  }
  const cuenta: CuentaMeta = {
    id: String(cruda?.account_id || id),
    nombre: cruda?.name || null,
    moneda: cruda?.currency || null,
    estado: cruda?.account_status != null ? Number(cruda.account_status) : null,
    motivoDeshabilitada: cruda?.disable_reason ?? null,
  };
  const autorizada = await leerCuentaAutorizada(tenantId);
  const v = veredictoDeCuenta(cuenta, autorizada);
  if (!v.ok) {
    // Moneda equivocada: decir A QUÉ cuenta pasarse, no solo que esta no
    // sirve (caso real 30-09-2026: el dueño tenía su cuenta COP y nadie se la
    // ofrecía). La lista sale del MISMO token del negocio.
    if (String(cuenta.moneda || "").toUpperCase() !== "COP") {
      try {
        const { listarCuentasAccesibles, sugerenciaDeCuentaCop } = await import("./meta-cuentas-publicitarias");
        const l = await listarCuentasAccesibles(token);
        if (!l.error) return bloquea(`La cuenta ${cuenta.id} está en ${cuenta.moneda || "moneda desconocida"}: solo se publica en la cuenta COP autorizada del negocio. ${sugerenciaDeCuentaCop(l.cuentas, cuenta.id)}`);
      } catch { /* sin sugerencia, el bloqueo sigue igual */ }
    }
    return bloquea(v.motivo);
  }

  // Primera vez válida: se clava y se audita. Lo que ya estaba bien no se rompe.
  // Sin tenant real no se fija nada (pero igual se valida lo que devolvió Meta).
  if (!autorizada && tenantId > 0) {
    try {
      await fijarCuentaAutorizada(tenantId, { id: cuenta.id, moneda: cuenta.moneda || "COP" }, `auto:${origen}`);
      const { writeAuditLog } = await import("./marketing-team/audit");
      await writeAuditLog({ tenantId, agent: "CuentaAutorizada", action: "cuenta_fijada", resource: cuenta.id, result: "SUCCESS", reason: `${origen}: primera cuenta COP válida, se fija como autorizada` });
    } catch (e: any) {
      logger.warn({ tenantId, err: e?.message }, "[MetaAds] No se pudo fijar la cuenta autorizada");
    }
    return { ...v, fijadaAhora: true };
  }
  return v;
}
