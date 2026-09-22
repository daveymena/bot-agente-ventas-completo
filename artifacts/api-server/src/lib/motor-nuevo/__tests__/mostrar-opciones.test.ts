/**
 * DESAMBIGUACIÓN VISUAL — mostrar_opciones
 * ========================================
 *
 * Cuando el cliente pide algo ambiguo ("corrector de postura" con 5 modelos,
 * "taladro" con 3), el bot debe mostrar la ficha de CADA opción para que elija,
 * no solo una lista de texto. Es una prueba estructural: no depende del modelo.
 */

import { test, describe, expect } from "vitest";
const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
  deepEqual: (a: any, b: any, m?: string) => expect(a, m).toEqual(b),
};

import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas, type Producto } from "../herramientas";
import { guionDelNegocio } from "../nicho";

const CATALOGO: Producto[] = [
  { id: 1, name: "Corrector de postura", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
  { id: 2, name: "Corrector de postura ortopédico Back", description: "", price: 45000, currency: "COP", kind: "physical", disponible: true },
  { id: 3, name: "Corrector de postura trenza", description: "", price: 50000, currency: "COP", kind: "physical", disponible: true },
];

function ctx(): ContextoHerramientas {
  return {
    estado: estadoInicial(1),
    catalogo: CATALOGO,
    partes: [],
    conocimiento: [],
    guion: guionDelNegocio({ catalogo: CATALOGO, negocio: { nombre: "Tienda" } }),
    mensajeDelCliente: "corrector de postura",
    efectos: [],
  };
}

describe("mostrar_opciones (desambiguación visual)", () => {
  test("emite una ficha por cada opción para que el cliente elija", () => {
    const c = ctx();
    const r = ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;

    assert.equal(r.ok, true);
    const cards = c.partes.filter((p) => p.kind === "card") as any[];
    assert.equal(cards.length, 3);
    assert.deepEqual(cards.map((x) => x.productId), [1, 2, 3]);
    assert.ok(cards.every((x) => x.seccion === "info"));
  });

  test("con un solo id no sirve: es para desambiguar dos o más", () => {
    const c = ctx();
    const r = ejecutores.mostrar_opciones(c, { productoIds: [1] }) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /DOS o más/i);
    assert.equal(c.partes.length, 0);
  });

  test("registra cada ficha como enviada para no repetirla después", () => {
    const c = ctx();
    ejecutores.mostrar_opciones(c, { productoIds: [1, 2] });

    assert.ok(c.estado.seccionesEnviadas[1]?.info, "el producto 1 quedó marcado con info enviada");
    assert.ok(c.estado.seccionesEnviadas[2]?.info, "el producto 2 quedó marcado con info enviada");
  });
});
