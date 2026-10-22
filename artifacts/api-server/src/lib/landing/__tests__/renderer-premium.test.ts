import { describe, expect, it } from "vitest";
import { renderizarPremium, seccionesInicialesPremium, type DatosPremium } from "../renderer-premium";

/**
 * Diseño premium (23-10-2026): el prototipo aprobado convertido en renderer.
 * Lo que más importa: TODAS las fotos del producto, y nada que el negocio no
 * haya dicho (ni envío gratis, ni estrellas, ni tachado, ni garantía).
 */

const FOTOS = ["https://cdn.x.com/a.jpg", "https://cdn.x.com/b.jpg", "https://cdn.x.com/c.jpg"];

const base = (extra: Partial<DatosPremium> = {}): DatosPremium => ({
  modelo: "fisico",
  producto: { name: "Mochila antirrobo USB", description: "Cierre contra la espalda y puerto USB.", price: 89900, features: ["Cierre antirrobo", "Puerto USB: carga el celular", "Repele la lluvia"] },
  fotos: FOTOS,
  negocio: { nombre: "Ruta Urbana", whatsapp: "573001112233" },
  envio: { pago: "contraentrega", costo: "", plazo: "", cobertura: "" },
  secciones: [],
  cierre: { accion: "/api/landing-publica/mochila/pedido" },
  acento: "#2F6690",
  esColombia: true,
  ...extra,
});

describe("físico: product page contraentrega", () => {
  it("todas las fotos del producto están en la galería, con miniaturas", () => {
    const html = renderizarPremium(base());
    for (const f of FOTOS) expect(html).toContain(`src="${f}"`);
    expect(html).toContain('class="minis"');
    expect(html).toContain("1/3");
  });

  it("con una sola foto: sin miniaturas, y la banda usa recortes de esa foto", () => {
    const html = renderizarPremium(base({ fotos: [FOTOS[0]!] }));
    expect(html).not.toContain('class="minis"');
    expect(html).toMatch(/class="rasgo"[\s\S]*transform:scale\(1\.8\)/);
  });

  it("sin envío configurado no promete gratis, incluido ni plazo", () => {
    const html = renderizarPremium(base());
    expect(html).not.toMatch(/gr[aá]tis/i);
    expect(html).not.toContain("Envío incluido");
    expect(html).not.toMatch(/Llega en/);
    expect(html).toContain("Se confirma por WhatsApp");
  });

  it("con envío incluido y plazo del negocio, los dice", () => {
    const html = renderizarPremium(base({ envio: { pago: "contraentrega", costo: "incluido", plazo: "2 a 4 días hábiles", cobertura: "" } }));
    expect(html).toContain("Envío incluido");
    expect(html).toContain("Llega en 2 a 4 días hábiles");
  });

  it("nada inventado: sin estrellas, sin 4.8, sin contador, sin garantía ni testimonios", () => {
    const html = renderizarPremium(base());
    expect(html).not.toContain("★");
    expect(html).not.toMatch(/4\.8/);
    expect(html).not.toMatch(/termina en|timer/i);
    expect(html).not.toContain("Garantía.");
    expect(html).not.toContain("class=\"testi\"");
  });

  it("tachado solo con un precio anterior real y mayor", () => {
    expect(renderizarPremium(base({ precioAntes: 80000 }))).not.toContain("<s>");
    const html = renderizarPremium(base({ precioAntes: 119900 }));
    expect(html).toContain("<s>$119.900</s>");
    expect(html).toContain("25% menos");
  });

  it("paquetes del dueño con precio por unidad y ahorro real", () => {
    const html = renderizarPremium(base({ ofertas: [{ nombre: "1 mochila", cantidad: 1, precio: 89900 }, { nombre: "2 mochilas", cantidad: 2, precio: 159900 }] }));
    expect(html).toContain("$79.950 cada una");
    expect(html).toContain("Ahorras $19.900");
    expect(html).toContain('name="oferta"');
  });

  it("variantes como botones y, para el formulario sin JS, como lista", () => {
    const html = renderizarPremium(base({ producto: { ...base().producto, opciones: [{ nombre: "Color", valores: ["Azul", "Negro"], obligatoria: true }] } }));
    expect(html).toMatch(/class="chip"[\s\S]*Azul/);
    expect(html).toContain('name="opcion_Color"');
  });

  it("el formulario va al /pedido de siempre con los campos que valida el servidor", () => {
    const html = renderizarPremium(base());
    expect(html).toContain('action="/api/landing-publica/mochila/pedido"');
    for (const campo of ["nombre", "telefono", "departamento", "ciudad", "direccion"]) expect(html).toContain(`name="${campo}"`);
  });

  it("la garantía y los testimonios del dueño sí salen", () => {
    const html = renderizarPremium(base({ garantia: "Cambio si llega con defecto, 5 días", testimonios: [{ nombre: "Ana", ciudad: "Cali", texto: "Me llegó rápido" }] }));
    expect(html).toContain("Cambio si llega con defecto, 5 días");
    expect(html).toContain("Me llegó rápido");
    expect(html).not.toContain("★");
  });

  it("los textos de las secciones salen tal cual (la edición directa los encuentra)", () => {
    const html = renderizarPremium(base({ secciones: [{ id: "h", type: "hero", title: "Viaja tranquilo", subtitle: "Nadie abre lo que va en tu espalda", cta: "La quiero" }] }));
    expect(html).toContain(">Viaja tranquilo<");
    expect(html).toContain("Nadie abre lo que va en tu espalda");
    expect(html).toContain("La quiero");
  });

  it("escapa lo que escribe el dueño", () => {
    const html = renderizarPremium(base({ producto: { ...base().producto, name: '<img src=x onerror=alert(1)>' } }));
    expect(html).not.toContain("<img src=x onerror");
  });
});

describe("digital y servicio", () => {
  it("digital con enlaces: botones de pago y acceso, sin formulario de envío", () => {
    const html = renderizarPremium(base({ modelo: "digital", cierre: { mercadopago: "https://mpago.la/x", cupon: "/api/landing-publica/c/cupon" } }));
    expect(html).toContain("https://mpago.la/x");
    expect(html).toContain("Cómo recibes el acceso");
    expect(html).not.toContain('name="direccion"');
    expect(html).not.toContain("Pagas cuando te llega");
  });

  it("digital sin enlaces de pago: compra por WhatsApp", () => {
    const html = renderizarPremium(base({ modelo: "digital", cierre: {} }));
    expect(html).toContain("Comprar por WhatsApp");
    expect(html).toContain("https://wa.me/573001112233");
  });

  it("digital sin pago ni WhatsApp: no promete un camino de compra que no existe", () => {
    const html = renderizarPremium(base({ modelo: "digital", negocio: { nombre: "X", whatsapp: null }, cierre: {} }));
    expect(html).not.toContain("Quiero acceder");
    expect(html).not.toContain("Cómo recibes el acceso");
    expect(html).not.toContain("Escríbenos");
  });

  it("servicio: se agenda por WhatsApp, sin envío ni carrito", () => {
    const html = renderizarPremium(base({ modelo: "servicio", producto: { name: "Asesoría de marca", price: 250000 }, cierre: {} }));
    expect(html).toContain("Agendar por WhatsApp");
    expect(html).toMatch(/wa\.me\/573001112233\?text=/);
    expect(html).not.toContain('name="direccion"');
    expect(html).not.toMatch(/Envío/);
  });
});

describe("secciones de arranque sin IA", () => {
  it("salen de la ficha: nombre, descripción y características", () => {
    const s = seccionesInicialesPremium({ name: "Mochila", description: "Una mochila resistente.", features: JSON.stringify(["🔒 Cierre oculto", "USB"]) });
    expect(s[0]).toMatchObject({ type: "hero", title: "Mochila", subtitle: "Una mochila resistente." });
    expect(s[1]).toMatchObject({ type: "benefits", body: "Cierre oculto\nUSB" });
  });

  it("sin características no inventa beneficios", () => {
    expect(seccionesInicialesPremium({ name: "Mochila" })).toHaveLength(1);
  });
});
