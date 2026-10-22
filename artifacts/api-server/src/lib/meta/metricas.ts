/**
 * Métricas propias de Meta: una fila por negocio, cuenta, campaña y día.
 *
 * Los paneles y Atlas leen de aquí. Solo el trabajo `sincronizar_insights`
 * habla con Meta, así que leer un panel nunca consume cuota de la cuenta.
 */

import type { Sql } from "./cola";
import { encolar } from "./cola";
import type { ClienteGraph } from "./graph";
import type { Manejador } from "./worker";

export const DDL_METRICAS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta_insights_diarios (
     tenant_id INTEGER NOT NULL,
     cuenta TEXT NOT NULL,
     campana_id TEXT NOT NULL,
     campana_nombre TEXT,
     fecha DATE NOT NULL,
     gasto NUMERIC(14,2) NOT NULL DEFAULT 0,
     impresiones BIGINT NOT NULL DEFAULT 0,
     clics BIGINT NOT NULL DEFAULT 0,
     alcance BIGINT NOT NULL DEFAULT 0,
     resultados NUMERIC(14,2) NOT NULL DEFAULT 0,
     sincronizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (tenant_id, campana_id, fecha)
   )`,
  `CREATE INDEX IF NOT EXISTS meta_insights_cuenta_fecha
     ON meta_insights_diarios (tenant_id, cuenta, fecha)`,
];

export async function migrarMetricas(sql: Sql): Promise<void> {
  for (const ddl of DDL_METRICAS) await sql.query(ddl);
}

/** Tipos de acción que cuentan como "resultado", igual que en facebook.ts. */
export const TIPOS_RESULTADO = [
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "lead",
  "onsite_conversion.messaging_conversation_started_7d",
  "link_click",
] as const;

export interface FilaDiaria {
  campanaId: string;
  campanaNombre: string | null;
  fecha: string; // YYYY-MM-DD
  gasto: number;
  impresiones: number;
  clics: number;
  alcance: number;
  resultados: number;
}

/** Convierte una fila de Graph (time_increment=1) en una fila diaria. Puro. */
export function filaDesdeGraph(fila: Record<string, unknown>): FilaDiaria | null {
  const campanaId = fila.campaign_id != null ? String(fila.campaign_id) : "";
  const fecha = typeof fila.date_start === "string" ? fila.date_start : "";
  if (!campanaId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;

  const acciones = Array.isArray(fila.actions) ? (fila.actions as { action_type?: string; value?: string }[]) : [];
  const resultados = acciones
    .filter((a) => a.action_type && (TIPOS_RESULTADO as readonly string[]).includes(a.action_type))
    .reduce((suma, a) => suma + (Number(a.value) || 0), 0);

  const numero = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  return {
    campanaId,
    campanaNombre: typeof fila.campaign_name === "string" ? fila.campaign_name : null,
    fecha,
    gasto: numero(fila.spend),
    impresiones: Math.round(numero(fila.impressions)),
    clics: Math.round(numero(fila.clicks)),
    alcance: Math.round(numero(fila.reach)),
    resultados: resultados,
  };
}

/** Guarda filas diarias. Upsert: volver a sincronizar corrige, no duplica. */
export async function guardarInsightsDiarios(
  sql: Sql,
  tenantId: number,
  cuenta: string,
  filas: FilaDiaria[],
): Promise<number> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("tenantId inválido");
  if (!filas.length) return 0;
  await sql.transaccion(async (tx) => {
    for (const f of filas) {
      await tx.query(
        `INSERT INTO meta_insights_diarios
           (tenant_id, cuenta, campana_id, campana_nombre, fecha, gasto, impresiones, clics, alcance, resultados, sincronizado_en)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         ON CONFLICT (tenant_id, campana_id, fecha) DO UPDATE SET
           cuenta = EXCLUDED.cuenta,
           campana_nombre = EXCLUDED.campana_nombre,
           gasto = EXCLUDED.gasto,
           impresiones = EXCLUDED.impresiones,
           clics = EXCLUDED.clics,
           alcance = EXCLUDED.alcance,
           resultados = EXCLUDED.resultados,
           sincronizado_en = now()`,
        [tenantId, cuenta, f.campanaId, f.campanaNombre, f.fecha, f.gasto, f.impresiones, f.clics, f.alcance, f.resultados],
      );
    }
  });
  return filas.length;
}

export interface ResumenCampana {
  campanaId: string;
  campanaNombre: string | null;
  gasto: number;
  impresiones: number;
  clics: number;
  resultados: number;
  costoPorResultado: number | null;
}

/** Lectura para paneles y Atlas. Siempre filtrada por negocio y cuenta. */
export async function resumenPorCampana(
  sql: Sql,
  tenantId: number,
  cuenta: string,
  desde: string,
  hasta: string,
): Promise<ResumenCampana[]> {
  const { rows } = await sql.query(
    `SELECT campana_id,
            max(campana_nombre) AS campana_nombre,
            sum(gasto)::float AS gasto,
            sum(impresiones)::bigint AS impresiones,
            sum(clics)::bigint AS clics,
            sum(resultados)::float AS resultados
       FROM meta_insights_diarios
      WHERE tenant_id = $1 AND cuenta = $2 AND fecha BETWEEN $3 AND $4
      GROUP BY campana_id
      ORDER BY sum(gasto) DESC`,
    [tenantId, cuenta, desde, hasta],
  );
  return rows.map((r) => {
    const gasto = Number(r.gasto) || 0;
    const resultados = Number(r.resultados) || 0;
    return {
      campanaId: String(r.campana_id),
      campanaNombre: (r.campana_nombre as string | null) ?? null,
      gasto,
      impresiones: Number(r.impresiones) || 0,
      clics: Number(r.clics) || 0,
      resultados,
      costoPorResultado: resultados > 0 ? gasto / resultados : null,
    };
  });
}

export const MAX_PAGINAS_INSIGHTS = 50;

/** Descarga insights diarios por campaña, paginando con tope de seguridad. */
export async function descargarInsights(
  graph: ClienteGraph,
  token: string,
  cuenta: string,
  datePreset = "last_14d",
): Promise<FilaDiaria[]> {
  const filas: FilaDiaria[] = [];
  let despues: string | undefined;
  for (let pagina = 0; pagina < MAX_PAGINAS_INSIGHTS; pagina++) {
    const params: Record<string, string> = {
      level: "campaign",
      time_increment: "1",
      date_preset: datePreset,
      fields: "campaign_id,campaign_name,spend,impressions,clicks,reach,actions,date_start",
      limit: "500",
    };
    if (despues) params.after = despues;
    const cuerpo = (await graph.get(`${cuenta}/insights`, params, token)) as {
      data?: Record<string, unknown>[];
      paging?: { cursors?: { after?: string }; next?: string };
    };
    for (const fila of cuerpo?.data ?? []) {
      const f = filaDesdeGraph(fila);
      if (f) filas.push(f);
    }
    despues = cuerpo?.paging?.next ? cuerpo?.paging?.cursors?.after : undefined;
    if (!despues) break;
  }
  return filas;
}

export interface OpcionesManejadorInsights {
  sql: Sql;
  graph: ClienteGraph;
  /** Devuelve el token de usuario del negocio, o null si no tiene conexión. */
  tokenDe: (tenantId: number) => Promise<string | null>;
}

/** Manejador del trabajo `sincronizar_insights`. */
export function crearManejadorInsights(op: OpcionesManejadorInsights): Manejador {
  return async (trabajo) => {
    const token = await op.tokenDe(trabajo.tenantId);
    if (!token) {
      throw new Error(`sin conexión de Meta para el negocio ${trabajo.tenantId}`);
    }
    const dias = Number(trabajo.payload.dias) || 14;
    const preset = dias <= 7 ? "last_7d" : "last_14d";
    const filas = await descargarInsights(op.graph, token, trabajo.cuenta, preset);
    await guardarInsightsDiarios(op.sql, trabajo.tenantId, trabajo.cuenta, filas);
  };
}

/** Hash estable de 32 bits, para escalonar sin aleatoriedad. */
export function hashEstable(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const VENTANA_NOCTURNA_MS = 6 * 60 * 60 * 1000;

/**
 * Programa la sincronización diaria de cada cuenta. La demora es fija por
 * cuenta dentro de una ventana de 6 h, así los negocios no pegan todos a la
 * vez. La clave de idempotencia evita duplicar la misma fecha si se
 * programa dos veces.
 */
export async function programarSincronizacionDiaria(
  sql: Sql,
  cuentas: { tenantId: number; cuenta: string }[],
  fecha: string,
): Promise<{ encolados: number; repetidos: number }> {
  let encolados = 0;
  let repetidos = 0;
  for (const c of cuentas) {
    const demoraMs = hashEstable(`${c.tenantId}:${c.cuenta}`) % VENTANA_NOCTURNA_MS;
    const id = await encolar(sql, {
      tenantId: c.tenantId,
      cuenta: c.cuenta,
      tipo: "sincronizar_insights",
      payload: { dias: 14 },
      claveIdempotencia: `insights:${c.cuenta}:${fecha}`,
      demoraMs,
    });
    if (id == null) repetidos++;
    else encolados++;
  }
  return { encolados, repetidos };
}
