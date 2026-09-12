import { describe, it, expect } from "vitest";
import { renderizarLanding } from "../renderer";

/**
 * Medido en la landing 4 (faja), 12-09-2026: arrancaba en el H1 sin marca ni
 * botón, imprimía "HERO" y "BENEFITS" (nombres internos) como rótulos, la
 * sección "how it works" salía vacía, los beneficios eran un párrafo, y las
 * fotos eran renders de IA de personas, con la foto real del producto sin
 * usar.
 */
const producto = { name: "Faja Miss Belt", price: 40000, currency: "COP", imageUrl: "https://ventasproia.com/images/products/175.jpg" };
const negocio = { nombre: "TecnoVariedades", whatsapp: "573042748687", modelo: "fisico", confianza: ["🚚 Envío incluido en el precio", "💵 Pagás contraentrega, cuando lo recibís", "⏱️ Llega en 3 a 5 días hábiles"] };

describe("la página tiene marco: encabezado, franja de confianza, pie y CTA fijo", () => {
  const html = renderizarLanding({
    nombre: "Faja", familia: "ecommerce", producto, negocio,
    secciones: [
      { id: "hero-1", type: "hero", title: "Nueva figura", subtitle: "Aplana", cta: "¡Quiero la mía!" },
      { id: "benefits-1", type: "benefits", title: "Beneficios", body: "Ajuste perfecto al cuerpo, no se nota en la ropa. Material de alta calidad y resistencia. Absorbe el sudor. Perfecta para casa o gimnasio." },
      { id: "gallery-1", type: "gallery", title: "Así es", images: ["https://cdn/a.jpg", "https://cdn/b.jpg", "https://cdn/c.jpg"] },
      { id: "how-it-works-1", type: "how-it-works", title: "", body: "" },
      { id: "faq-1", type: "faq", title: "Preguntas", body: "¿Cuánto tarda? | Entre 3 y 5 días hábiles\n¿Pago antes? | No, pagás al recibir" },
    ],
  });

  it("encabezado con la marca y el CTA, pie con WhatsApp, CTA fijo", () => {
    expect(html).toMatch(/<header class="top">.*TecnoVariedades.*¡Quiero la mía!/s);
    expect(html).toMatch(/<footer class="pie">.*wa\.me\/573042748687/s);
    expect(html).toMatch(/<div class="fijo">/);
  });

  it("franja de confianza debajo del hero, con las condiciones del negocio", () => {
    expect(html).toMatch(/sec--hero.*sec--confianza.*Envío incluido.*contraentrega.*3 a 5 días/s);
  });

  it("nunca imprime el nombre interno de la sección", () => {
    expect(html).not.toMatch(/class="eyebrow">(hero|benefits|how it works|faq|cta)</i);
    expect(html).toMatch(/class="eyebrow">Beneficios</);
  });

  it("un párrafo de beneficios se vuelve lista", () => {
    const li = (html.match(/sec--benefits[\s\S]*?<\/section>/)?.[0] || "").match(/<li/g)?.length ?? 0;
    expect(li).toBeGreaterThanOrEqual(3);
  });

  it("la galería muestra las fotos reales", () => {
    expect((html.match(/class="galeria"[\s\S]*?<\/ul>/)?.[0] || "").match(/<img/g)?.length).toBe(3);
  });

  it("una sección sin contenido no se dibuja", () => {
    expect(html).not.toMatch(/sec--how-it-works/);
  });

  it("la FAQ trae la respuesta, no solo la pregunta", () => {
    expect(html).toMatch(/<summary>¿Cuánto tarda\?<\/summary><p>Entre 3 y 5 días hábiles<\/p>/);
  });
});
