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
