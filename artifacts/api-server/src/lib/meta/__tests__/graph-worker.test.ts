import { describe, it, expect, vi } from "vitest";
import { clasificarError, crearClienteGraph, leerUso, MetaError } from "../graph";
import { procesarUno } from "../worker";
import { migrarCola, encolar, listarTrabajos, type Sql } from "../cola";
import { PGlite } from "@electric-sql/pglite";

function respuesta(cuerpo: unknown, status = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: cabeceras });
}

describe("clasificarError", () => {
  it("token inválido no se reintenta", () => {
    const e = clasificarError(190, "token");
    expect(e.categoria).toBe("token_invalido");
  });
  it("límites de uso se reintentan", () => {
    expect(clasificarError(613).categoria).toBe("limite_uso");
    expect(clasificarError(80004).categoria).toBe("limite_uso");
  });
  it("errores desconocidos son permanentes", () => {
    expect(clasificarError(100).categoria).toBe("permanente");
    expect(clasificarError(undefined).categoria).toBe("permanente");
  });
});

describe("leerUso", () => {
  it("lee el mayor porcentaje de las cabeceras de uso", () => {
    const h = new Headers({
      "x-app-usage": JSON.stringify({ call_count: 40, total_time: 12, total_cputime: 5 }),
      "x-business-use-case-usage": JSON.stringify({ "act_1": [{ call_count: 75, total_time: 20 }] }),
    });
    expect(leerUso(h)).toEqual({ appPorcentaje: 40, cuentaPorcentaje: 75 });
  });
  it("ignora cabeceras malformadas", () => {
    expect(leerUso(new Headers({ "x-app-usage": "{no json" }))).toEqual({});
  });
});

describe("cliente Graph", () => {
  it("devuelve el cuerpo y registra el uso", async () => {
    const alUso = vi.fn();
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => respuesta({ data: [1] }, 200, { "x-app-usage": JSON.stringify({ call_count: 10 }) }));
    const cliente = crearClienteGraph({ version: "v23.0", fetchImpl, alUso });
    const r = await cliente.get("act_1/insights", { fields: "spend" }, "TOKEN");
    expect(r).toEqual({ data: [1] });
    expect(alUso).toHaveBeenCalledWith({ appPorcentaje: 10 });
    const url = String((fetchImpl.mock.calls as unknown as [string][])[0][0]);
    expect(url).toContain("/v23.0/act_1/insights");
    expect(url).toContain("access_token=TOKEN");
  });

  it("un error 613 lanza MetaError reintentable", async () => {
    const cliente = crearClienteGraph({
      version: "v23.0",
      fetchImpl: async () => respuesta({ error: { code: 613, message: "limite" } }, 400),
    });
    const err = (await cliente.get("x", {}, "T").catch((e) => e)) as MetaError;
    expect(err).toBeInstanceOf(MetaError);
    expect(err.reintentable).toBe(true);
  });

  it("un error 190 lanza MetaError no reintentable", async () => {
    const cliente = crearClienteGraph({
      version: "v23.0",
      fetchImpl: async () => respuesta({ error: { code: 190, message: "token expirado" } }, 401),
    });
    const err = (await cliente.get("x", {}, "T").catch((e) => e)) as MetaError;
    expect(err.categoria).toBe("token_invalido");
    expect(err.reintentable).toBe(false);
  });

  it("un 500 sin código es transitorio", async () => {
    const cliente = crearClienteGraph({
      version: "v23.0",
      fetchImpl: async () => new Response("", { status: 500 }),
    });
    const err = (await cliente.get("x", {}, "T").catch((e) => e)) as MetaError;
    expect(err.categoria).toBe("transitorio");
  });
});

describe("procesarUno", () => {
  async function sqlNuevo(): Promise<Sql> {
    const db = new PGlite();
    const envolver = (q: { query: PGlite["query"] }): Sql => ({
      query: async (t, p) => ({ rows: (await q.query(t, p as unknown[] | undefined)).rows as Record<string, unknown>[] }),
      transaccion: async (fn) => fn(envolver(q)),
    });
    const sql = envolver(db as unknown as { query: PGlite["query"] });
    const raiz: Sql = { query: sql.query, transaccion: (fn) => db.transaction((tx) => fn(envolver(tx as unknown as { query: PGlite["query"] }))) };
    await migrarCola(raiz);
    return raiz;
  }

  it("marca hecho cuando el manejador termina", async () => {
    const sql = await sqlNuevo();
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const r = await procesarUno({ sql, manejadores: { insights: async () => {} } });
    expect(r).toBe("hecho");
    expect((await listarTrabajos(sql, 1, { estado: "hecho" })).length).toBe(1);
  });

  it("token inválido avisa al negocio y deja el trabajo fallido", async () => {
    const sql = await sqlNuevo();
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const alTokenInvalido = vi.fn(async () => {});
    const r = await procesarUno({
      sql,
      alTokenInvalido,
      manejadores: {
        insights: async () => {
          throw new MetaError({ categoria: "token_invalido", codigo: 190, mensaje: "x" }, 401);
        },
      },
    });
    expect(r).toBe("fallido");
    expect(alTokenInvalido).toHaveBeenCalledTimes(1);
  });

  it("límite de uso reprograma el trabajo", async () => {
    const sql = await sqlNuevo();
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "insights" });
    const r = await procesarUno({
      sql,
      manejadores: {
        insights: async () => {
          throw new MetaError({ categoria: "limite_uso", codigo: 613, mensaje: "x" }, 400);
        },
      },
    });
    expect(r).toBe("reintentara");
    expect((await listarTrabajos(sql, 1, { estado: "pendiente" })).length).toBe(1);
  });

  it("tipo sin manejador falla sin reintentar", async () => {
    const sql = await sqlNuevo();
    await encolar(sql, { tenantId: 1, cuenta: "act_1", tipo: "desconocido" });
    expect(await procesarUno({ sql, manejadores: {} })).toBe("sin_manejador");
  });
});
