import { describe, it, expect } from "vitest";
import { migrarEstadoConexion, marcarTokenInvalido, marcarConexionOk, estadoConexion } from "../estado-conexion";
import { sqlEnMemoria } from "./sql-pglite";

describe("estado de conexión de Meta", () => {
  it("un negocio sin registro aparece como sin_registro", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarEstadoConexion(sql);
    expect((await estadoConexion(sql, 1)).estado).toBe("sin_registro");
  });

  it("un token inválido deja el negocio en requiere_reconexion con código y mensaje", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarEstadoConexion(sql);
    await marcarTokenInvalido(sql, 1, 190, "Session has expired");
    const e = await estadoConexion(sql, 1);
    expect(e.estado).toBe("requiere_reconexion");
    expect(e.codigo).toBe(190);
    expect(e.mensaje).toBe("Session has expired");
  });

  it("un trabajo exitoso devuelve el negocio a ok", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarEstadoConexion(sql);
    await marcarTokenInvalido(sql, 1, 190, "x");
    await marcarConexionOk(sql, 1);
    const e = await estadoConexion(sql, 1);
    expect(e.estado).toBe("ok");
    expect(e.codigo).toBeNull();
  });

  it("el estado de un negocio nunca afecta a otro", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarEstadoConexion(sql);
    await marcarTokenInvalido(sql, 2, 190, "x");
    expect((await estadoConexion(sql, 1)).estado).toBe("sin_registro");
    expect((await estadoConexion(sql, 2)).estado).toBe("requiere_reconexion");
  });

  it("rechaza un tenantId inválido", async () => {
    const { sql } = await sqlEnMemoria();
    await migrarEstadoConexion(sql);
    await expect(marcarTokenInvalido(sql, 0, 190, "x")).rejects.toThrow();
  });
});
