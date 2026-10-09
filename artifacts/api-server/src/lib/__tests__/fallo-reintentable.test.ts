import { describe, it, expect } from "vitest";
import { clasificarFallo } from "../fallo-reintentable";

// Errores copiados del registro de turnos de producción (08-10-2026,
// GET /api/code-agent/atlas-diagnostico). Los tres primeros mataban el turno
// sin dejar respuesta: el dueño lo veía como que se caía la conexión.
describe("un turno que falló por cupo NO se rinde", () => {
  it("Rate limit exceeded → se reintenta, con espera larga", () => {
    const f = clasificarFallo("Rate limit exceeded");
    expect(f.reintentable).toBe(true);
    expect(f.esperaMs).toBeGreaterThanOrEqual(30_000);
  });

  it("free tier de OpenCode → se reintenta", () => {
    expect(clasificarFallo("OpenCode's free tier can only be used from within OpenCode").reintentable).toBe(true);
  });

  it("proveedor caído (502/503) → se reintenta", () => {
    expect(clasificarFallo("HTTP 503 Service Unavailable").reintentable).toBe(true);
  });

  it("se quedó sin tiempo → se reintenta como siempre, sin espera larga", () => {
    const f = clasificarFallo("The operation was aborted due to timeout");
    expect(f.reintentable).toBe(true);
    expect(f.esperaMs).toBeLessThan(30_000);
  });

  it("un error de verdad (clave inválida) NO entra en bucle", () => {
    expect(clasificarFallo("Invalid API key provided").reintentable).toBe(false);
  });
});
