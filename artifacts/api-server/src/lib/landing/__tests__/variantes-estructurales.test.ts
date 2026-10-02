import { describe, expect, it } from "vitest";
import { renderizarLanding } from "../renderer-v3";

/**
 * 2026-09-28: con el mismo HTML para las 17 familias, los skins solo podían
 * repintar. Ahora cada familia tiene ESQUELETO propio (mismo molde: mismo
 * orden de secciones y mismos hechos del producto).
 */
const product = {
  name: "Faja Hot Trimmer",
  description: "Moldea tu cintura mientras entrenas.",
  imageUrl: "https://cdn.example.com/faja.webp",
  images: ["https://cdn.example.com/faja.webp", "https://cdn.example.com/faja2.webp"],
  price: 59900,
  currency: "COP",
  whatsapp: "+57 300 123 4567",
};
const sections = [
  { id: "hero", type: "hero", title: "Cintura de avispa", subtitle: "Suda y moldea.", cta: "Pedir ahora" },
  { id: "benefits", type: "benefits", title: "Beneficios", body: "Moldea\nSuda más\nAjustable" },
  { id: "offer", type: "offer", title: "Oferta", body: "Incluye lo del catálogo.", cta: "Pedir ahora" },
];
const render = (familia: string, layout?: string) =>
  renderizarLanding({
    nombre: "x", familia, producto: product, negocio: { modelo: "fisico", confianza: ["Pago contraentrega", "Garantía"] },
    secciones: layout ? sections.map((s) => ({ ...s, layout })) : sections,
  });

describe("cada familia tiene esqueleto propio", () => {
  it("buybox en ecommerce/dropshipping/respuesta-directa? no: offer-first", () => {
    expect(render("ecommerce")).toContain('hero hero--buybox"');
    expect(render("dropshipping")).toContain('hero hero--buybox"');
    expect(render("respuesta-directa")).toContain('hero hero--offerfirst"');
    expect(render("belleza")).toContain('hero hero--bleed"');
    expect(render("editorial")).toContain('hero hero--edito"');
    expect(render("premium")).toContain('hero hero--stack"');
    expect(render("minimal")).not.toContain('hero hero--buybox"');
  });
  it("buybox trae precio grande + CTA ancho + sellos (no solo texto)", () => {
    const html = render("ecommerce");
    expect(html).toContain('buybox-price"');
    expect(html).toContain("Pago contraentrega");
  });
  it("oferta minimal/editorial sin foto lateral repetida", () => {
    expect(render("minimal")).toContain('shell offer--minimal"');
    expect(render("educacion")).toContain('offer offer--split"');
  });
  it("beneficios numerados en fitness, checklist en minimal", () => {
    expect(render("fitness")).toContain('bento--numbered"');
    expect(render("minimal")).toContain('bento--checklist"');
    expect(render("premium")).toContain('class="bento"');
  });
  it("section.layout manda sobre la familia", () => {
    expect(render("minimal", "buybox")).toContain('hero hero--buybox"');
    expect(render("fitness", "cards")).toContain('class="bento"');
  });
  it("sin foto no se rompe el bleed (cae a split)", () => {
    const html = renderizarLanding({
      nombre: "x", familia: "belleza",
      producto: { ...product, imageUrl: null, images: [] },
      negocio: { modelo: "fisico" }, secciones: sections,
    });
    expect(html).not.toContain('hero hero--bleed"');
    expect(html).toContain("hero");
  });
});
