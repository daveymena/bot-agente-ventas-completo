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

  it("el DEFAULT (cleanhome): header de marca, form derecha en desktop, trust4, tbar, footer", () => {
    const html = renderizarEstilo(fila(), { host: "", accion: "/pedir" });
    expect(html).toContain('class="hdr"');
    expect(html).toContain("hero-form");
    expect(html).toContain('class="trust4"');
    expect(html).toContain('class="tbar"');
    // con WhatsApp del negocio: el footer y el flotante lo llevan
    const conWa = renderizarEstilo(fila({}, { producto: { ...productoReal, whatsapp: "+573001234567" } }), { accion: "/pedir" });
    expect(conWa).toContain("Escríbenos por WhatsApp");
    expect(conWa).toContain("wa.me/573001234567");
    // announce default SOLO si el negocio lo declara: sin condiciones no promete gratis
    expect(html).not.toContain("gratis");
  });

  it("el timer sigue siendo dispositivo del diseño (encendido por defecto, funciona por landing)", () => {
    const html = renderizarEstilo(fila(), { host: "", accion: "/pedir" });
    expect(html).toContain('class="timer"');
    expect(html).toContain("La oferta termina en");
    expect(html).toMatch(/Date\.now\(\)\+7200\*1000/);
    // apagable
    const off = renderizarEstilo(fila({ estiloExtras: { timer: false } }), { accion: "/pedir" });
    expect(off).not.toContain('class="timer"');
    expect(off).not.toContain('id="th"');
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

  it("envío: sin condiciones reales NO promete gratis (ni el announce ni el chip)", () => {
    const sinCondiciones = renderizarEstilo(fila(), { accion: "/pedir" });
    expect(sinCondiciones).not.toMatch(/[Gg]rátis/);
    expect(sinCondiciones).toContain("Envío nacional");

    const conIncluido = renderizarEstilo(fila({}, { envioReal: { larga: "Envío grátis a todo el país*", corta: "incluido" } }), { accion: "/pedir" });
    expect(conIncluido).toContain("grátis");
    expect(conIncluido).toContain("por tiempo limitado");
  });

  it("urgencia: topbar con countdown + stockbar + bundles 1x/2x/3x con ahorro real", () => {
    const html = renderizarEstilo(fila({ style: "urgencia" }, { precioAntes: 119900 }), { accion: "/pedir" });
    expect(html).toContain('data-style="urgencia"');
    expect(html).toContain("chip-rojo");
    expect(html).toContain("stockbar");
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