/**
 * RENDERER-ESTILO: el generador COD portado (4 variantes) — con las REGLAS
 * del review del 04-10 (el dueño pidió revisar "textos, ubicación y precios"):
 *
 *   · PRECIOS: el tachado/"Ahorras" SOLO con un precioAntes REAL; el descuento
 *     que la IA "escribiera" en estiloExtras NO se muestra (una cifra sin un
 *     precio anterior real es inventada).
 *   · SIN URGENCIA FALSA: nada de timers ("la oferta termina en") — la regla
 *     del repo: sin cuentas regresivas.
 *   · SIN GARANTÍA INVENTADA: "Garantía de 30 días" A MANO se elimina — la
 *     garantía solo si el dueño la cargó (metadata.garantia).
 *   · UBICACIÓN: el formulario tiene el departamento (select) y la ciudad.
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

describe("el generador COD portado (renderer-estilo)", () => {
  it("los 4 estilos existen", () => {
    expect([...ESTILOS]).toEqual(["cod", "premium", "bold", "dark"]);
  });

  it("sin precioAntes: NO hay tachado ni ahorro (y el descuento de la IA no entra)", () => {
    const p = estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod", estiloExtras: { discount: "52% OFF HOY" } } } as any,
      producto: productoReal, modelo: "fisico",
    });
    const html = renderizarEstilo(p, { accion: "/pedir" });
    expect(html).not.toMatch(/<del>/);
    expect(html).not.toMatch(/Ahorras/);
    expect(html).not.toContain("52% OFF HOY");
  });

  it("CON precioAntes real: el tachado y el ahorro EXACTO", () => {
    const p = estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: productoReal, modelo: "fisico", precioAntes: 149900,
    });
    const html = renderizarEstilo(p, { accion: "/pedir" });
    expect(html).toMatch(/<del>/);
    expect(html).toContain("Ahorras");
    expect(html).toContain("$38");
  });

  it("NADA de timer: la urgencia falsa se eliminó del generador", () => {
    const p = estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: productoReal, modelo: "fisico",
    });
    const html = renderizarEstilo(p, { accion: "/pedir" });
    expect(html).not.toContain('class="timer"');
    expect(html).not.toContain("La oferta termina en");
    expect(html).not.toContain("localStorage.setItem");
    expect(html).not.toContain("OFERTA_SEGUNDOS");
  });

  it('"Garantía de 30 días" a mano NO aparece: solo la que el dueño cargó', () => {
    const sin = renderizarEstilo(estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: productoReal, modelo: "fisico",
    }), { accion: "/pedir" });
    expect(sin).not.toMatch(/Garant[ií]a\s*(de)?\s*30/i);

    const con = renderizarEstilo(estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: { ...productoReal, metadata: { garantia: "3 meses de garantía directa" } }, modelo: "fisico",
    }), { accion: "/pedir" });
    expect(con).toContain("3 meses de garantía directa");
  });

  it("el físico NO afirma 'Envío gratis' sin las condiciones (el neutro, que no promete)", () => {
    const html = renderizarEstilo(estiloDesdeFila({
      row: { name: "Demo", slug: "demo", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: productoReal,
      modelo: "fisico",
    }), { accion: "/pedir" });
    // Sin condiciones cargadas, la página NO puede decir "gratis": neutro.
    expect(html).not.toMatch(/Env[ií]o gratis/i);
  });

  it("el formulario es el REAL del bot: departamento, ciudad, dirección, cantidad y POST", () => {
    const html = renderizarEstilo(estiloDesdeFila({
      row: { name: "Demo", slug: "demo-pedido", sections: [], design: { renderer: "estilo", style: "cod" } } as any,
      producto: productoReal, modelo: "fisico",
    }), { accion: "/api/landing-publica/demo-pedido/pedido" });
    // La UBICACIÓN: departamento y ciudad en el cierre del pedido.
    expect(html).toMatch(/departamento/i);
    expect(html).toMatch(/ciudad/i);
    expect(html).toMatch(/direccion/i);
    expect(html).toMatch(/cantidad/i);
    expect(html).toMatch(/\/api\/landing-publica\/demo-pedido\/pedido/);
  });
});