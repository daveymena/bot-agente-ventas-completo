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

/**
 * Crear un anuncio y analizar campañas eran UN grupo de 17 herramientas.
 *
 * Medido contra producción el 2026-08-28: el pedido de lectura (2.019 tokens
 * de esquemas) se resolvía correcto en 60 s, y el de anuncio (4.197) se colgó
 * pasados los 4 minutos sin proponer nada. La diferencia entre los dos es lo
 * que entra y lo que no entra en los 8.000 tokens por minuto de Groq --
 * el único proveedor vivo -- una vez que se suman lo que OpenCode reserva para
 * la respuesta, el system, el catálogo y la conversación.
 *
 * "Publicá este anuncio" no necesita métricas, atribución, diagnóstico,
 * biblioteca de anuncios ni logs: eso es analizar, no crear.
 */
describe("Crear un anuncio no arrastra las herramientas de analizarlo", () => {
  const CREAR = "publica un anuncio en Facebook del curso de piano a WhatsApp con presupuesto 20000 al dia";
  const ANALIZAR = "como va mi campana de Facebook, dame las metricas";

  it("el pedido de CREAR no trae las de análisis", () => {
    const nombres = buildMcpToolRegistry(CREAR).map((t: any) => t.name);
    for (const analitica of ["fb_campaign_metrics", "marketing_attribution", "marketing_diagnostico", "fb_ad_library", "fb_agent_logs"]) {
      expect(nombres, `${analitica} no hace falta para crear`).not.toContain(analitica);
    }
  });

  it("pero sí trae lo que de verdad usa para crear", () => {
    // Perder una herramienta es peor que un prompt largo: si esto se recorta
    // de más, Atlas no puede ni comprobar si Facebook está conectado.
    const nombres = buildMcpToolRegistry(CREAR).map((t: any) => t.name);
    for (const necesaria of ["fb_status", "fb_pixel_status", "fb_suggest_audience", "fb_list_drafts", "list_products", "propose_action"]) {
      expect(nombres, necesaria).toContain(necesaria);
    }
  });

  it("el pedido de ANALIZAR sí trae las métricas", () => {
    const nombres = buildMcpToolRegistry(ANALIZAR).map((t: any) => t.name);
    expect(nombres).toContain("fb_campaign_metrics");
    expect(nombres).toContain("marketing_attribution");
  });

  it("pedir las dos cosas trae las dos mitades", () => {
    // "¿cómo va mi campaña y creá otra?" matchea los dos grupos: la unión es
    // lo correcto, no la intersección.
    const nombres = buildMcpToolRegistry("como va mi campana y crea otra nueva").map((t: any) => t.name);
    expect(nombres).toContain("fb_campaign_metrics");
    expect(nombres).toContain("fb_suggest_audience");
  });

  it("el pedido de crear entra en el presupuesto de un minuto de Groq", () => {
    // Con lo que OpenCode reserva para la respuesta (4.000) más el system, el
    // perfil del negocio, el catálogo y la conversación, los esquemas no
    // pueden pasar de ~2.800 si el turno tiene que entrar en 8.000/min.
    const t = tokens(buildMcpToolRegistry(CREAR));
    expect(t, `los esquemas de crear un anuncio pesan ~${t} tokens`).toBeLessThan(2800);
  });
});
