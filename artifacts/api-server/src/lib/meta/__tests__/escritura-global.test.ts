import { describe, it, expect } from "vitest";
import { cuentaDeUrlMeta, instalarExclusionDeEscrituras } from "../escritura-global";
import type { PoolBloqueo } from "../bloqueo-cuenta";

/** Pool simulado con bloqueos compartidos entre conexiones (ver bloqueo-cuenta.test.ts). */
function poolSimulado(): PoolBloqueo & { tomados: Set<string> } {
  const tomados = new Set<string>();
  let siguiente = 1;
  return {
    tomados,
    async connect() {
      const id = siguiente++;
      const posesion = new Map<string, number>();
      return {
        async query(texto: string, params: unknown[] = []) {
          const clave = `${params[0]}:${params[1]}`;
          if (texto.includes("pg_try_advisory_lock")) {
            if (tomados.has(clave)) return { rows: [{ ok: false }] };
            tomados.add(clave);
            posesion.set(clave, id);
            return { rows: [{ ok: true }] };
          }
          if (texto.includes("pg_advisory_unlock")) {
            if (posesion.get(clave) === id) {
              tomados.delete(clave);
              posesion.delete(clave);
            }
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}

describe("cuentaDeUrlMeta", () => {
  it("extrae la cuenta de una URL de Graph", () => {
    expect(cuentaDeUrlMeta("https://graph.facebook.com/v23.0/act_123/campaigns?x=1")).toBe("act_123");
    expect(cuentaDeUrlMeta("https://graph.facebook.com/v23.0/act_9")).toBe("act_9");
  });
  it("no toma como cuenta un objeto suelto ni otro host", () => {
    expect(cuentaDeUrlMeta("https://graph.facebook.com/v23.0/120210000/")).toBeNull();
    expect(cuentaDeUrlMeta("https://api.dropi.co/v1/act_1")).toBeNull();
    expect(cuentaDeUrlMeta("no es una url")).toBeNull();
  });
});

describe("instalarExclusionDeEscrituras", () => {
  it("serializa dos escrituras a la misma cuenta", async () => {
    const pool = poolSimulado();
    const orden: string[] = [];
    let liberar!: () => void;
    const original = (async (entrada: string | URL) => {
      const url = String(entrada);
      orden.push(`inicio ${url}`);
      if (url.includes("primera")) await new Promise<void>((r) => (liberar = r));
      orden.push(`fin ${url}`);
      return new Response("{}");
    }) as typeof fetch;
    const desinstalar = instalarExclusionDeEscrituras(pool, original);
    try {
      const a = fetch("https://graph.facebook.com/v23.0/act_1/campaigns?primera", { method: "POST" });
      while (!liberar) await new Promise((r) => setTimeout(r, 0));
      const b = fetch("https://graph.facebook.com/v23.0/act_1/adsets", { method: "POST" });
      await new Promise((r) => setTimeout(r, 20));
      expect(orden).toEqual(["inicio https://graph.facebook.com/v23.0/act_1/campaigns?primera"]);
      liberar();
      await a;
      await b;
      expect(orden[2]).toBe("inicio https://graph.facebook.com/v23.0/act_1/adsets");
    } finally {
      desinstalar();
    }
  });

  it("no bloquea las lecturas", async () => {
    const pool = poolSimulado();
    const original = (async () => new Response("{}")) as typeof fetch;
    const desinstalar = instalarExclusionDeEscrituras(pool, original);
    try {
      await fetch("https://graph.facebook.com/v23.0/act_1/insights");
      expect(pool.tomados.size).toBe(0);
    } finally {
      desinstalar();
    }
  });

  it("las URLs que no son de Meta pasan sin cambios", async () => {
    const pool = poolSimulado();
    let llamadas = 0;
    const original = (async () => {
      llamadas++;
      return new Response("{}");
    }) as typeof fetch;
    const desinstalar = instalarExclusionDeEscrituras(pool, original);
    try {
      await fetch("https://api.ejemplo.com/x", { method: "POST" });
      expect(llamadas).toBe(1);
      expect(pool.tomados.size).toBe(0);
    } finally {
      desinstalar();
    }
  });

  it("desinstalar restaura el fetch original", () => {
    const antes = globalThis.fetch;
    const desinstalar = instalarExclusionDeEscrituras(poolSimulado(), (async () => new Response("")) as typeof fetch);
    expect(globalThis.fetch).not.toBe(antes);
    desinstalar();
    expect(globalThis.fetch).toBe(antes);
  });
});
