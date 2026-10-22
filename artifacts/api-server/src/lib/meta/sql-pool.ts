import type { Filas, Sql } from "./cola";

/** Adapta un pool de `pg` a la interfaz Sql de la cola. */
export interface PoolLike {
  query(texto: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<{ query(texto: string, params?: unknown[]): Promise<{ rows: unknown[] }>; release(): void }>;
}

function envolver(q: { query(texto: string, params?: unknown[]): Promise<{ rows: unknown[] }> }, pool: PoolLike): Sql {
  return {
    query: async (texto, params): Promise<Filas> => {
      const r = await q.query(texto, params);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    transaccion: async <T>(fn: (tx: Sql) => Promise<T>): Promise<T> => {
      const cliente = await pool.connect();
      try {
        await cliente.query("BEGIN");
        const resultado = await fn(envolver(cliente, pool));
        await cliente.query("COMMIT");
        return resultado;
      } catch (e) {
        await cliente.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        cliente.release();
      }
    },
  };
}

export function sqlDesdePool(pool: PoolLike): Sql {
  return envolver(pool, pool);
}
