/**
 * Pruebas contra un Postgres REAL (no simulado). Se ejecutan solo si
 * TEST_PG_URL está definido, por ejemplo:
 *   TEST_PG_URL=postgres://user:pass@127.0.0.1:5432/prueba npx vitest run postgres-real
 *
 * Verifican lo que el pool simulado no puede: que los bloqueos consultivos de
 * Postgres se respetan entre conexiones reales, y que la cola no entrega dos
 * trabajos de la misma cuenta a la vez bajo concurrencia.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { conExclusionDeCuenta, CuentaOcupadaError } from "../bloqueo-cuenta";
import { migrarCola, encolar, reclamar, completar, listarTrabajos, type Sql } from "../cola";

const URL = process.env.TEST_PG_URL;

function sqlDesdePool(pool: pg.Pool): Sql {
  const envolver = (q: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Sql => ({
    query: async (t, p) => ({ rows: (await q.query(t, p)).rows as Record<string, unknown>[] }),
    transaccion: async (fn) => {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await fn(envolver(c as unknown as { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }));
        await c.query("COMMIT");
        return r;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  });
  return envolver(pool);
}

describe.skipIf(!URL)("exclusión por cuenta con Postgres real", () => {
  let pool: pg.Pool;
  let sql: Sql;
  const tenant = 4242;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 5 });
    sql = sqlDesdePool(pool);
    await migrarCola(sql);
    await sql.query(`DELETE FROM meta_trabajos WHERE tenant_id = $1`, [tenant]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("una cuenta ocupada en otra conexión real hace esperar y luego agota el tiempo", async () => {
    let liberar!: () => void;
    const retenida = conExclusionDeCuenta(pool as any, tenant, "act_real_1", () => new Promise<void>((r) => (liberar = r)));
    while (!liberar) await new Promise((r) => setTimeout(r, 5));
    await expect(
      conExclusionDeCuenta(pool as any, tenant, "act_real_1", async () => "no", { esperaMaxMs: 300, intervaloMs: 20 }),
    ).rejects.toBeInstanceOf(CuentaOcupadaError);
    liberar();
    await retenida;
  });

  it("cuando se libera, la siguiente escritura entra", async () => {
    const r = await conExclusionDeCuenta(pool as any, tenant, "act_real_1", async () => "ok", { esperaMaxMs: 2000 });
    expect(r).toBe("ok");
  });

  it("bajo concurrencia nunca hay dos escrituras a la misma cuenta a la vez", async () => {
    let dentro = 0;
    let maximo = 0;
    const tareas = Array.from({ length: 30 }, () =>
      conExclusionDeCuenta(
        pool as any,
        tenant,
        "act_real_2",
        async () => {
          dentro++;
          maximo = Math.max(maximo, dentro);
          await new Promise((r) => setTimeout(r, 10));
          dentro--;
        },
        { esperaMaxMs: 20_000, intervaloMs: 5 },
      ),
    );
    await Promise.all(tareas);
    expect(maximo).toBe(1);
  });

  it("mientras las escrituras esperan, el pool sigue libre para otras consultas", async () => {
    // Pool de 5: un holder y 10 esperando. Si los que esperan retuvieran
    // conexiones, la consulta de abajo se quedaría sin conexión.
    let liberar!: () => void;
    const holder = conExclusionDeCuenta(pool as any, tenant, "act_real_3", () => new Promise<void>((r) => (liberar = r)));
    while (!liberar) await new Promise((r) => setTimeout(r, 5));
    const esperando = Array.from({ length: 10 }, () =>
      conExclusionDeCuenta(pool as any, tenant, "act_real_3", async () => "x", { esperaMaxMs: 5000, intervaloMs: 10 }).catch((e) => e),
    );
    await new Promise((r) => setTimeout(r, 100));
    const t0 = Date.now();
    const { rows } = await pool.query("SELECT 1 AS ok");
    expect(rows[0].ok).toBe(1);
    expect(Date.now() - t0).toBeLessThan(1000);
    liberar();
    await holder;
    await Promise.all(esperando);
  });
});

describe.skipIf(!URL)("cola con Postgres real", () => {
  let pool: pg.Pool;
  let sql: Sql;
  const tenant = 4343;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: URL, max: 10 });
    sql = sqlDesdePool(pool);
    await migrarCola(sql);
    await sql.query(`DELETE FROM meta_trabajos WHERE tenant_id = $1`, [tenant]);
    await sql.query(`DELETE FROM meta_cuentas_cola WHERE tenant_id = $1`, [tenant]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("200 trabajos en 20 cuentas con 8 workers: ninguno se pisa y todos terminan", async () => {
    const CUENTAS = 20;
    const TRABAJOS = 200;
    for (let i = 0; i < TRABAJOS; i++) {
      await encolar(sql, { tenantId: tenant, cuenta: `act_q${i % CUENTAS}`, tipo: "x", payload: { i } });
    }

    const enCurso = new Map<string, number>();
    let violaciones = 0;
    let hechos = 0;

    const worker = async () => {
      for (;;) {
        const t = await reclamar(sql, 60_000);
        if (!t) {
          if (hechos >= TRABAJOS) return;
          await new Promise((r) => setTimeout(r, 5));
          continue;
        }
        const n = (enCurso.get(t.cuenta) ?? 0) + 1;
        enCurso.set(t.cuenta, n);
        if (n > 1) violaciones++;
        await new Promise((r) => setTimeout(r, 2));
        enCurso.set(t.cuenta, (enCurso.get(t.cuenta) ?? 1) - 1);
        await completar(sql, t.id);
        hechos++;
      }
    };

    await Promise.all(Array.from({ length: 8 }, worker));

    expect(violaciones).toBe(0);
    const hechosDb = await listarTrabajos(sql, tenant, { estado: "hecho", limite: 500 });
    expect(hechosDb.length).toBe(TRABAJOS);
  }, 120_000);
});
