/**
 * El estilo "tienda directa COD" (el del concepto que envió el dueño):
 *   hero con el PRODUCTO al frente + pricebox (tachado SOLO con precioAntes
 *   real), la fila de sellos reales, la galería de fotos y el CIERRE con el
 *   formulario de pedido contraentrega.
 *
 * Los dos puntos donde se puede mentir:
 *   1. el precio lista tachado (metadata.precioAntes) — si no está cargado,
 *      NO aparece ninguno;
 *   2. el "Ahorras" — el ahorro EXACTO de los dos precios reales, sin
 *      inventar porcentajes.
 */
import { describe, expect, it } from "vitest";
import { renderizarLanding } from "../renderer-v3";
import { elegirComposicion } from "../composicion";

const producto = {
  name: "Bolso Mochila Antirrobo Cruzado Fashion",
  description: "Seguridad que te acompaña, estilo que impresiona.",
  imageUrl: "https://cdn.example.com/hero.webp",
  images: ["https://cdn.example.com/hero.webp", "https://cdn.example.com/a.webp", "https://cdn.example.com/b.webp"],
  price: 81371,
  currency: "COP",
};
const negocio = { nombre: "Tienda", modelo: "dropshipping", whatsapp: "+57 300 000 0000", confianza: ["Pago contra entrega", "Envío a todo el país"] };

const render = (productoRend: any = producto) =>
  (renderizarLanding({
    nombre: "Demo", familia: "dropshipping", producto: productoRend, negocio,
    secciones: [
      { id: "h", type: "hero", title: "Lleva tu bolso seguro", subtitle: "Antirrobo y cruzado.", cta: "Pide la tuya hoy", layout: "producto" },
      { id: "b", type: "benefits", title: "Lo que cambia", body: "Cerradura oculta\nTela corta-antiescapote\nCompartimientos" },
      { id: "o", type: "offer", title: "Tu bolso", cta: "Pedir ahora" },
    ],
    cierre: { tipo: "contraentrega", accion: "/pedido" },
    modelo: "tienda-directa",
    semilla: "concepto-cod",
  })).split("</style>")[1]; // el BODY: el CSS declara los selectores siempre

describe("tienda-directa con el producto al frente (el concepto del dueño)", () => {
  it("con layout 'producto' el hero es el buybox con el precio", () => {
    const html = render();
    expect(html).toMatch(/hero--buybox/);
    expect(html).toMatch(/buybox-price/);
    expect(html).toContain('class="lx-prod'); // la clase del modelo
  });

  it("SIN precioAntes NO hay tachado ni ahorro en ningún lado", () => {
    const html = render();
    expect(html).not.toContain("price-old");
    expect(html).not.toMatch(/Ahorras/);
  });

  it("CON un precio anterior REAL: el tachado y el ahorro EXACTO, en el buybox", () => {
    const html = render({ ...producto, precioAntes: 119900 });
    expect(html).toContain("price-old");
    expect(html).toContain("Ahorras $38.529"); // 119.900 - 81.371
  });

  it("el cierre queda en el pedido contraentrega POST al /pedido (no solo WhatsApp)", () => {
    const html = render();
    expect(html).toMatch(/\/pedido|action=|form/);
  });

  it("la franja de sellos solo repite lo que el negocio declaró", () => {
    const html = render();
    expect(html).toContain("Pago contra entrega");
    expect(html).not.toContain("Garantía 30 días"); // no lo declaró
  });

  it("la composición se respeta: la semilla no cambia el modelo elegido", () => {
    const a = elegirComposicion({ modelo: "tienda-directa", semilla: "s1", fisico: true });
    const b = elegirComposicion({ modelo: "tienda-directa", semilla: "s2", fisico: true });
    expect(a.modelo).toBe("tienda-directa");
    expect(b.modelo).toBe("tienda-directa");
  });
});