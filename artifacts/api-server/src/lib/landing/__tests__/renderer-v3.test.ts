import { describe, expect, it } from "vitest";
import { renderizarLanding, esc, urlSegura } from "../renderer-v3";

const product = {
  name: "Audífonos Bluetooth Pro",
  description: "Escuchá música y atendé llamadas desde cualquier lugar.",
  imageUrl: "https://cdn.example.com/audifonos.webp",
  price: 89900,
  currency: "COP",
  whatsapp: "+57 300 123 4567",
  opciones: [
    { nombre: "Color", valores: ["Negro", "Blanco"], obligatoria: true },
    { nombre: "Versión", valores: ["Pro", "Max"], obligatoria: false },
  ],
};

const sections = [
  { id: "hero", type: "hero", title: "Que tus llamadas no se corten", subtitle: "Conexión y autonomía para el día a día.", cta: "Pedir ahora" },
  { id: "benefits", type: "benefits", title: "Lo que cambia", body: "Conexión estable\nLarga autonomía\nControl desde los audífonos" },
  { id: "gallery", type: "gallery", title: "Míralos de cerca", images: ["https://cdn.example.com/1.webp", "https://cdn.example.com/2.webp"] },
  { id: "faq", type: "faq", title: "Antes de comprar", body: "¿Cómo se entrega? | Por mensajería.\n¿Puedo elegir color? | Sí." },
  { id: "offer", type: "offer", title: "Listos para usar", body: "Incluye lo descrito en el catálogo." },
];

describe("renderer-v3", () => {
  it("renderiza imagen real y estructura comercial", () => {
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "ecommerce",
      producto: product,
      negocio: { nombre: "Tienda Demo", modelo: "fisico", whatsapp: product.whatsapp },
      secciones: sections,
      cierre: { tipo: "contraentrega", accion: "/api/landing-publica/demo/pedido" },
    });
    expect(html).toContain(product.imageUrl);
    expect(html).toContain("class=\"bento-card\"");
    expect(html).toContain("class=\"checkout\"");
    expect(html).toContain('action="/api/landing-publica/demo/pedido"');
  });

  it("convierte las opciones reales del producto en campos de checkout", () => {
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "ecommerce",
      producto: product,
      negocio: { modelo: "dropshipping" },
      secciones: sections,
      cierre: { tipo: "contraentrega", accion: "/pedido" },
    });
    expect(html).toContain("Color *");
    expect(html).toContain('value="Negro"');
    expect(html).toContain('name="opcion_Color"');
    expect(html).toContain('name="cantidad"');
    expect(html).toContain('name="documento"');
  });

  it("los CTA van al checkout cuando existe un cierre", () => {
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "premium",
      producto: product,
      negocio: { modelo: "fisico" },
      secciones: sections,
      cierre: { tipo: "contraentrega", accion: "/pedido" },
    });
    expect(html).toContain('href="#pedido"');
  });

  it("digital conserva el cierre de pago y no muestra formulario de dirección", () => {
    const html = renderizarLanding({
      nombre: "Curso",
      familia: "editorial",
      producto: { ...product, name: "Curso de Piano", imageUrl: null },
      negocio: { modelo: "digital", whatsapp: product.whatsapp },
      secciones: sections,
      cierre: { tipo: "pago", mercadopago: "https://mercadopago.example/abc", paypal: "https://paypal.example/abc" },
    });
    expect(html).toContain("Pagar con MercadoPago");
    expect(html).toContain("Pagar con PayPal");
    expect(html).not.toContain('name="direccion"');
  });

  it("varía visualmente entre familias", () => {
    const a = renderizarLanding({ nombre: "x", familia: "premium", producto: product, negocio: { modelo: "fisico" }, secciones: sections });
    const b = renderizarLanding({ nombre: "x", familia: "respuesta-directa", producto: product, negocio: { modelo: "fisico" }, secciones: sections });
    expect(a).not.toBe(b);
    expect(a).toContain("font-family:");
    expect(b).toContain("font-family:");
  });

  it("mantiene protección básica contra XSS y URLs peligrosas", () => {
    expect(esc('<img src=x onerror=alert(1)>')).toBe("&lt;img src=x onerror=alert(1)&gt;");
    expect(urlSegura("javascript:alert(1)")).toBe("");
    expect(urlSegura("https://example.com/a")).toBe("https://example.com/a");
  });
});

describe("renderer-v3 — lo que hacía que las landings salieran 'feas'", () => {
  const base = { nombre: "Demo", familia: "premium", producto: product, negocio: { nombre: "Tienda", modelo: "fisico", whatsapp: "+57 300 123 4567" } };

  it("el <style> queda fuera del atributo (faltaba la comilla de color-scheme y se tragaba TODO el CSS)", () => {
    const html = renderizarLanding({ ...base, secciones: sections });
    expect(html).toMatch(/<meta name="color-scheme" content="(light|dark)"><style>/);
    // Y el CSS realmente aplica: el body toma el fondo de la familia.
    expect(html).toContain("body{margin:0;background:var(--bg)");
  });

  it("los rótulos van en español, nunca el tipo interno", () => {
    const html = renderizarLanding({ ...base, secciones: [
      { id: "b", type: "benefits", title: "Para qué sirve", body: "Ligero\nResistente" },
      { id: "l", type: "logistics", title: "Envío y pago", body: "Contraentrega." },
      { id: "c", type: "cta", title: "Da el paso", cta: "Comprar" },
    ] });
    expect(html).not.toMatch(/class="eyebrow">(benefits|logistics|cta|offer)</);
    expect(html).toContain('class="eyebrow">Beneficios<');
    expect(html).toContain('class="eyebrow">Envío y pago<');
  });

  it("FAQ vacío y secciones sin contenido no se dibujan", () => {
    const html = renderizarLanding({ ...base, secciones: [
      { id: "f", type: "faq", title: "Preguntas", body: "" },
      { id: "x", type: "authority", title: null, body: null },
    ] });
    expect(html).not.toContain("Preguntas frecuentes");
    expect(html).not.toContain("Por qué confiar");
  });

  it("los bloques laterales rotan por la galería en vez de repetir la foto del hero", () => {
    const html = renderizarLanding({ ...base, producto: { ...product, images: [product.imageUrl, "https://cdn.example.com/2.webp", "https://cdn.example.com/3.webp"] }, secciones: [
      { id: "o", type: "offer", title: "Oferta", body: "x" },
      { id: "c", type: "cta", title: "Cierre", body: "y" },
    ] });
    expect(html).toContain("https://cdn.example.com/2.webp");
    expect(html).toContain("https://cdn.example.com/3.webp");
  });
});
