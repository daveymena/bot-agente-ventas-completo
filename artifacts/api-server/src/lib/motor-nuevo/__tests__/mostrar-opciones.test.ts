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

import { estadoInicial, ordinalDeMensaje } from "../estado-conversacion";
import { ejecutores, mencionaProductoConcreto, nombraAlternativaAlProductoDelAnuncio, type ContextoHerramientas, type Producto } from "../herramientas";
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
  test("emite una ficha por cada opción para que el cliente elija", async () => {
    const c = ctx();
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;

    assert.equal(r.ok, true);
    const cards = c.partes.filter((p) => p.kind === "card") as any[];
    assert.equal(cards.length, 3);
    assert.deepEqual(cards.map((x) => x.productId), [1, 2, 3]);
    assert.ok(cards.every((x) => x.seccion === "info"));
  });

  test("si el anuncio fijó un producto, la categoría genérica no abre cuatro productos", async () => {
    const c = ctx();
    c.productoDeAnuncioId = 1;
    c.estado.productoEnFoco = 1;
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;
    const cards = c.partes.filter((p) => p.kind === "card") as any[];
    expect(r.ok).toBe(true);
    expect(cards.map((x) => [x.productId, x.seccion])).toEqual([[1, "completa"]]);
    expect(r.mensaje).toMatch(/por el anuncio/i);
  });

  test("si el cliente pide otros modelos, sí puede comparar alternativas al anuncio", async () => {
    const c = ctx();
    c.productoDeAnuncioId = 1;
    c.estado.productoEnFoco = 1;
    c.mensajeDelCliente = "¿Qué otros modelos de corrector tienes?";
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;
    expect(r.ok).toBe(true);
    expect(c.partes.filter((p) => p.kind === "card")).toHaveLength(3);
  });

  test("“corrector de postura” no cambia el foco, pero “trenza” sí nombra otro SKU", () => {
    expect(nombraAlternativaAlProductoDelAnuncio("Corrector de postura", CATALOGO, 1)).toBe(false);
    expect(nombraAlternativaAlProductoDelAnuncio("Quiero el corrector trenza", CATALOGO, 1)).toBe(true);
    const conZxf = [...CATALOGO, { ...CATALOGO[1]!, id: 4, name: "Corrector de Postura Zxf 25 Eh" }];
    expect(mencionaProductoConcreto("Busco el Zxf", conZxf)).toBe(true);
  });

  test("un lead de anuncio sin SKU identificado no recibe un catálogo entero por una categoría ambigua", async () => {
    const c = ctx();
    c.vieneDeAnuncio = true;
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/producto exacto/);
    expect(c.partes).toEqual([]);
    expect(mencionaProductoConcreto("Corrector de postura", CATALOGO)).toBe(false);
    expect(mencionaProductoConcreto("Corrector de postura trenza", CATALOGO)).toBe(true);
  });

  test("si el lead de anuncio pide explícitamente ver modelos, muestra las opciones", async () => {
    const c = ctx();
    c.vieneDeAnuncio = true;
    c.mensajeDelCliente = "¿Qué otros modelos de corrector tienes?";
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] }) as any;
    expect(r.ok).toBe(true);
    expect(c.partes.filter((p) => p.kind === "card")).toHaveLength(3);
  });

  test("con un solo id no sirve: es para desambiguar dos o más", async () => {
    const c = ctx();
    const r = await ejecutores.mostrar_opciones(c, { productoIds: [1] }) as any;

    assert.equal(r.ok, false);
    assert.match(r.mensaje, /DOS o más/i);
    assert.equal(c.partes.length, 0);
  });

  test("registra cada ficha como enviada para no repetirla después", async () => {
    const c = ctx();
    await ejecutores.mostrar_opciones(c, { productoIds: [1, 2] });

    assert.ok(c.estado.seccionesEnviadas[1]?.info, "el producto 1 quedó marcado con info enviada");
    assert.ok(c.estado.seccionesEnviadas[2]?.info, "el producto 2 quedó marcado con info enviada");
  });

  test("guarda el orden de las opciones para resolver 'el primero/el segundo/este'", async () => {
    const c = ctx();
    await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] });

    assert.deepEqual(c.estado.opcionesMostradas, [1, 2, 3]);
  });

  test("al elegir (enfocar_producto) se limpian las opciones mostradas", async () => {
    const c = ctx();
    await ejecutores.mostrar_opciones(c, { productoIds: [1, 2, 3] });
    await ejecutores.enfocar_producto(c, { productoId: 2 });

    assert.deepEqual(c.estado.opcionesMostradas, []);
    assert.equal(c.estado.productoEnFoco, 2);
  });
});

describe("ordinalDeMensaje (referencia posicional determinística)", () => {
  test("detecta 'el primero / la segunda / el tercero / la cuarta'", () => {
    assert.equal(ordinalDeMensaje("el primero"), 0);
    assert.equal(ordinalDeMensaje("me gusta el primero"), 0);
    assert.equal(ordinalDeMensaje("la segunda"), 1);
    assert.equal(ordinalDeMensaje("el tercero"), 2);
    assert.equal(ordinalDeMensaje("la cuarta"), 3);
  });

  test("detecta 'el 1 / la 2 / número 3'", () => {
    assert.equal(ordinalDeMensaje("el 1"), 0);
    assert.equal(ordinalDeMensaje("la 2"), 1);
    assert.equal(ordinalDeMensaje("número 3"), 2);
  });

  test("no confunde 'en un segundo' ni 'primera vez'", () => {
    assert.equal(ordinalDeMensaje("dame un segundo"), null);
    assert.equal(ordinalDeMensaje("es mi primera vez comprando"), null);
    assert.equal(ordinalDeMensaje("hola"), null);
  });
});
