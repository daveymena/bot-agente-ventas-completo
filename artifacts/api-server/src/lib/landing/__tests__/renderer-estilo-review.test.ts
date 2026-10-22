/**
 * RENDERER-ESTILO: el generador COD portado — CONTRATO del 04-10 (2ª pasada).
 *
 * DECISIÓN DEL DUEÑO: el look es EL DEL GENERADOR ORIGINAL (style-bold.html,
 * validado con capturas): el announce de oferta, el chip de envío, el TIMER
 * y la garantía son DISPOSITIVOS DEL DISEÑO (no los escribe la IA) — la
 * primera pasada del review los había quitado y las landings dejaron de
 * parecerse al generador; acá vuelven como defaults del sistema, con las
 * VÍAS HONESTAS de override:
 *   · la garantía: la del dueño (metadata.garantia) manda sobre el default.
 *   · el envío: las condiciones reales del negocio ("incluido" → el chip
 *     "Envío grátis a todo el país*", que es VERDAD para ese negocio; sin
 *     condiciones, el neutro y SIN la línea del asterisco).
 *   · el timer: apagable por landing (design.estiloExtras.timer === false).
 *   · el descuento de la IA: sigue PROHIBIDO (solo el ahorro de los dos
 *     precios reales).
 *
 * 23-10-2026, el dueño: "corrige los datos inventados (4.8, envío gratis por
 * defecto, 50% DTO, contador falso)". Los dispositivos quedan, pero SOLO con
 * su dato real: contador con fecha de fin (ofertaHasta), "Envío incluido"
 * sin "a todo el país*" ni letra chica, sin estrellas, sin stock, sin
 * "Oferta especial" ni "Precio de lanzamiento" sin precio anterior.
 */
import { describe, expect, it } from "vitest";
import { renderizarEstilo, estiloDesdeFila, ESTILOS } from "../renderer-estilo";

const cop = (n: number): string => (n ? n.toLocaleString("es-CO") : "0");

const productoReal: any = {
  id: 163,
  name: "Pañalera Mochila Multifuncional 2 En 1",
  description: "Cuna portátil para bebé y compartimentos múltiples. Resistente al agua.",
  price: 110990,
  currency: "COP",
  kind: "physical",
  imageUrl: "/images/products/163.jpg",
  metadata: {},
};

const fila = (design: any = {}, extra: any = {}) => estiloDesdeFila({
  row: { name: "Demo", slug: (extra.slug ?? "demo"), sections: [], design: { renderer: "estilo", style: "cod", ...design } } as any,
  producto: extra.producto ?? productoReal,
  modelo: extra.modelo ?? "fisico",
  precioAntes: extra.precioAntes,
  envioReal: extra.envioReal,
});

describe("el renderer-estilo (variantes reales del dueño, 03-10)", () => {
  it("las 4 variantes existen: cleanhome/urgencia/clinico/pro", () => {
    expect([...ESTILOS]).toEqual(["cleanhome", "urgencia", "clinico", "pro"]);
  });

  it("los NOMBRES VIEJOS (cod/premium/bold/dark) resuelven por alias sin romper landings publicadas", () => {
    for (const [viejo, nuevo] of [["cod", "cleanhome"], ["premium", "pro"], ["bold", "urgencia"], ["dark", "clinico"]] as const) {
      const html = renderizarEstilo(estiloDesdeFila({ row: { slug: "d", sections: [], design: { renderer: "estilo", style: viejo } } as any, modelo: "fisico" }), { accion: "/p" });
      expect(html).toContain(`data-style="${nuevo}"`);
    }
  });

  it("el DEFAULT (cleanhome): header de marca, form derecha en desktop, UNA franja de confianza (sin repetir)", () => {
    const html = renderizarEstilo(fila(), { host: "", accion: "/pedir" });
    expect(html).toContain('class="hdr"');
    expect(html).toContain("hero-form");
    expect(html).toContain('class="trust4"');
    // la barra de 3 sellos que repetía el trust4 salió (03-10): UNA franja
    expect(html).not.toContain('class="tbar"');
    // con WhatsApp del negocio: el footer y el flotante lo llevan
    const conWa = renderizarEstilo(fila({}, { producto: { ...productoReal, whatsapp: "+573001234567" } }), { accion: "/pedir" });
    expect(conWa).toContain("Escríbenos por WhatsApp");
    expect(conWa).toContain("wa.me/573001234567");
    // announce default SOLO si el negocio lo declara: sin condiciones no promete gratis
    expect(html).not.toContain("gratis");
  });

  // 23-10-2026 (el dueño): "corrige el contador falso". Antes el timer salía
  // siempre y reiniciaba 2 h por visitante (localStorage): una oferta que
  // nunca terminaba. Ahora solo con la fecha de fin REAL que carga el dueño.
  it("el contador solo sale con una fecha de fin real, la misma para todos", () => {
    const sinFecha = renderizarEstilo(fila(), { host: "", accion: "/pedir" });
    expect(sinFecha).not.toContain('class="timer"');
    expect(sinFecha).not.toContain("localStorage.setItem");

    const fin = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const conFecha = renderizarEstilo(fila({ estiloExtras: { ofertaHasta: fin } }), { accion: "/pedir" });
    expect(conFecha).toContain('class="timer"');
    expect(conFecha).toContain(`var fin=${Date.parse(fin)}`);

    const vencida = renderizarEstilo(fila({ estiloExtras: { ofertaHasta: "2020-01-01T00:00:00Z" } }), { accion: "/pedir" });
    expect(vencida).not.toContain('class="timer"');

    const apagada = renderizarEstilo(fila({ estiloExtras: { ofertaHasta: fin, timer: false } }), { accion: "/pedir" });
    expect(apagada).not.toContain('class="timer"');
  });

  it("sin reseñas reales no hay estrellas, ni 4.8, ni calificación para Google", () => {
    for (const style of ESTILOS) {
      const html = renderizarEstilo(fila({ style }), { accion: "/pedir" });
      expect(html, style).not.toContain("★");
      expect(html, style).not.toMatch(/4\.8/);
      expect(html, style).not.toContain("AggregateRating");
      expect(html, style).not.toContain("verificados");
    }
  });

  it("sin precio anterior real no hay 'Oferta especial' ni 'Precio de lanzamiento'", () => {
    const html = renderizarEstilo(fila(), { accion: "/pedir" });
    expect(html).not.toContain("Oferta especial");
    expect(html).not.toContain("Precio de lanzamiento");
    const conAntes = renderizarEstilo(fila({}, { precioAntes: 149900 }), { accion: "/pedir" });
    expect(conAntes).toContain("Antes:");
  });

  it("sin garantía cargada no se promete 'Garantía del negocio' ni 'Satisfacción garantizada'", () => {
    for (const modelo of ["fisico", "digital", "servicio"]) {
      const html = renderizarEstilo(fila({}, { modelo }), { accion: "/pedir" });
      expect(html, modelo).not.toContain("Garantía del negocio");
      expect(html, modelo).not.toContain("Satisfacción garantizada");
      expect(html, modelo).not.toContain("cambia tu cita cuando quieras");
    }
  });

  it("la garantía default NO promete plazo; la del dueño manda", () => {
    const html = renderizarEstilo(fila(), { accion: "/pedir" });
    expect(html).not.toContain("Garantía de 30 días");
    const conG = renderizarEstilo(fila({}, { producto: { ...productoReal, metadata: { garantia: "3 meses de garantía directa" } } }), { accion: "/pedir" });
    expect(conG).toContain("3 meses de garantía directa");
  });

  it("sin precioAntes: NO hay tachado ni ahorro (y el descuento de la IA no entra)", () => {
    const p = fila({ estiloExtras: { discount: "52% OFF HOY" } });
    const html = renderizarEstilo(p, { accion: "/pedir" });
    expect(html).not.toMatch(/<del>/);
    expect(html).not.toContain("Ahorras");
    expect(html).not.toContain("52% OFF HOY");
  });

  it("CON precioAntes real: el tachado y el ahorro EXACTO", () => {
    const html = renderizarEstilo(fila({}, { precioAntes: 149900 }), { accion: "/pedir" });
    expect(html).toMatch(/<del>/);
    expect(html).toContain("Ahorras");
  });

  it("envío: sin condiciones reales NO promete gratis; con 'incluido' dice eso y nada más", () => {
    for (const style of ESTILOS) {
      const sinCondiciones = renderizarEstilo(fila({ style }), { accion: "/pedir" });
      expect(sinCondiciones, style).not.toMatch(/[Gg]r[aá]tis/);
      expect(sinCondiciones, style).not.toMatch(/ENVÍO INCLUIDO|Envío incluido/);
    }

    const conIncluido = renderizarEstilo(fila({}, { envioReal: { larga: "Envío incluido en el precio", corta: "incluido" } }), { accion: "/pedir" });
    expect(conIncluido).toContain("Envío incluido");
    // Lo que el dueño NO dijo no aparece: ni cobertura, ni letra chica.
    expect(conIncluido).not.toMatch(/a todo el país\*|por tiempo limitado|zonas urbanas/);
    expect(conIncluido).not.toContain("grátis");
  });

  it("urgencia: sin '50% DTO.', sin stock inventado; el ahorro sale de los dos precios reales", () => {
    const sinAntes = renderizarEstilo(fila({ style: "urgencia" }), { accion: "/pedir" });
    expect(sinAntes).not.toContain("DTO");
    expect(sinAntes).not.toMatch(/Quedan \d+ unidades/);
    expect(sinAntes).not.toContain("DEMANDA ALTA");
    expect(sinAntes).not.toContain("¡Oferta exclusiva!");
    expect(sinAntes).not.toContain('id="cd-min"');

    const html = renderizarEstilo(fila({ style: "urgencia" }, { precioAntes: 119900 }), { accion: "/pedir" });
    expect(html).toContain('data-style="urgencia"');
    // 110.990 sobre 119.900: 7 % real, no un 50 % de cartel.
    expect(html).toContain("7% MENOS QUE ANTES");
    // bundle 2x con la cifra real: 2x el precio del producto, tachado 2x precioAntes
    expect(html).toMatch(/MÁS POPULAR[^<]*AHORRA/);
    expect(html).toContain("bs-total");
    const ahorroReal = (119900 - 110990) * 2;
    expect(html).toContain(`AHORRA ${cop(ahorroReal)}`);
  });

  it("el formulario es el REAL del bot: departamento, ciudad, dirección, cantidad y POST", () => {
    const html = renderizarEstilo(fila({}, { slug: "demo-pedido" }), { accion: "/api/landing-publica/demo-pedido/pedido" });
    expect(html).toMatch(/departamento/i);
    expect(html).toMatch(/ciudad/i);
    expect(html).toMatch(/direccion/i);
    expect(html).toMatch(/cantidad/i);
    expect(html).toMatch(/\/api\/landing-publica\/demo-pedido\/pedido/);
  });
});