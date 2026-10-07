/**
 * Landing Forge recibía solo nombre/precio/fotos y el LLM completaba marca,
 * envío y garantía de memoria: "Tu Marca", la marca de la tienda de donde
 * salieron las fotos, "garantía de 30 días, te devolvemos el dinero" que el
 * dueño nunca dio. Ahora VentasPro manda los HECHOS del negocio, de la misma
 * fuente que usa el vendedor de WhatsApp (getBusinessContext + condiciones).
 */
import { describe, it, expect } from "vitest";
import { hechosParaLanding } from "../landingforge-client";

describe("hechosParaLanding", () => {
  it("la garantía del PROVEEDOR (Dropi) viaja con sus días reales", async () => {
    const h = await hechosParaLanding(null, {
      kind: "physical",
      metadata: { garantia: "Garantía de 3 meses por defectos de fábrica" },
    });
    expect(h.garantia?.dias).toBe(90);
    expect(h.garantia?.descripcion).toContain("defectos de fábrica");
  });

  it("sin garantía configurada NO se manda garantía (Forge la retira)", async () => {
    const h = await hechosParaLanding(null, { kind: "physical", metadata: {} });
    expect(h.garantia ?? null).toBeNull();
  });

  it("físico: envío, pago y cobertura salen de las condiciones del negocio", async () => {
    const h = await hechosParaLanding(null, { kind: "physical" });
    // Respaldo del dueño: flete incluido, contraentrega, todo el país.
    expect(h.envioGratis).toBe(true);
    expect(h.pago).toBe("pago contra entrega");
    expect(h.cobertura).toContain("Colombia");
    expect(h.entrega?.plazo).toBeTruthy();
    expect(h.trato).toBe("tu");
  });

  it("digital: no promete envío ni contraentrega", async () => {
    const h = await hechosParaLanding(null, { kind: "digital" });
    expect(h.envioGratis ?? null).toBeNull();
    expect(h.pago).toBeUndefined();
  });
});
