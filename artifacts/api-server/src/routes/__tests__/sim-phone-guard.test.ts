import { describe, expect, it } from "vitest";
import { normalizarTelefonoSimulacion } from "../whatsapp";

describe("normalizarTelefonoSimulacion (candado anti-pedido-real)", () => {
  it("fuerza sim- cuando falta", () => {
    expect(normalizarTelefonoSimulacion("3001234567")).toEqual({ telefono: "sim-3001234567", forzado: true });
    expect(normalizarTelefonoSimulacion("")).toEqual({ telefono: "sim-test-ia", forzado: true });
  });
  it("respeta sim- existente", () => {
    expect(normalizarTelefonoSimulacion("sim-cliente1")).toEqual({ telefono: "sim-cliente1", forzado: false });
    expect(normalizarTelefonoSimulacion("SIM-abc")).toEqual({ telefono: "SIM-abc", forzado: false });
  });
  it("limpia caracteres peligrosos", () => {
    const r = normalizarTelefonoSimulacion("300 123+4567");
    expect(r.telefono).toBe("sim-3001234567");
    expect(r.forzado).toBe(true);
  });
});
