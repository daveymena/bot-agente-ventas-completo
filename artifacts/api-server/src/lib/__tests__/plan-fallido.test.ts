import { describe, it, expect } from "vitest";
import { queHacerConLaFalla } from "../plan-fallido";

// 08-10: "que no venga a decirme que no quedó sino que lo esté solucionando".
describe("plan aprobado que falla", () => {
  it("falla que Atlas puede arreglar → sigue solo a corregirla", () => {
    for (const e of [
      "Meta no reconoce estas ciudades: Bogota DC",
      "Meta no aceptó el cambio: Invalid parameter (age_min)",
      "⚠️ Leído en Meta, NO quedó como se pidió: salió como UNA imagen",
    ]) {
      const r = queHacerConLaFalla([e]);
      expect(r.seResuelveSolo, e).toBe(true);
      expect(r.linea).toMatch(/No lo dejo así/);
    }
  });
  it("falla que depende del dueño → le dice qué hacer, no gira en vacío", () => {
    for (const e of [
      "Facebook no está conectado.",
      "Error validating access token: Session has expired",
      "La cuenta publicitaria no tiene un método de pago válido",
      "(#200) Requires ads_management permission",
    ]) {
      const r = queHacerConLaFalla([e]);
      expect(r.seResuelveSolo, e).toBe(false);
    }
  });
});
