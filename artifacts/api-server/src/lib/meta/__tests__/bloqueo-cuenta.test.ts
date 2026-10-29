import { describe, it, expect } from "vitest";
import { conExclusionDeCuenta, CuentaOcupadaError, clavesDeBloqueo, type PoolBloqueo } from "../bloqueo-cuenta";

/**
 * Pool simulado con la semántica de pg_try_advisory_lock: los bloqueos viven
 * en una tabla compartida entre conexiones y pertenecen a la conexión que los
 * tomó. Valida la lógica de exclusión; el comportamiento real de Postgres
 * entre conexiones debe confirmarse en una base de prueba.
 */
function poolSimulado(): PoolBloqueo & { tomados: Map<string, number> } {
  const tomados = new Map<string, number>();
  let siguienteId = 1;
  return {
    tomados,
    async connect() {
      const id = siguienteId++;
      return {
        async query(texto: string, params: unknown[] = []) {
          const clave = `${params[0]}:${params[1]}`;
          if (texto.includes("pg_try_advisory_lock")) {
            const dueno = tomados.get(clave);
            if (dueno === undefined || dueno === id) {
              tomados.set(clave, id);
              return { rows: [{ ok: true }] };
            }
            return { rows: [{ ok: false }] };
          }
          if (texto.includes("pg_advisory_unlock")) {
            if (tomados.get(clave) === id) tomados.delete(clave);
            return { rows: [] };
          }
          return { rows: [] };
        },
        release() {},
      };
    },
  };
}


/** Toma el bloqueo con una operación que no termina hasta llamar a liberar(). */
async function retener(pool: ReturnType<typeof poolSimulado>, tenant: number, cuenta: string) {
  let liberar: (() => void) | undefined;
  const promesa = conExclusionDeCuenta(pool, tenant, cuenta, () => new Promise<void>((r) => (liberar = r)));
  while (!liberar) await new Promise((r) => setTimeout(r, 0));
  return { promesa, liberar: () => liberar!() };
}

const sinEspera = { dormir: async () => {}, intervaloMs: 1, esperaMaxMs: 5 };

describe("exclusión por cuenta", () => {
  it("ejecuta la operación y libera el bloqueo", async () => {
    const pool = poolSimulado();
    const r = await conExclusionDeCuenta(pool, 1, "act_1", async () => 42);
    expect(r).toBe(42);
    expect(pool.tomados.size).toBe(0);
  });

  it("libera el bloqueo aunque la operación falle", async () => {
    const pool = poolSimulado();
    await expect(
      conExclusionDeCuenta(pool, 1, "act_1", async () => {
        throw new Error("Meta rechazó");
      }),
    ).rejects.toThrow("Meta rechazó");
    expect(pool.tomados.size).toBe(0);
  });

  it("una cuenta ocupada hace esperar y luego agota el tiempo con mensaje claro", async () => {
    const pool = poolSimulado();
    const { promesa: retenida, liberar } = await retener(pool, 1, "act_1");
    const segunda = conExclusionDeCuenta(pool, 1, "act_1", async () => "no debería correr", sinEspera);
    await expect(segunda).rejects.toBeInstanceOf(CuentaOcupadaError);
    liberar();
    await retenida;
  });

  it("cuando se libera, la siguiente operación sí entra", async () => {
    const pool = poolSimulado();
    const { promesa: primera, liberar } = await retener(pool, 1, "act_1");
    liberar();
    await primera;
    const r = await conExclusionDeCuenta(pool, 1, "act_1", async () => "ok", sinEspera);
    expect(r).toBe("ok");
  });

  it("cuentas distintas del mismo negocio no se bloquean entre sí", async () => {
    const pool = poolSimulado();
    const { promesa: primera, liberar } = await retener(pool, 1, "act_1");
    const otra = await conExclusionDeCuenta(pool, 1, "act_2", async () => "paralelo", sinEspera);
    expect(otra).toBe("paralelo");
    liberar();
    await primera;
  });

  it("el mismo id de cuenta en negocios distintos no se bloquea", async () => {
    const pool = poolSimulado();
    const { promesa: primera, liberar } = await retener(pool, 1, "act_1");
    const otro = await conExclusionDeCuenta(pool, 2, "act_1", async () => "otro negocio", sinEspera);
    expect(otro).toBe("otro negocio");
    liberar();
    await primera;
  });

  it("las claves son estables y de 32 bits", () => {
    const a = clavesDeBloqueo(7, "act_9");
    expect(clavesDeBloqueo(7, "act_9")).toEqual(a);
    for (const k of a) {
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(-2147483648);
      expect(k).toBeLessThanOrEqual(2147483647);
    }
  });
});
