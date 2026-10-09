/**
 * Configuración de facturación del negocio: `tenants.metadata.facturacion`.
 * Mismo patrón que lib/integraciones/credenciales.ts (secretos con enc:v1:,
 * se lee la metadata REAL de la base para no pisar el resto).
 */
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "../credentials-vault";
import { tenantManager } from "../tenantManager";
import { secretoNuevo, ultimos4 } from "../secretos";
import { PROVEEDORES_FACTURACION, type ConfigFacturacion, type ProveedorFacturacion } from "./tipos";

async function metaDe(tenantId: number): Promise<any> {
  const [fila] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const m = (fila as any)?.metadata;
  if (!m) return {};
  if (typeof m === "string") { try { return JSON.parse(m); } catch { return {}; } }
  return m;
}

const descifrar = (v: unknown) => (v ? decryptSecret(String(v)) : "");

/** La configuración con secretos descifrados, o null si el negocio no conectó nada. */
export async function leerConfigFacturacion(tenantId: number): Promise<ConfigFacturacion | null> {
  const f = (await metaDe(tenantId)).facturacion;
  if (!f?.proveedor) return null;
  return {
    proveedor: f.proveedor,
    activa: f.activa !== false,
    alegra: f.alegra ? {
      correo: String(f.alegra.correo || ""),
      token: descifrar(f.alegra.token),
      contactoPorDefecto: String(f.alegra.contactoPorDefecto || ""),
      numeracion: f.alegra.numeracion || undefined,
      impuesto: f.alegra.impuesto || undefined,
      electronica: f.alegra.electronica === true,
    } : undefined,
    webhook: f.webhook ? { url: String(f.webhook.url || ""), secreto: descifrar(f.webhook.secreto) } : undefined,
    actualizadaEn: f.actualizadaEn,
  };
}

export interface ParcheFacturacion {
  proveedor?: string;
  activa?: boolean;
  alegra?: Partial<{ correo: string; token: string; contactoPorDefecto: string; numeracion: string; impuesto: string; electronica: boolean }>;
  webhook?: Partial<{ url: string; secreto: string }>;
}

/** Guarda solo lo que cambia. Vacío o enmascarado ("••••abcd") no pisa un secreto guardado. */
export async function guardarConfigFacturacion(tenantId: number, p: ParcheFacturacion): Promise<void> {
  const meta = await metaDe(tenantId);
  const prev = meta.facturacion || {};
  const next: any = { ...prev };
  if (p.proveedor !== undefined) {
    if (!(PROVEEDORES_FACTURACION as string[]).includes(p.proveedor)) {
      throw new Error(`Proveedor inválido. Usá: ${PROVEEDORES_FACTURACION.join(", ")}`);
    }
    next.proveedor = p.proveedor as ProveedorFacturacion;
  }
  if (p.activa !== undefined) next.activa = p.activa === true;
  if (p.alegra) {
    const a = { ...(prev.alegra || {}) };
    if (p.alegra.correo !== undefined) a.correo = String(p.alegra.correo).trim();
    const token = secretoNuevo(p.alegra.token);
    if (token) a.token = encryptSecret(token);
    if (p.alegra.contactoPorDefecto !== undefined) a.contactoPorDefecto = String(p.alegra.contactoPorDefecto).trim();
    if (p.alegra.numeracion !== undefined) a.numeracion = String(p.alegra.numeracion).trim();
    if (p.alegra.impuesto !== undefined) a.impuesto = String(p.alegra.impuesto).trim();
    if (p.alegra.electronica !== undefined) a.electronica = p.alegra.electronica === true;
    next.alegra = a;
  }
  if (p.webhook) {
    const w = { ...(prev.webhook || {}) };
    if (p.webhook.url !== undefined) {
      const url = String(p.webhook.url).trim();
      if (url && !/^https:\/\//i.test(url)) throw new Error("La URL del webhook tiene que empezar con https://");
      w.url = url;
    }
    const secreto = secretoNuevo(p.webhook.secreto);
    if (secreto) w.secreto = encryptSecret(secreto);
    next.webhook = w;
  }
  next.actualizadaEn = new Date().toISOString();
  await db.update(tenants).set({ metadata: { ...meta, facturacion: next } as any }).where(eq(tenants.id, tenantId));
  try { tenantManager.clearCache(); } catch { /* noop */ }
}

export async function borrarConfigFacturacion(tenantId: number): Promise<void> {
  const meta = await metaDe(tenantId);
  const { facturacion: _fuera, ...resto } = meta;
  await db.update(tenants).set({ metadata: resto as any }).where(eq(tenants.id, tenantId));
  try { tenantManager.clearCache(); } catch { /* noop */ }
}

/** Para el panel y Atlas: qué hay conectado, sin secretos (solo los últimos 4). */
export function resumenSinSecretos(c: ConfigFacturacion | null) {
  if (!c) return { conectada: false as const };
  return {
    conectada: true as const,
    proveedor: c.proveedor,
    activa: c.activa,
    actualizadaEn: c.actualizadaEn,
    alegra: c.alegra ? {
      correo: c.alegra.correo,
      token: c.alegra.token ? `••••${ultimos4(c.alegra.token)}` : "",
      contactoPorDefecto: c.alegra.contactoPorDefecto,
      numeracion: c.alegra.numeracion || "",
      impuesto: c.alegra.impuesto || "",
      electronica: c.alegra.electronica,
    } : undefined,
    webhook: c.webhook ? { url: c.webhook.url, secreto: c.webhook.secreto ? `••••${ultimos4(c.webhook.secreto)}` : "" } : undefined,
  };
}
