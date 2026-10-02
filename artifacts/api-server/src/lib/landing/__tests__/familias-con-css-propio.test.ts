import { describe, expect, it } from "vitest";
import { FAMILIAS } from "../design-system";
import { renderizarLanding } from "../renderer-v3";

/**
 * 2026-09-28: 12 de 17 familias solo cambiaban colores (sin CSS propio) y se
 * veían como "la misma plantilla repintada". Cada familia tiene que traer su
 * composición: este test lo fija con el marcador /*f:<familia>*\/ que cada
 * skin incluye.
 */
const product = {
  name: "Faja Hot Trimmer",
  description: "Moldea tu cintura mientras entrenas.",
  imageUrl: "https://cdn.example.com/faja.webp",
  price: 59900,
  currency: "COP",
  whatsapp: "+57 300 123 4567",
};
const sections = [
  { id: "hero", type: "hero", title: "Cintura de avispa", subtitle: "Suda y moldea.", cta: "Pedir ahora" },
  { id: "offer", type: "offer", title: "Oferta", body: "Incluye lo del catálogo." },
];

describe("cada familia tiene CSS propio (no solo tokens)", () => {
  for (const f of FAMILIAS) {
    it(`${f} trae su skin en el HTML`, () => {
      const html = renderizarLanding({ nombre: "x", familia: f, producto: product, negocio: { modelo: "fisico" }, secciones: sections });
      expect(html).toContain(`/*f:${f}`);
    });
  }
});
