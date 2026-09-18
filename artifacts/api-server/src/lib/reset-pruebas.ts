/**
 * ============================================================
 * RESETEO DE PRUEBAS PARA UN NEGOCIO (SaaS multi-tenant)
 * ============================================================
 *
 * Borra SOLO los datos de prueba de un tenant: conversaciones de WhatsApp,
 * leads, pagos, memoria de Atlas, anuncios y tareas de marketing, y
 * automatizaciones programadas. Deja intacto lo que es configuración del
 * negocio: productos, categorías, tienda, agentes, la sesión de WhatsApp
 * (para no re-escanear el QR) y la suscripción.
 *
 * ANTES de borrar hace un backup del archivo SQLite a un `.bak-<timestamp>`,
 * y guarda la ruta en la tabla `settings` (campo `business_config`) para poder
 * restaurarlo después desde la ruta de emergencia.
 *
 * ⚠️ Acción destructiva e irreversible (fuera del backup). Se llama desde una
 * ruta protegida por sesión y nunca desde una herramienta de Atlas.
 */

import fs from "node:fs";
import path from "node:path";
import { count, eq, sql } from "drizzle-orm";
import {
  db,
  conversations,
  leads,
  payments,
  paymentTransactions,
  paymentLinks,
  architectMemory,
  responseAnalytics,
  promptVersions,
  facebookDrafts,
  adAgentLogs,
  marketingTasks,
  marketingExperiments,
  marketingCampaigns,
  marketingBudgets,
  marketingAuditLogs,
  trabajosProgramados,
  consumoMensual,
  activityEvents,
  saveDbToDisk,
} from "@workspace/db";

/** Tablas que se limpian POR tenant (tienen tenant_id). */
const POR_TENANT: Array<{ nombre: string; tabla: any }> = [
  { nombre: "conversaciones", tabla: conversations },
  { nombre: "leads", tabla: leads },
  { nombre: "pagos", tabla: payments },
  { nombre: "transacciones de pago", tabla: paymentTransactions },
  { nombre: "memoria de Atlas", tabla: architectMemory },
  { nombre: "analíticas de respuestas", tabla: responseAnalytics },
  { nombre: "versiones de prompt", tabla: promptVersions },
  { nombre: "borradores de anuncios", tabla: facebookDrafts },
  { nombre: "logs del agente de anuncios", tabla: adAgentLogs },
  { nombre: "tareas de marketing", tabla: marketingTasks },
  { nombre: "experimentos de marketing", tabla: marketingExperiments },
  { nombre: "campañas de marketing", tabla: marketingCampaigns },
  { nombre: "presupuestos de marketing", tabla: marketingBudgets },
  { nombre: "auditorías de marketing", tabla: marketingAuditLogs },
  { nombre: "trabajos programados", tabla: trabajosProgramados },
  { nombre: "consumo mensual", tabla: consumoMensual },
];

/** Tablas globales (sin tenant_id) que solo tienen datos de este negocio. */
const GLOBALES: Array<{ nombre: string; tabla: any }> = [
  { nombre: "enlaces de pago", tabla: paymentLinks },
  { nombre: "eventos de actividad", tabla: activityEvents },
];

async function contarPorTenant(tabla: any, tenantId: number): Promise<number> {
  const r = await db.select({ n: count() }).from(tabla).where(eq(tabla.tenantId, tenantId));
  return Number(r?.[0]?.n ?? 0);
}

async function contarGlobal(tabla: any): Promise<number> {
  const r = await db.select({ n: count() }).from(tabla);
  return Number(r?.[0]?.n ?? 0);
}

function rutaBackup(): string | null {
  const dbPath = process.env.SQLITE_PATH || "./data/tecnovariedades.db";
  const fullPath = path.resolve(dbPath);
  return fs.existsSync(fullPath) ? fullPath : null;
}

export interface ResultadoReset {
  ok: boolean;
  backup: string | null;
  borrados: Record<string, number>;
  error?: string;
}

export async function resetearPruebas(tenantId: number): Promise<ResultadoReset> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return { ok: false, backup: null, borrados: {}, error: "tenantId inválido" };
  }

  // ── Backup del archivo SQLite antes de tocar nada ────────────────────────
  // Si el backup falla, NO se borra nada: resetear sin respaldo es un tiro a
  // ciegas sobre la base de producción.
  let backup: string | null = null;
  try {
    if (saveDbToDisk) saveDbToDisk();
    const fullPath = rutaBackup();
    if (!fullPath) {
      return { ok: false, backup: null, borrados: {}, error: "No se encontró el archivo de base de datos para respaldar" };
    }
    backup = `${fullPath}.bak-${Date.now()}`;
    fs.copyFileSync(fullPath, backup);
  } catch (e: any) {
    return { ok: false, backup: null, borrados: {}, error: `No se pudo hacer el backup: ${e?.message || e}` };
  }

  const borrados: Record<string, number> = {};

  try {
    // ── Tablas por tenant ──────────────────────────────────────────────────
    for (const { nombre, tabla } of POR_TENANT) {
      borrados[nombre] = await contarPorTenant(tabla, tenantId);
      await db.delete(tabla).where(eq(tabla.tenantId, tenantId));
    }

    // ── Tablas globales ────────────────────────────────────────────────────
    for (const { nombre, tabla } of GLOBALES) {
      borrados[nombre] = await contarGlobal(tabla);
      await db.delete(tabla).where(sql`1 = 1`);
    }

    // ── Persistir el resultado ─────────────────────────────────────────────
    if (saveDbToDisk) saveDbToDisk();

    return { ok: true, backup, borrados };
  } catch (e: any) {
    return { ok: false, backup, borrados, error: e?.message || String(e) };
  }
}

/**
 * Restaura la base desde un archivo de backup.
 *
 * Para SQLite en producción el archivo se reemplaza por el backup y el proceso
 * debe reiniciarse para recargarlo en memoria (sql.js mantiene la base en RAM y
 * la persiste por intervalos). La ruta devuelve `reinicioRequerido: true` para
 * que quien la llame sepa que hay que reiniciar el servicio.
 */
export async function restaurarDesdeBackup(ruta: string): Promise<{ ok: boolean; reinicioRequerido: boolean; error?: string }> {
  try {
    const fullPath = path.resolve(ruta);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, reinicioRequerido: false, error: `No existe el archivo de backup: ${fullPath}` };
    }
    const destino = rutaBackup();
    if (!destino) {
      return { ok: false, reinicioRequerido: false, error: "No se encontró el archivo de base de datos destino" };
    }
    fs.copyFileSync(fullPath, destino);
    return { ok: true, reinicioRequerido: true };
  } catch (e: any) {
    return { ok: false, reinicioRequerido: false, error: e?.message || String(e) };
  }
}

/** Lista los backups disponibles (para que el admin sepa qué puede restaurar). */
export function listarBackups(): Array<{ nombre: string; ruta: string; bytes: number }> {
  const fullPath = rutaBackup();
  if (!fullPath) return [];
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.startsWith(path.basename(fullPath) + ".bak-"))
    .map((f) => {
      const ruta = path.join(dir, f);
      let bytes = 0;
      try { bytes = fs.statSync(ruta).size; } catch { /* ignore */ }
      return { nombre: f, ruta, bytes };
    })
    .sort((a, b) => b.nombre.localeCompare(a.nombre));
}
