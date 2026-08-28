import { describe, it, expect } from "vitest";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";
import { READ_ONLY_TOOLS } from "../app-operator";

/**
 * El filtro de herramientas del puente MCP tiene que FILTRAR de verdad.
 *
 * Historia: `NUCLEO` arrancaba con `...READ_ONLY_TOOLS`, y como
 * `buildMcpToolRegistry` filtra las de lectura POR ese núcleo, el filtro se
 * anulaba a sí mismo. Los GRUPOS no agregaban nada (ya estaban todos) y
 * GENERAL_EXTRA tampoco. Cada pedido recibía el paquete completo.
 *
 * Medido el 2026-08-28, antes del arreglo:
 *
 *   "publicá un anuncio en Facebook..."  46 tools, 6.414 tokens
 *   "cuántos productos tengo"            46 tools, 6.414 tokens  ← idéntico
 *
 * Lo que lo hace peligroso es que el código se LEÍA como si filtrara: había
 * grupos, patrones, un respaldo general y comentarios explicando el ahorro.
 * Todo correcto y todo muerto por un spread. El recorte hermano de
 * `buildToolsDoc` (commit fb29755) sí funcionaba, así que las mediciones de
 * "ya lo arreglamos" daban bien mirando la ruta equivocada.
 *
 * Por eso estas pruebas miran el TAMAÑO del resultado, no la forma del código.
 */

const tokens = (reg: any[]) =>
  Math.round(
    JSON.stringify(reg.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })))
      .length / 4,
  );

describe("El filtro de herramientas del puente MCP", () => {
  it("un pedido simple recibe MENOS herramientas que uno de anuncios", () => {
    const simple = buildMcpToolRegistry("cuantos productos tengo");
    const anuncio = buildMcpToolRegistry(
      "publica un anuncio en Facebook del curso de piano con presupuesto 20000 al dia",
    );
    // El síntoma exacto del bug: los dos daban 46. No se fija un número
    // (crecerá con el catálogo de herramientas), se fija la RELACIÓN.
    expect(simple.length).toBeLessThan(anuncio.length);
  });

  it("ningún pedido recibe TODAS las herramientas de lectura", () => {
    // La comprobación que habría cazado el spread. Si alguien vuelve a meter
    // `...READ_ONLY_TOOLS` en el núcleo, esto falla acá y no en producción.
    const totalLectura = [...READ_ONLY_TOOLS].length;
    for (const pedido of [
      "cuantos productos tengo",
      "como esta el sistema",
      "investiga que hace la competencia",
      "crea un agente de dropshipping",
      "publica un anuncio en Facebook",
    ]) {
      expect(buildMcpToolRegistry(pedido).length, pedido).toBeLessThan(totalLectura);
    }
  });

  it("el pedido de anuncio entra en el tope por minuto de Groq", () => {
    // Groq corta en 8.000 tokens POR MINUTO. Los esquemas son solo una parte:
    // después hay que meter el system, el perfil del negocio, el catálogo y la
    // conversación. Si los esquemas solos se comen la mitad, no entra nada más
    // y el turno se cae al modelo chico -- que es el que inventa.
    const t = tokens(buildMcpToolRegistry("publica un anuncio en Facebook del curso de piano"));
    expect(t, `los esquemas del pedido de anuncio pesan ~${t} tokens`).toBeLessThan(4500);
  });

  it("propose_action viaja SIEMPRE: sin ella Atlas no puede proponer nada", () => {
    // Es la única puerta de escritura. Filtrar de más nunca puede dejarlo
    // mudo: perder una herramienta de lectura se recupera preguntando, perder
    // esta lo deja sin poder actuar.
    for (const pedido of ["cuantos productos tengo", "como esta el sistema", "xyzzy"]) {
      const nombres = buildMcpToolRegistry(pedido).map((t: any) => t.name);
      expect(nombres, pedido).toContain("propose_action");
    }
  });

  it("sin pedido real se mandan todas: ante la duda, no dejarlo sin herramientas", () => {
    // El respaldo deliberado. Perder una herramienta es peor que un prompt
    // largo, así que cuando no hay pista el recorte se apaga.
    const sinPista = buildMcpToolRegistry("");
    const conPista = buildMcpToolRegistry("cuantos productos tengo");
    expect(sinPista.length).toBeGreaterThan(conPista.length);
  });
});
