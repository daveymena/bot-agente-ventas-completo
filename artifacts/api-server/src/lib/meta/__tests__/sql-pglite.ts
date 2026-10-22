import { PGlite } from "@electric-sql/pglite";
import type { Sql } from "../cola";

/** Postgres real en memoria (PGlite) con la interfaz Sql de la cola. */
export async function sqlEnMemoria(): Promise<{ sql: Sql; db: PGlite }> {
  const db = new PGlite();
  const envolver = (q: { query: PGlite["query"] }): Sql => ({
    query: async (texto, params) => {
      const r = await q.query(texto, params as unknown[] | undefined);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    transaccion: async (fn) => fn(envolver(q)),
  });
  const sql: Sql = {
    query: envolver(db).query,
    transaccion: (fn) => db.transaction((tx) => fn(envolver(tx as unknown as { query: PGlite["query"] }))),
  };
  return { sql, db };
}
