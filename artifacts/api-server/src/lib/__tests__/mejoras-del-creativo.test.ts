import { describe, it, expect } from "vitest";
import { mejorasDelCreativo } from "../facebook";
import { esCopyDeLaPlantillaVieja } from "../ad-strategist";

describe("borradores con el texto de la plantilla vieja", () => {
  it("se reconocen por las frases que solo escribía esa plantilla", () => {
    expect(esCopyDeLaPlantillaVieja("Corrector…\n\nSi no tomas acción hoy, seguirás perdiendo tiempo y dinero con métodos que no funcionan.\n👇 Haz clic abajo para descargar todo el contenido ahora.")).toBe(true);
    expect(esCopyDeLaPlantillaVieja("Corrector de postura en X.\n\n💵 Pagas al recibir\n👉 Escríbenos por WhatsApp")).toBe(false);
  });
});

/**
 * 23-09-2026, subiendo el anuncio del corrector: Meta rechazó el creativo con
 * error 100 / subcódigo 3858504 ("mejoras estándar obsoletas, define funciones
 * individuales"). La rama de "mejoras completas" metía los paquetes
 * `standard_enhancements` y `advantage_plus_creative`.
 */
describe("mejoras de Advantage+ del creativo", () => {
  it("con 'mejoras completas' NO manda paquetes obsoletos", () => {
    const spec = mejorasDelCreativo({ hayFotoReal: true, mejorasCompletas: true });
    expect(spec).not.toHaveProperty("standard_enhancements");
    expect(spec).not.toHaveProperty("advantage_plus_creative");
    // …pero sí las mejoras individuales equivalentes.
    expect(spec).toHaveProperty("image_templates");
    expect(spec).toHaveProperty("text_optimizations");
  });

  it("sin foto real no se tocan las mejoras que alteran la imagen", () => {
    const spec = mejorasDelCreativo({ hayFotoReal: false, mejorasCompletas: false });
    expect(Object.keys(spec).sort()).toEqual(["enhance_cta", "text_optimizations"]);
  });
});
