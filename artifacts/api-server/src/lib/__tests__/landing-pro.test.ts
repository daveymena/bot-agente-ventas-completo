import { describe, it, expect } from "vitest";
import { renderizarLandingPro, paletaPorCategoria } from "../landing/renderer-pro";
import { contenidoDesdeRespuesta, contenidoDeRespaldo } from "../landing/contenido-pro";
import { htmlDesdeRespuesta } from "../landing/agente-landing";

/**
 * Landing PRO (modelo elegido por el dueño, 30-09-2026): plantilla fija +
 * textos del modelo. Lo que se fija: formulario conectado a /pedido, fotos
 * sin repetir, nada inventado y rótulos del método fuera.
 */
const producto = { name: "Corrector de Postura Trenza", description: "Faja ajustable que lleva los hombros hacia atrás. Se usa bajo la ropa.", features: ["Talla única ajustable", "Se usa bajo la ropa"], price: 45000, category: "Salud y bienestar" };

function landing(extra: Partial<Parameters<typeof renderizarLandingPro>[0]> = {}) {
  const contenido = contenidoDesdeRespuesta(JSON.stringify({
    chip: "Talla única ajustable", titulo: "Endereza tu espalda", tituloResaltado: "sin esfuerzo",
    lead: "El Corrector de Postura Trenza lleva tus hombros hacia atrás.", bullets: ["Hombros alineados", "Talla única", "Discreto"],
    cta: "Lo quiero", problema: { eyebrow: "El problema", titulo: "Horas frente al computador", texto: "La mala postura cansa." },
    beneficios: [{ icono: "spine", titulo: "Alinea", texto: "Hombros atrás." }, { icono: "inventado", titulo: "Discreto", texto: "Bajo la ropa." }],
    pasos: [{ titulo: "Póntelo", texto: "Ajusta el velcro." }, { titulo: "Úsalo", texto: "Mientras trabajas." }],
    faq: [{ p: "¿Cómo pago?", r: "Al recibir." }, { p: "¿Talla?", r: "Única." }],
  }), producto);
  const html = renderizarLandingPro({
    contenido, producto: { name: producto.name, price: 45000, categoria: producto.category, opciones: [{ nombre: "Color", valores: ["Negro", "Beige"], obligatoria: true }] },
    fotos: ["https://cdn.test/1.jpg", "https://cdn.test/2.jpg", "https://cdn.test/3.jpg"],
    negocio: { nombre: "Sofía Premium", whatsapp: "573001112233" }, accion: "/api/landing-publica/x/pedido", pagoAlRecibir: true,
    ...extra,
  });
  return htmlDesdeRespuesta(html).html;
}

describe("landing PRO", () => {
  it("el formulario manda a /pedido los campos que exige el servidor, con opciones y transportadora", () => {
    const h = landing();
    expect(h).toMatch(/<form[^>]*action="\/api\/landing-publica\/x\/pedido"/);
    for (const c of ["nombre", "telefono", "ciudad", "departamento", "direccion", "barrio", "opcion_Color"]) expect(h).toContain(`name="${c}"`);
    expect(h).toContain('class="envio-transportadora"');
    expect(h).toContain("/envio");
  });

  it("cada foto sale en un solo bloque: la del problema no está en la galería", () => {
    const h = landing();
    const enProblema = h.match(/<div class="prob-img"><img src="([^"]+)"/)?.[1];
    expect(enProblema).toBe("https://cdn.test/3.jpg");
    const galeria = h.slice(h.indexOf('id="gtrack"'), h.indexOf('class="g-thumbs"'));
    expect(galeria).not.toContain("https://cdn.test/3.jpg");
  });

  it("no inventa: sin precio tachado, descuentos, estrellas, reseñas ni garantía si no hay", () => {
    const h = landing();
    expect(h).not.toMatch(/-\d+% HOY|<s class|reseñas|Quedan \d+|class="stars"/);
    expect(h).not.toMatch(/garant[ií]a/i);
    expect(h).not.toContain("Lo que dicen nuestros clientes");
  });

  it("garantía y testimonios REALES se muestran tal cual", () => {
    const h = landing({ garantia: "30 días por defectos de fábrica", testimonios: [{ nombre: "Laura M.", ciudad: "Cali", texto: "Me llegó en 3 días y me sirvió." }] });
    expect(h).toContain("30 días por defectos de fábrica");
    expect(h).toContain("Me llegó en 3 días y me sirvió.");
    expect(h).toContain("Laura M.");
  });

  it("el rótulo del método no llega a la página y el ícono inventado cae a uno válido", () => {
    const h = landing();
    expect(h).not.toMatch(/>El problema</);
    expect(h).toContain("Horas frente al computador");
  });

  it("paleta neutra por rubro y respaldo sin modelo", () => {
    expect(paletaPorCategoria("Moda y accesorios")).toBe("carbon");
    expect(paletaPorCategoria("Mascotas")).toBe("terracota");
    const c = contenidoDeRespaldo(producto);
    expect(c.pasos.map((p) => p.titulo)).toEqual(["Haz tu pedido", "Lo recibes en casa", "Pagas al recibir"]);
    expect(contenidoDesdeRespuesta("esto no es json", producto).titulo).toBe(c.titulo);
  });
});

describe("landing PRO por tipo y estilo", () => {
  const base = () => ({
    contenido: contenidoDeRespaldo(producto, "digital"),
    producto: { name: "Curso de Piano", price: 60000, categoria: "Cursos" },
    fotos: ["https://cdn.test/p.jpg"],
    negocio: { nombre: "Academia", whatsapp: "573001112233" },
    accion: "__FORM_ACTION__",
  });

  it("digital: botones de pago reales, sin formulario de envío ni contra entrega", () => {
    const h = renderizarLandingPro({ ...base(), tipo: "digital", modo: "pago", enlaces: { mercadopago: "https://mpago.la/abc" } });
    expect(h).toContain("https://mpago.la/abc");
    expect(h).not.toMatch(/name="direccion"|contra entrega|ENVÍO A DOMICILIO/i);
    expect(h).toContain("Obtén tu acceso");
  });

  it("servicio: cierra por WhatsApp para agendar", () => {
    const h = renderizarLandingPro({ ...base(), contenido: contenidoDeRespaldo(producto, "servicio"), tipo: "servicio", modo: "whatsapp" });
    expect(h).toContain("Agendar por WhatsApp");
    expect(h).toContain("https://wa.me/573001112233");
    expect(h).not.toMatch(/<form/);
  });

  it("estilo clínico: azul de marca, botón verde, checkout en 3 pasos con resumen", () => {
    const h = renderizarLandingPro({ ...base(), contenido: contenidoDeRespaldo(producto), producto: { name: producto.name, price: 45000 }, tipo: "fisico", modo: "contraentrega", estilo: "clinico" });
    expect(h).toContain('<body class="clinico">');
    expect(h).toContain("--p:#1D4ED8");
    expect(h).toMatch(/<i>1<\/i>Datos de contacto[\s\S]*<i>2<\/i>Dirección de envío[\s\S]*<i>3<\/i>Forma de pago/);
    expect(h).toContain("Resumen de tu compra");
  });
});
