import { describe, it, expect } from "vitest";
import { buildMcpToolRegistry, contratoQueEntra } from "../opencode-mcp-tools";

// 08-10-2026: el corte seco a 200 caracteres dejaba fuera formato, edades y
// ciudades de crear_anuncio. Atlas prometía "carrusel, 25-55, seis ciudades"
// y la acción salía sin esos datos.
describe("el contrato recortado conserva TODOS los nombres de campo", () => {
  it("crear_anuncio: Atlas ve formato, edades y ciudades", () => {
    const p: any = buildMcpToolRegistry("creá un anuncio en carrusel de 25 a 55 en Bogotá").find((t: any) => t.name === "propose_action");
    const d = String(p.description);
    const linea = d.slice(d.indexOf("crear_anuncio:"), d.indexOf("\n- ", d.indexOf("crear_anuncio:")));
    for (const campo of ['"formato"', '"edadMin"', '"edadMax"', '"ciudades"', '"objetivo"']) {
      expect(linea, campo).toContain(campo);
    }
    expect(linea).toContain("mensajes=WhatsApp");
  });

  it("fb_segmentacion_editar viaja con sus parámetros", () => {
    const p: any = buildMcpToolRegistry("corregí las edades y ciudades del anuncio").find((t: any) => t.name === "propose_action");
    expect(String(p.description)).toMatch(/fb_segmentacion_editar:[^\n]*\n\s*args: \{ "draftId"/);
  });

  it("quita explicaciones, no campos", () => {
    const c = contratoQueEntra('{ "a": string (una explicación larguísima ' + "x".repeat(250) + '), "b"?: number }');
    expect(c).toContain('"a"');
    expect(c.length).toBeLessThanOrEqual(203);
  });
});
