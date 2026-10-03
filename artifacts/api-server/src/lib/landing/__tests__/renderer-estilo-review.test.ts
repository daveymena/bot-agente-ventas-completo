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

describe("el generador COD portado (renderer-estilo)", () => {
  it("los 4 estilos existen", () => {
    expect([...ESTILOS]).toEqual(["cod", "premium", "bold", "dark"]);
  });

  it("el LOOK del generador validado: announce de oferta + timer", () => {
    const html = renderizarEstilo(fila(), { host: "", accion: "/pedir" });
    expect(html).toContain("🔥 Oferta por tiempo limitado");
    expect(html).toContain('class="timer"');
    expect(html).toContain("La oferta termina en");
    // La garantía default de "30 días" es un claim inventado: sin garantía
    // real del dueño no se promete plazo.
    expect(html).not.toContain("Garantía de 30 días");
  });

  it("el timer del original FUNCIONA (la ventana queda interpolada en el script)", () => {
    const html = renderizarEstilo(fila(), { accion: "/pedir" });
    expect(html).toMatch(/localStorage\.setItem/);
    expect(html).toMatch(/Date\.now\(\)\+7200\*1000/); // ${OFERTA_SEGUNDOS} -> 7200 interpola en el template
  });

  it("el timer se APAGA por landing (estiloExtras.timer=false): sin markup, el script queda no-op", () => {
    const html = renderizarEstilo(fila({ estiloExtras: { timer: false } }), { accion: "/pedir" });
    expect(html).not.toContain('class="timer"');
    expect(html).not.toContain('id="th"'); // el tick no encuentra nada: no-op seguro
  });

  it("sin precioAntes: NO hay tachado ni ahorro (y el descuento de la IA no entra)", () => {
    const p = fila({ estiloExtras: { discount: "52% OFF HOY" } });
    const html = renderizarEstilo(p, { accion: "/pedir" });
    expect(html).not.toMatch(/<del>/);
    expect(html).not.toMatch(/Ahorras/);
    expect(html).not.toContain("52% OFF HOY");
  });

  it("CON precioAntes real: el tachado y el ahorro EXACTO", () => {
    const html = renderizarEstilo(fila({}, { precioAntes: 149900 }), { accion: "/pedir" });
    expect(html).toMatch(/<del>/);
    expect(html).toContain("Ahorras");
  });

  it("la garantía DEL DUEÑO manda sobre la del generador", () => {
    const html = renderizarEstilo(fila({}, { producto: { ...productoReal, metadata: { garantia: "3 meses de garantía directa" } } }), { accion: "/pedir" });
    expect(html).toContain("3 meses de garantía directa");
  });

  it("el envío con condiciones REALES: incluido → el chip del original; sin ellas → el neutro SIN la línea del asterisco", () => {
    const conIncluido = renderizarEstilo(fila({}, { envioReal: { larga: "Envío grátis a todo el país*", corta: "incluido" } }), { accion: "/pedir" });
    expect(conIncluido).toContain("Envío grátis<br>a todo el país*");
    expect(conIncluido).toContain("por tiempo limitado");

    const sinCondiciones = renderizarEstilo(fila(), { accion: "/pedir" });
    // sin condiciones: el chip es el neutro (no promete gratis) y la LÍNEA
    // DEL ASTERISCO del envío no sale. El announce ("por tiempo limitado")
    // es el dispositivo del diseño validado y sigue.
    expect(sinCondiciones).not.toMatch(/\*Env[ií]o gratis/);
    expect(sinCondiciones).toContain("🔥 Oferta por tiempo limitado");
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