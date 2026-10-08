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
 * ANTES de borrar exporta un backup en JSON a `data/backups/` con TODO lo que
 * se va a eliminar, para poder restaurarlo en caso de emergencia. El backup es
 * agnóstico del motor (funciona con SQLite y con PostgreSQL): exporta las filas
 * con el mismo cliente drizzle que las va a borrar.
 *
 * ⚠️ Acción destructiva e irreversible (fuera del backup). Se llama desde una
 * ruta protegida por sesión y nunca desde una herramienta de Atlas.
 */

import fs from "node:fs";
import path from "node:path";
import { count, eq, inArray, sql } from "drizzle-orm";
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
  messages,
  followUps,
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

function directorioBackups(): string {
  const dir = process.env.BACKUP_DIR || path.join(process.cwd(), "data", "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function filasDe(tabla: any, tenantId: number): Promise<any[]> {
  return db.select().from(tabla).where(eq(tabla.tenantId, tenantId));
}

async function contar(tabla: any, tenantId: number): Promise<number> {
  const r = await db.select({ n: count() }).from(tabla).where(eq(tabla.tenantId, tenantId));
  return Number(r?.[0]?.n ?? 0);
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

  // ── 1. Exportar el backup ANTES de borrar ────────────────────────────────
  // Si el backup falla, NO se borra nada: resetear sin respaldo es un tiro a
  // ciegas sobre la base de producción.
  let backup: string | null = null;
  const snapshot: Record<string, any[]> = {};
  try {
    // Mensajes y seguimientos cuelgan de las conversaciones (que se borran por
    // cascade): se respaldan por el id de conversación del tenant.
    const convs = await filasDe(conversations, tenantId);
    const convIds = convs.map((c: any) => c.id);
    snapshot.conversaciones = convs;
    snapshot.mensajes = convIds.length
      ? await db.select().from(messages).where(inArray(messages.conversationId, convIds))
      : [];
    snapshot.seguimientos = convIds.length
      ? await db.select().from(followUps).where(inArray(followUps.conversationId, convIds))
      : [];

    for (const { nombre, tabla } of POR_TENANT) {
      if (nombre === "conversaciones") continue; // ya exportadas
      snapshot[nombre] = await filasDe(tabla, tenantId);
    }
    for (const { nombre, tabla } of GLOBALES) {
      snapshot[nombre] = await db.select().from(tabla);
    }

    const nombreArchivo = `reset-${tenantId}-${Date.now()}.json`;
    const rutaArchivo = path.join(directorioBackups(), nombreArchivo);
    fs.writeFileSync(
      rutaArchivo,
      JSON.stringify({ tenantId, timestamp: new Date().toISOString(), tablas: snapshot }),
    );
    backup = rutaArchivo;
  } catch (e: any) {
    return { ok: false, backup: null, borrados: {}, error: `No se pudo hacer el backup: ${e?.message || e}` };
  }

  // ── 2. Borrar ────────────────────────────────────────────────────────────
  const borrados: Record<string, number> = {};
  try {
    for (const { nombre, tabla } of POR_TENANT) {
      borrados[nombre] = await contar(tabla, tenantId);
      await db.delete(tabla).where(eq(tabla.tenantId, tenantId));
    }
    // mensajes y seguimientos se van por cascade al borrar conversaciones.
    borrados.mensajes = snapshot.mensajes.length;
    borrados.seguimientos = snapshot.seguimientos.length;
    for (const { nombre, tabla } of GLOBALES) {
      borrados[nombre] = snapshot[nombre].length;
      await db.delete(tabla).where(sql`1 = 1`);
    }

    return { ok: true, backup, borrados };
  } catch (e: any) {
    return { ok: false, backup, borrados, error: e?.message || String(e) };
  }
}

/**
 * Restaura un backup JSON generado por `resetearPruebas`.
 *
 * Reinserta las filas guardadas. No borra nada antes: está pensada para
 * recuperar lo que se eliminó, no para reemplazar el estado actual.
 */
export async function restaurarDesdeBackup(ruta: string): Promise<{ ok: boolean; error?: string }> {
  try {
    // Solo archivos de backup de ESTE sistema: nada de rutas arbitrarias del disco.
    const dir = path.resolve(directorioBackups());
    const archivo = path.resolve(dir, path.basename(String(ruta || "")));
    if (!/^reset-\d+-\d+\.json$/.test(path.basename(archivo)) || path.dirname(archivo) !== dir) {
      return { ok: false, error: "Ruta de backup inválida" };
    }
    const contenido = fs.readFileSync(archivo, "utf8");
    const datos = JSON.parse(contenido);
    const tablas = datos?.tablas || {};

    // Orden de reinserción: primero las conversaciones (los mensajes y
    // seguimientos dependen de su id), después el resto.
    const orden = ["conversaciones", "mensajes", "seguimientos", "leads", "pagos", "transacciones de pago", "memoria de Atlas", "analíticas de respuestas", "versiones de prompt", "borradores de anuncios", "logs del agente de anuncios", "tareas de marketing", "experimentos de marketing", "campañas de marketing", "presupuestos de marketing", "auditorías de marketing", "trabajos programados", "consumo mensual", "enlaces de pago", "eventos de actividad"];
    const tablaPorNombre: Record<string, any> = {
      conversaciones: conversations, mensajes, seguimientos: followUps, leads, pagos,
      "transacciones de pago": paymentTransactions, "memoria de Atlas": architectMemory,
      "analíticas de respuestas": responseAnalytics, "versiones de prompt": promptVersions,
      "borradores de anuncios": facebookDrafts, "logs del agente de anuncios": adAgentLogs,
      "tareas de marketing": marketingTasks, "experimentos de marketing": marketingExperiments,
      "campañas de marketing": marketingCampaigns, "presupuestos de marketing": marketingBudgets,
      "auditorías de marketing": marketingAuditLogs, "trabajos programados": trabajosProgramados,
      "consumo mensual": consumoMensual, "enlaces de pago": paymentLinks,
      "eventos de actividad": activityEvents,
    };

    for (const nombre of orden) {
      const filas = tablas[nombre];
      const tabla = tablaPorNombre[nombre];
      if (!filas || !Array.isArray(filas) || filas.length === 0 || !tabla) continue;
      for (const fila of filas) {
        await db.insert(tabla).values(fila as any);
      }
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Lista los backups disponibles (para que el admin sepa qué puede restaurar). */
export function listarBackups(): Array<{ nombre: string; ruta: string; bytes: number; fecha: string }> {
  try {
    const dir = directorioBackups();
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json") && f.startsWith("reset-"))
      .map((f) => {
        const ruta = path.join(dir, f);
        let bytes = 0;
        let mtime = 0;
        try { const s = fs.statSync(ruta); bytes = s.size; mtime = s.mtimeMs; } catch { /* ignore */ }
        return { nombre: f, ruta, bytes, fecha: new Date(mtime).toISOString() };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  } catch {
    return [];
  }
}
