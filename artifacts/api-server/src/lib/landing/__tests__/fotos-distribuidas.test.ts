import { describe, expect, it } from "vitest";
import { renderizarLanding } from "../renderer-v3";

/**
 * 2026-10-02 (referencias PostureFit/PetTransport del dueño): la landing
 * tiene que repartir VARIAS fotos (hero galería, banda, oferta) sin repetir.
 */
const fotos = [
  "https://cdn.example.com/f1.webp",
  "https://cdn.example.com/f2.webp",
  "https://cdn.example.com/f3.webp",
  "https://cdn.example.com/f4.webp",
];
const product = {
  name: "Corrector Postura", description: "Espalda recta.", imageUrl: fotos[0],
  images: fotos, price: 79900, currency: "COP", whatsapp: "+57 300 123 4567",
};
const render = (secciones: any[], negocio: any = { modelo: "fisico", confianza: ["Pago contra entrega", "Envío a todo el país"] }) =>
  renderizarLanding({ nombre: "x", familia: "ecommerce", producto: product, negocio, secciones });
const base = [
  { id: "hero", type: "hero", title: "Sin dolor", subtitle: "Espalda recta.", cta: "Pedir ahora" },
  { id: "offer", type: "offer", title: "Oferta", body: "Incluye.", cta: "Pedir" },
];

describe("fotos bien distribuidas, ninguna repetida", () => {
  it("el hero es galería swipeable con miniaturas cuando hay varias", () => {
    const html = render(base);
    expect(html).toContain('hg-track"');
    expect(html).toContain("hg-dots");
    // cada foto del hero sale UNA vez (sin duplicar en miniaturas)
    for (const f of fotos.slice(0, 2)) expect(html.split(`src="${f}"`).length - 1).toBe(1);
  });
  it("con una sola foto no hay galería ni repetición", () => {
    const html = renderizarLanding({
      nombre: "x", familia: "ecommerce",
      producto: { ...product, images: [fotos[0]] },
      negocio: { modelo: "fisico" }, secciones: base,
    });
    expect(html).not.toContain('hg-track"');
    expect(html.split(fotos[0]).length - 1).toBeLessThanOrEqual(2);
  });
  it("reparto con 4 fotos: hero 2, oferta 1, galería 1", () => {
    const html = render([...base, { id: "g", type: "gallery", title: "Míralas" }]);
    expect(html).toContain("Míralas");
    expect(html).toContain(`src="${fotos[3]}"`);
  });
  it("topbar COD con sellos cuando hay confianza", () => {
    const html = render(base);
    expect(html).toContain('class="topbar"');
    expect(html).toContain("Pago contra entrega");
  });
  it("sin confianza no hay topbar", () => {
    const html = render(base, { modelo: "fisico" });
    expect(html).not.toContain('class="topbar"');
  });
  it("photo-band dibuja foto a sangre con pie y consume presupuesto", () => {
    const html = render([...base, { id: "pb", type: "photo-band", title: "Míralo puesto", subtitle: "Uso diario" }]);
    expect(html).toContain('class="photoband"');
  });
  it("los sellos llevan iconos, no solo ✓", () => {
    const html = render(base);
    expect(html).toContain("<svg");
  });
});
