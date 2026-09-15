/**
 * "A la gente háblale en lenguaje natural que entienda, no con términos que
 * no comprendan" (dueño, 14-09-2026). El prompt lo pide; esto lo garantiza.
 */
import { describe, it, expect } from "vitest";
import { enLenguajeDeDueno, tieneTecnicismos } from "../lenguaje-de-dueno";

describe("traductor a lenguaje de dueño", () => {
  it("cambia las siglas y la jerga de anuncios por lo que significan", () => {
    const t = enLenguajeDeDueno("El CPA fue $8.000 y el ROAS 3x. Revisá el ad set y el copy del anuncio; el hook no engancha.");
    expect(t).toBe("El costo por venta fue $8.000 y el retorno por cada peso invertido 3x. Revisá el grupo de anuncios y el texto del anuncio; la frase que engancha no engancha.");
    expect(tieneTecnicismos(t)).toBe(false);
  });

  it("no toca enlaces, código ni nombres de herramientas", () => {
    const t = "Mirá https://ventasproia.com/cpa-report y corré `fb_ad_library` o fb_campaign_metrics.";
    expect(enLenguajeDeDueno(t)).toBe(t);
  });

  it("deja las palabras del panel que el cliente ya conoce", () => {
    const t = "Tenés 5 leads nuevos en Landing Studio.";
    expect(enLenguajeDeDueno(t)).toBe(t);
  });

  it("un texto normal queda igual", () => {
    const t = "Te recomiendo empezar con el corrector de postura. ¿Arrancamos?";
    expect(enLenguajeDeDueno(t)).toBe(t);
  });
});
