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

describe("hero y sellos sin detalles rotos", () => {
  const prod = {
    name: "Mochila Mascotas", description: "Bolsa de gran espacio hace que tu mascota sea más atractiva. Hecho de material premium resistente al agua con costuras reforzadas.",
    imageUrl: "https://cdn.example.com/m.webp", images: ["https://cdn.example.com/m.webp"],
    price: 109000, currency: "COP", whatsapp: "+57 300 123 4567",
  };
  const secs = [{ id: "hero", type: "hero", title: "¿Tu mascota se estresa?", subtitle: "", cta: "Pedir" }];
  it("el subtítulo del hero termina en frase completa, nunca a mitad de idea", () => {
    const html = renderizarLanding({
      nombre: "x", familia: "familiar", producto: prod,
      negocio: { modelo: "fisico" }, secciones: secs,
    });
    expect(html).not.toMatch(/Hecho…/);
    expect(html).toContain("más atractiva.");
  });
  it("los sellos salen sin emojis duplicados y con icono hasta el de tiempo", () => {
    const html = renderizarLanding({
      nombre: "x", familia: "familiar", producto: prod,
      negocio: { modelo: "fisico", confianza: ["🚚 Envío incluido", "⏱️ Llega en 3 a 5 días"] },
      secciones: secs,
    });
    expect(html).not.toContain("🚚");
    expect(html).not.toContain("⏱️");
    expect(html).toContain("Llega en 3 a 5 días");
    expect(html).toContain("<svg");
  });
});

describe("topbar sin desbordes", () => {
  const html = () =>
    renderizarLanding({
      nombre: "x", familia: "familiar",
      producto: { name: "M", description: "D", imageUrl: "https://cdn.example.com/m.webp", images: ["https://cdn.example.com/m.webp"], price: 1, currency: "COP" },
      negocio: { modelo: "fisico", confianza: ["Pago contra entrega", "Envío a todo el país"] },
      secciones: [{ id: "hero", type: "hero", title: "T", subtitle: "S", cta: "P" }],
    });
  it("los iconos del topbar tienen tamaño fijo (nada gigante)", () => {
    expect(html()).toContain(".topbar-in svg{width:15px;height:15px");
  });
  it("la base corta cualquier desborde horizontal", () => {
    expect(html()).toContain("overflow-x:clip");
  });
});
