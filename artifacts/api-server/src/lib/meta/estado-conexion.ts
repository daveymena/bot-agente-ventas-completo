/**
 * Estado de la conexión de Meta de cada negocio. Si Meta rechaza el token
 * (código 190/102), el negocio queda en `requiere_reconexion` y el panel lo
 * muestra. Así el aviso no depende de que alguien lea un log.
 */

import type { Sql } from "./cola";

export const DDL_ESTADO_CONEXION: string[] = [
  `CREATE TABLE IF NOT EXISTS meta_estado_conexion (
     tenant_id INTEGER PRIMARY KEY,
     estado TEXT NOT NULL DEFAULT 'ok',
     codigo INTEGER,
     mensaje TEXT,
     actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
];

export async function migrarEstadoConexion(sql: Sql): Promise<void> {
  for (const ddl of DDL_ESTADO_CONEXION) await sql.query(ddl);
}

export async function marcarTokenInvalido(
  sql: Sql,
  tenantId: number,
  codigo: number | undefined,
  mensaje: string,
): Promise<void> {
  if (!Number.isInteger(tenantId) || tenantId <= 0) throw new Error("tenantId inválido");
  await sql.query(
    `INSERT INTO meta_estado_conexion (tenant_id, estado, codigo, mensaje, actualizado_en)
     VALUES ($1, 'requiere_reconexion', $2, $3, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       estado = 'requiere_reconexion', codigo = EXCLUDED.codigo,
       mensaje = EXCLUDED.mensaje, actualizado_en = now()`,
    [tenantId, codigo ?? null, mensaje.slice(0, 500)],
  );
}

/** Un trabajo exitoso demuestra que el token vuelve a servir. */
export async function marcarConexionOk(sql: Sql, tenantId: number): Promise<void> {
  await sql.query(
    `INSERT INTO meta_estado_conexion (tenant_id, estado, actualizado_en)
     VALUES ($1, 'ok', now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       estado = 'ok', codigo = NULL, mensaje = NULL, actualizado_en = now()
     WHERE meta_estado_conexion.estado <> 'ok'`,
    [tenantId],
  );
}

export interface EstadoConexion {
  estado: "ok" | "requiere_reconexion" | "sin_registro";
  codigo: number | null;
  mensaje: string | null;
}

/** Lectura para el panel: siempre filtrada por negocio. */
export async function estadoConexion(sql: Sql, tenantId: number): Promise<EstadoConexion> {
  const { rows } = await sql.query(
    `SELECT estado, codigo, mensaje FROM meta_estado_conexion WHERE tenant_id = $1`,
    [tenantId],
  );
  if (!rows.length) return { estado: "sin_registro", codigo: null, mensaje: null };
  const r = rows[0];
  return {
    estado: r.estado === "requiere_reconexion" ? "requiere_reconexion" : "ok",
    codigo: r.codigo == null ? null : Number(r.codigo),
    mensaje: (r.mensaje as string | null) ?? null,
  };
}
