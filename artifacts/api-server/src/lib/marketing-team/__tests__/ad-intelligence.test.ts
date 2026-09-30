import { describe, expect, it } from "vitest";
import { clasificarAnuncio, extraerPatrones } from "../ad-intelligence";

const FIXTURES = [
  "Identificador de la biblioteca 123 | ¿Sufres de dolor de espalda por estar sentado? | Corrector postural con 30% de descuento | Solo hoy",
  "Identificador de la biblioteca 124 | Mira cómo cambió mi postura en 30 días | Antes y después reales | Video",
  "Identificador de la biblioteca 125 | Consigue una postura perfecta y ahorra tiempo | Beneficios desde el primer día",
  "Identificador de la biblioteca 126 | 5 errores comunes al sentarte que arruinan tu espalda | Guía gratis",
];

describe("ad-intelligence (sin red)", () => {
  it("clasifica por reglas: oferta, demostración, beneficio, educativo", () => {
    const cats = FIXTURES.map((f) => clasificarAnuncio(f).categoria);
    expect(cats).toContain("OFERTA");
    expect(cats).toContain("DEMOSTRACION");
    expect(cats).toContain("BENEFICIO");
    expect(cats).toContain("EDUCATIVO");
  });
  it("extrae hook de la primera línea útil", () => {
    const c = clasificarAnuncio(FIXTURES[0]!);
    expect(c.hook.length).toBeGreaterThan(10);
    expect(c.hook).not.toMatch(/identificador de la biblioteca/i);
  });
  it("detecta oferta con porcentaje", () => {
    const c = clasificarAnuncio(FIXTURES[0]!);
    expect(c.oferta.some((o) => /30\s*%/.test(o))).toBe(true);
  });
  it("patrones: frecuencias suman y huecos existen", () => {
    const intel = extraerPatrones(FIXTURES.map((f) => clasificarAnuncio(f)), "Corrector X");
    expect(intel.total).toBe(4);
    const suma = intel.patrones.reduce((a, p) => a + p.frecuencia, 0);
    expect(suma).toBeGreaterThan(0.99);
    expect(intel.huecos.length).toBeGreaterThan(0);
    expect(intel.angulosSugeridos.length).toBeGreaterThan(0);
    expect(intel.angulosSugeridos.join(" ")).toMatch(/Corrector X/);
    expect(intel.advertencia).toMatch(/hipótesis/i);
  });
  it("sin anuncios no rompe", () => {
    const intel = extraerPatrones([], "X");
    expect(intel.total).toBe(0);
    expect(intel.patrones).toEqual([]);
  });
});
