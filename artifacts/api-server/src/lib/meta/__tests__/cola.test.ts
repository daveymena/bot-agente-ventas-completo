import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  migrarCola,
  encolar,
  reclamar,
  completar,
  fallar,
  recuperarArrendosVencidos,
  listarTrabajos,
  esperaDeReintento,
  type Sql,
} from "../cola";

/** Adapta PGlite (Postgres real en WASM) a la interfaz Sql de la cola. */
function sqlDesdePglite(db: PGlite): Sql {
  const envolver = (q: { query: PGlite["query"] }): Sql => ({
    query: async (texto, params) => {
      const r = await q.query(texto, params as unknown[] | undefined);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    transaccion: async (fn) => fn(envolver(q)),
  });
  return {
    query: async (texto, params) => {
      const r = await db.query(texto, params as unknown[] | undefined);
      return { rows: r.rows as Record<string, unknown>[] };
    },
    transaccion: (fn) => db.transaction((tx) => fn(envolver(tx as unknown as { query: PGlite["query"] }))),
  };
}

let db: PGlite;
let sql: Sql;

beforeEach(async () => {
  db = new PGlite();
  sql = sqlDesdePglite(db);
  await migrarCola(sql);
});

describe("migración", () => {
  it("es idempotente", async () => {
    await migrarCola(sql);
    await migrarCola(sql);
    const { rows } = await sql.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('meta_trabajos','meta_cuentas_cola')`,
    );
    expect(rows[0].n).toBe(2);
  });
});

describe("encolar", () => {
  it("devuelve id y no duplica con la misma clave de idempotencia", async () => {
    const a = await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights", claveIdempotencia: "d-2026-10-21" });
    const b = await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights", claveIdempotencia: "d-2026-10-21" });
    expect(a).toBeTypeOf("number");
    expect(b).toBeNull();
  });

  it("la idempotencia es por negocio: otro negocio puede usar la misma clave", async () => {
    const a = await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights", claveIdempotencia: "k" });
    const b = await encolar(sql, { tenantId: 2, cuenta: "act_9", tipo: "insights", claveIdempotencia: "k" });
    expect(a).toBeTypeOf("number");
    expect(b).toBeTypeOf("number");
  });

  it("rechaza tenant inválido", async () => {
    await expect(encolar(sql, { tenantId: 0, cuenta: "act_1", tipo: "x" })).rejects.toThrow();
  });
});

describe("concurrencia por cuenta", () => {
  it("una cuenta ocupada no entrega un segundo trabajo mientras el primero está en curso", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });

    const primero = await reclamar(sql);
    expect(primero).not.toBeNull();
    expect(await reclamar(sql)).toBeNull();

    await completar(sql, primero!.id);
    const segundo = await reclamar(sql);
    expect(segundo).not.toBeNull();
    expect(segundo!.id).not.toBe(primero!.id);
  });

  it("cuentas distintas sí se procesan en paralelo", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    await encolar(sql, { tenantId: 1, cuenta: "act_2", tipo: "insights" });
    const a = await reclamar(sql);
    const b = await reclamar(sql);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(new Set([a!.cuenta, b!.cuenta]).size).toBe(2);
  });
});

describe("aislamiento por negocio", () => {
  it("dos negocios con el mismo id de cuenta quedan separados", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights", payload: { negocio: 1 } });
    await encolar(sql, { tenantId: 2, cuenta: "act_1", tipo: "insights", payload: { negocio: 2 } });

    const a = await reclamar(sql);
    const b = await reclamar(sql);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(new Set([a!.tenantId, b!.tenantId])).toEqual(new Set([1, 2]));
    for (const t of [a!, b!]) expect(t.payload.negocio).toBe(t.tenantId);
  });

  it("listarTrabajos nunca devuelve trabajos de otro negocio", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    await encolar(sql, { tenantId: 2, cuenta: "act_2", tipo: "insights" });
    const del2 = await listarTrabajos(sql, 2);
    expect(del2).toHaveLength(1);
    expect(del2[0].cuenta).toBe("act_2");
    expect(await listarTrabajos(sql, 3)).toHaveLength(0);
  });
});

describe("reintentos y fallos", () => {
  it("un fallo reintentable vuelve a pendiente con espera", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const t = (await reclamar(sql))!;
    const r = await fallar(sql, t, "límite", { reintentable: true, esperaMs: 60_000 });
    expect(r).toBe("reintentara");
    expect(await reclamar(sql)).toBeNull(); // todavía no toca
  });

  it("con espera 0 vuelve a estar disponible", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const t = (await reclamar(sql))!;
    await fallar(sql, t, "transitorio", { reintentable: true, esperaMs: 0 });
    const otra = await reclamar(sql);
    expect(otra?.id).toBe(t.id);
    expect(otra?.intentos).toBe(2);
  });

  it("un error no reintentable queda fallido de inmediato", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const t = (await reclamar(sql))!;
    const r = await fallar(sql, t, "token inválido", { reintentable: false });
    expect(r).toBe("fallido");
    const [fila] = await listarTrabajos(sql, 1, { estado: "fallido" });
    expect(fila.ultimo_error).toBe("token inválido");
  });

  it("agota los intentos y queda fallido", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights", maxIntentos: 2 });
    const t1 = (await reclamar(sql))!;
    await fallar(sql, t1, "x", { reintentable: true, esperaMs: 0 });
    const t2 = (await reclamar(sql))!;
    expect(await fallar(sql, t2, "x", { reintentable: true, esperaMs: 0 })).toBe("fallido");
  });
});

describe("arriendos vencidos", () => {
  it("un trabajo cuyo worker murió vuelve a pendiente", async () => {
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    await reclamar(sql, 0); // arriendo de 0 ms: ya venció
    expect(await recuperarArrendosVencidos(sql)).toBe(1);
    const otra = await reclamar(sql);
    expect(otra).not.toBeNull();
  });
});

describe("esperaDeReintento", () => {
  it("crece con los intentos y tiene tope", () => {
    const sinAzar = () => 0;
    expect(esperaDeReintento(1, sinAzar)).toBe(30_000);
    expect(esperaDeReintento(2, sinAzar)).toBe(60_000);
    expect(esperaDeReintento(3, sinAzar)).toBe(120_000);
    expect(esperaDeReintento(30, sinAzar)).toBe(3_600_000);
  });
});
