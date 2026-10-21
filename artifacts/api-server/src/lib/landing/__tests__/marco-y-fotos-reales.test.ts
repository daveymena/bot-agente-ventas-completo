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
    expect(html).toMatch(/<header class="hdr".*TecnoVariedades.*¡Quiero la mía!/s);
    expect(html).toMatch(/<footer class="foot".*wa\.me\/573042748687/s);
    expect(html).toMatch(/<div class="sticky">/);
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
    expect((html.match(/sec--gallery[\s\S]*?<\/section>/)?.[0] || "").match(/<img/g)?.length).toBe(3);
  });

  it("una sección sin contenido no se dibuja", () => {
    expect(html).not.toMatch(/sec--how-it-works/);
  });

  it("la FAQ trae la respuesta, no solo la pregunta", () => {
    expect(html).toMatch(/<summary>¿Cuánto tarda\?<span class="pm">\+<\/span><\/summary><p>Entre 3 y 5 días hábiles<\/p>/);
  });
});

describe("el cierre depende del modelo del producto", () => {
  const base = { nombre: "x", familia: "ecommerce", producto, negocio, secciones: [{ id: "hero-1", type: "hero", title: "T", cta: "Pedir" }] } as const;

  it("físico: formulario contraentrega que POSTea al pedido, y WhatsApp como alternativa", () => {
    const html = renderizarLanding({ ...base, cierre: { tipo: "contraentrega", accion: "/api/landing-publica/faja-x/pedido", pais: "CO", pago: "contraentrega" } });
    expect(html).toMatch(/<form class="pedido" method="post" action="\/api\/landing-publica\/faja-x\/pedido"/);
    for (const campo of ["nombre", "telefono", "direccion", "ciudad", "departamento", "referencia"]) expect(html).toMatch(new RegExp(`name="${campo}"`));
    // En Colombia no se pide la cédula (regla del dueño, 24-09-2026).
    expect(html).not.toMatch(/name="documento"/);
    expect(html).not.toMatch(/Cédula/);
    expect(html).toMatch(/wa\.me\/573042748687\?text=/);
    // todos los CTA de la página apuntan al bloque de pedido
    expect(html).toMatch(/<header class="hdr">.*href="#pedido"/s);
  });

  it("fuera de Colombia pide documento y estado/provincia", () => {
    const html = renderizarLanding({ ...base, cierre: { tipo: "contraentrega", accion: "/x", pais: "MX", pago: "contraentrega" } });
    expect(html).toMatch(/Documento de identidad/);
    expect(html).toMatch(/Estado o provincia/);
  });

  it("digital: MercadoPago, PayPal y WhatsApp; sin formulario", () => {
    const html = renderizarLanding({ ...base, negocio: { ...negocio, modelo: "digital" }, cierre: { tipo: "pago", mercadopago: "https://mp/1", paypal: "https://pp/1" } });
    expect(html).toMatch(/href="https:\/\/mp\/1">Pagar con MercadoPago/);
    expect(html).toMatch(/href="https:\/\/pp\/1">Pagar con PayPal/);
    expect(html).toMatch(/Comprar por WhatsApp/);
    expect(html).not.toMatch(/<form class="pedido"/);
  });
});

describe("movimiento sin dejar nada invisible", () => {
  it("las secciones parten visibles: la clase que las oculta solo existe bajo .js, y hay reduced-motion", () => {
    const html = renderizarLanding({ nombre: "x", familia: "ecommerce", producto, negocio, secciones: [{ id: "hero-1", type: "hero", title: "T", cta: "Pedir" }, { id: "benefits-1", type: "benefits", title: "B", body: "a\nb\nc" }] });
    expect(html).toMatch(/\.js \.sec\[data-reveal\]\{opacity:0/);
    // Todas las reglas que ocultan van bajo .js: sin script, nada se oculta.
    const ocultan = (html.match(/\.sec\[data-reveal\]\{opacity:0/g) || []).length;
    const bajoJs = (html.match(/\.js \.sec\[data-reveal\]\{opacity:0/g) || []).length;
    expect(ocultan).toBeGreaterThan(0);
    expect(ocultan).toBe(bajoJs);
    expect(html).toMatch(/prefers-reduced-motion:reduce/);
    expect(html).toMatch(/IntersectionObserver/);
    // El HTML NO trae data-reveal de fábrica: lo pone el script.
    expect(html).not.toMatch(/<section[^>]*data-reveal/);
  });
});

describe("tallas en el formulario de la landing", () => {
  it("con opciones obligatorias, el formulario trae el selector que el servidor exige", async () => {
    const { renderizarLanding } = await import("../renderer");
    const html = renderizarLanding({
      contenido: {} as any,
      producto: { name: "Corrector", price: 45000, currency: "COP", opciones: [{ nombre: "Talla", valores: ["S", "M"], obligatoria: true }] } as any,
      cierre: { tipo: "contraentrega", accion: "/api/l/x/pedido", pais: "CO" } as any,
    } as any);
    expect(html).toMatch(/<select name="opcion_Talla" required>/);
    expect(html).toMatch(/<option>M<\/option>/);
  });
});

describe("landing de HTML fijo sin talla (corrector #56, 26-09-2026)", () => {
  it("inyecta el selector de talla y la cédula deja de ser obligatoria", async () => {
    const { formularioConOpciones } = await import("../renderer");
    const html = `<form class="f" action="/api/landing-publica/x/pedido" method="post"><input name="nombre" required><input name="documento" required></form>`;
    const out = formularioConOpciones(html, { opciones: [{ nombre: "Talla", valores: ["S", "M"], obligatoria: true }] } as any);
    expect(out).toMatch(/<form[^>]*pedido[^>]*>\n<label>Talla<select name="opcion_Talla" required>/);
    expect(out).toMatch(/<input name="documento">/);
    expect(out).toMatch(/<input name="nombre" required>/);
  });
});
