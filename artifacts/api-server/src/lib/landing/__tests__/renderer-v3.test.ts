import { describe, expect, it } from "vitest";
import { renderizarLanding, esc, urlSegura, tituloLegible } from "../renderer-v3";

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

  it("carga la tipografía de cada familia y ofrece movimiento accesible al desplazarse", () => {
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "creator",
      producto: product,
      negocio: { nombre: "Tienda Demo", modelo: "digital" },
      secciones: sections,
    });
    expect(html).toContain("fonts.googleapis.com/css2?family=");
    expect(html).toContain("font-size:clamp(");
    expect(html).toContain("animation-timeline:view()");
    expect(html).toContain("prefers-reduced-motion:no-preference");
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
    // En Colombia no se pide la cédula (regla del dueño, 24-09-2026).
    expect(html).not.toContain('name="documento"');
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

  it("departamento es <select> y ciudad usa datalist filtrado (30-09-2026)", () => {
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "ecommerce",
      producto: product,
      negocio: { modelo: "dropshipping" },
      secciones: sections,
      cierre: { tipo: "contraentrega", accion: "/pedido" },
    });
    // Departamento: select con las 33 opciones de Colombia, no texto libre.
    expect(html).toContain('name="departamento"');
    expect(html).toMatch(/<select name="departamento"[^>]*>[\s\S]*?<option>Antioquia<\/option>/);
    // Ciudad: input con datalist (acepta municipios fuera de la lista).
    expect(html).toContain('list="ciudades-datalist"');
    expect(html).toContain('<datalist id="ciudades-datalist">');
    // El script que llena el datalist al cambiar el departamento.
    expect(html).toContain("ciudades-datalist");
    expect(html).toContain("M[d.value]");
    // No debe quedar un input de texto plano para departamento.
    expect(html).not.toMatch(/<input name="departamento"/);
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

  /**
   * Cada foto lateral se usa UNA vez y nunca la del hero. Antes "rotaban" en
   * círculo: con 1-2 fotos la misma imagen salía en el hero, la oferta, el
   * envío y el cierre (14-09-2026). El cierre y el envío ya no llevan foto:
   * son texto centrado y tarjetas cortas.
   */
  it("los bloques laterales usan cada foto una vez y nunca repiten la del hero", () => {
    const html = renderizarLanding({ ...base, producto: { ...product, images: [product.imageUrl, "https://cdn.example.com/2.webp", "https://cdn.example.com/3.webp"] }, secciones: [
      { id: "o", type: "offer", title: "Oferta", body: "x" },
      { id: "a", type: "authority", title: "Por qué confiar", body: "y" },
      { id: "c", type: "cta", title: "Cierre", body: "z" },
    ] });
    expect(html).toContain("https://cdn.example.com/2.webp");
    expect(html).toContain("https://cdn.example.com/3.webp");
    // La del hero aparece en el hero (y og:image), no en los laterales.
    expect(html.split(product.imageUrl).length - 1).toBeLessThanOrEqual(2);
    expect(html).toContain('class="cierre"');
  });

  it("con una sola foto, la oferta va sin foto lateral en vez de repetir la del hero", () => {
    const html = renderizarLanding({ ...base, producto: { ...product, images: [product.imageUrl] }, secciones: [
      { id: "o", type: "offer", title: "Oferta", body: "x" },
    ] });
    expect(html).toContain("offer--solo");
    expect(html).not.toContain('class="offer-side"');
  });

  it("el precio real sale una vez en la oferta, sin el '45999 COP' crudo del modelo", () => {
    const html = renderizarLanding({ ...base, secciones: [
      { id: "h", type: "hero", title: "Dolor de espalda", subtitle: "Corrige tu postura", cta: "Pedir" },
      { id: "o", type: "offer", title: "Oferta", subtitle: "45999 COP", body: "Precio: 45.999 COP\nPago contra entrega: no pagas hasta tenerlo" },
    ] });
    expect(html).not.toContain("45999 COP");
    expect(html).not.toContain("Precio: 45.999");
    expect(html).toContain("Pago contra entrega: no pagas hasta tenerlo");
  });

  it("un párrafo corrido en beneficios se parte en tarjetas y cada una se acota", () => {
    const largo = "Alivia el dolor de espalda desde el primer día de uso continuo. Corrige la postura al sentarte frente al computador durante horas. Se mantiene discreto debajo de la ropa sin que nadie lo note. Permite la ventilación gracias a su material transpirable de alta densidad y costuras reforzadas que aguantan el uso diario intenso sin deformarse ni perder la tensión original.";
    const html = renderizarLanding({ ...base, secciones: [{ id: "b", type: "benefits", title: "Beneficios", body: largo }] });
    expect(html.split('class="bento-card"').length - 1).toBe(4);
    expect(html).toContain("…");
  });

  it("envío y pago es una tarjeta por condición, no el bloque de la oferta", () => {
    const html = renderizarLanding({ ...base, secciones: [{ id: "l", type: "logistics", title: "Envío", body: "Envío gratis.\nPagás al recibir.\nLlega en 3 a 5 días." }] });
    expect(html.split("<article>").length - 1).toBe(3);
    expect(html).not.toContain('class="offer-main"');
  });
});

describe("tituloLegible", () => {
  it("baja a tipo oración los nombres en MAYÚSCULAS de Dropi/Woo y deja el resto igual", () => {
    expect(tituloLegible("BOLSO VIAJERO TIPO MORRAL EQUIPAJE MANO")).toBe("Bolso viajero tipo morral equipaje mano");
    expect(tituloLegible("Curso de Piano Completo")).toBe("Curso de Piano Completo");
    expect(tituloLegible("GH07")).toBe("GH07");
  });

  it("ninguna foto sale dos veces en la página, ni siquiera en la galería", () => {
    // Reportado el 19-09-2026: con pocas fotos, la de la portada volvía a
    // aparecer en la oferta y otra vez en "Míralo de cerca".
    const fotos = ["https://cdn.test/f1.jpg", "https://cdn.test/f2.jpg", "https://cdn.test/f3.jpg"];
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "ecommerce",
      producto: { ...product, imageUrl: fotos[0], images: fotos },
      negocio: { nombre: "Tienda Demo", modelo: "fisico" },
      secciones: [
        { id: "hero", type: "hero", title: "Título", subtitle: "Sub", cta: "Pedir", image: fotos[0] },
        { id: "o", type: "offer", title: "Oferta", body: "Texto", image: fotos[0] },
        { id: "h", type: "how-it-works", title: "Cómo funciona", body: "Pasos", image: fotos[0] },
        { id: "g", type: "gallery", title: "Míralo de cerca", images: fotos },
        { id: "g2", type: "gallery", title: "Otra galería", images: fotos },
      ],
    });
    for (const f of fotos) {
      const veces = html.split(`src="${f}"`).length - 1;
      expect(veces, `${f} aparece ${veces} veces`).toBeLessThanOrEqual(1);
    }
    // Las tres fotos se usan (hero, oferta, cómo funciona) y la galería, sin fotos libres, no se dibuja.
    expect(html).toContain(`src="${fotos[1]}"`);
    expect(html).toContain(`src="${fotos[2]}"`);
    expect(html).not.toContain("Otra galería");
  });

  it("la galería muestra solo las fotos que sobraron", () => {
    const fotos = ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg", "https://cdn.test/c.jpg", "https://cdn.test/d.jpg"];
    const html = renderizarLanding({
      nombre: "Demo",
      familia: "ecommerce",
      producto: { ...product, imageUrl: fotos[0], images: fotos },
      negocio: { modelo: "fisico" },
      secciones: [
        { id: "hero", type: "hero", title: "Título", cta: "Pedir", image: fotos[0] },
        { id: "o", type: "offer", title: "Oferta", body: "Texto" },
        { id: "g", type: "gallery", title: "Míralo de cerca", images: fotos },
      ],
    });
    expect(html).toContain("Míralo de cerca");
    expect(html.split(`src="${fotos[0]}"`).length - 1).toBe(1);
    expect(html.split(`src="${fotos[1]}"`).length - 1).toBe(1);
    expect(html).toContain(`src="${fotos[2]}"`);
    expect(html).toContain(`src="${fotos[3]}"`);
  });
});
