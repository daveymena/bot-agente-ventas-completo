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
    // El techo NO es un número elegido: sale de tres corridas medidas contra
    // producción, con el MISMO pedido de anuncio.
    //
    //   2.585 tk  ->  ✅ propuso el plan en 134 s
    //   2.867 tk  ->  el tamaño actual
    //   3.474 tk  ->  ❌ ni un plan, y contestó que "las imágenes que
    //                 compartiste eran demasiado grandes y fueron eliminadas"
    //                 -- no había ninguna imagen. Es lo que dice un modelo
    //                 cuando le truncaron el contexto y racionaliza el hueco.
    //   4.197 tk  ->  ❌ colgado, 4+ minutos, sin una sola respuesta
    //
    // 3.000 deja margen sobre lo que hoy cuesta y queda MUY por debajo del
    // primer tamaño que se sabe que falla. Si esto empieza a fallar, la
    // pregunta no es subir el número: es qué se agregó al pedido.
    const t = tokens(buildMcpToolRegistry(CREAR));
    expect(t, `los esquemas de crear un anuncio pesan ~${t} tokens`).toBeLessThan(3000);
  });

  /**
   * La causa raíz de los parámetros inventados.
   *
   * Al modelo se le mandaba, por cada acción de cambio, el nombre y la primera
   * frase de la descripción cortada a 110 caracteres. Nunca el contrato de
   * argumentos. Así que sabía QUÉ podía hacer y jamás CÓMO se llaman los
   * campos: los completaba con lo que le parecía.
   *
   * Medido en producción el 2026-08-28, pidiendo un anuncio a WhatsApp: Atlas
   * propuso `fb_create_ad` con `{ productId: 124, whatsappContact: true }`.
   * `whatsappContact` no existe -- el parámetro real es `objetivo: "mensajes"`.
   *
   * Es la misma causa de la familia de bugs de ids inválidos que volvió tres
   * veces (productId ausente, draftId con un id de Meta de 18 dígitos,
   * productId en 0). Cada una se tapó con una validación nueva; ninguna atacó
   * el motivo por el que el modelo inventaba.
   */
  it("el modelo ve el contrato real de las acciones de su familia", () => {
    const propose: any = buildMcpToolRegistry(CREAR).find((t: any) => t.name === "propose_action");
    const desc = String(propose?.description || "");
    for (const tool of ["crear_anuncio", "fb_create_ad"]) {
      const i = desc.indexOf(`${tool}:`);
      expect(i, `${tool} tiene que estar listado`).toBeGreaterThan(-1);
      const bloque = desc.slice(i, i + 400);
      expect(bloque, `${tool} sin su contrato de args`).toContain("args:");
      // El dato concreto que se estaba inventando.
      expect(bloque, `${tool} no le muestra el parámetro 'objetivo'`).toContain("objetivo");
    }
  });
});

/**
 * Que el modelo no pueda elegir la herramienta que pierde el destino.
 *
 * Medido en producción el 2026-08-28 con "publicá un anuncio, que me escriban
 * por WhatsApp": Atlas eligió `fb_ad_draft`. Esa herramienta solo guarda el
 * texto y NO acepta `objetivo`, así que la campaña habría salido de ventas a
 * la web -- el fallo que el admin viene reportando.
 *
 * Las dos herramientas suenan igual de razonables para "hacé un anuncio", así
 * que la solución no es pedirle al modelo que elija bien: es no ofrecerle la
 * que no sirve, y redirigirlo si igual la propone.
 */
describe("Publicar un anuncio pasa por la herramienta que acepta el objetivo", () => {
  it("fb_ad_draft no se le ofrece al modelo", async () => {
    const propose: any = buildMcpToolRegistry("publica un anuncio en Facebook a WhatsApp").find(
      (t: any) => t.name === "propose_action",
    );
    const desc = String(propose?.description || "");
    expect(desc).not.toContain("fb_ad_draft:");
    // Pero la que SÍ sirve tiene que estar, o se queda sin forma de crear.
    expect(desc).toContain("crear_anuncio:");
  });

  it("si igual la propone, se lo redirige en vez de fallar", async () => {
    const { buildMcpToolRegistry: build } = await import("../opencode-mcp-tools");
    const propose: any = build("publica un anuncio").find((t: any) => t.name === "propose_action");
    const r = await propose.handler(
      { tool: "fb_ad_draft", args: { productId: 124, primaryText: "hola" } },
      { tenantId: 1, turnId: "t1" } as any,
    );
    expect(r.ok).toBe(false);
    // El mensaje tiene que decirle QUÉ usar y CÓMO, no solo que no.
    expect(r.summary).toContain("crear_anuncio");
    expect(r.summary).toContain("objetivo");
  });
});

/**
 * El presupuesto se vigilaba SOLO para el pedido de anuncios, y ese resultó
 * ser el barato.
 *
 * Medido el 2026-09-06: "cómo van las ventas hoy" pesaba 3.895 tokens contra
 * los 2.493 de crear un anuncio. La consulta más simple era la más cara, y
 * quedaba por encima de los 3.474 con los que el modelo alucinó en producción
 * ("las imágenes que compartiste eran demasiado grandes" -- no había ninguna).
 *
 * La causa: no existía familia de métricas, así que caía en "no reconozco de
 * qué habla, mandá todo". Nadie lo vio porque ningún test lo miraba.
 */
describe("ningún tipo de pedido se pasa del presupuesto", () => {
  const PEDIDOS: Array<[string, string]> = [
    ["ventas del día", "cómo van las ventas hoy"],
    ["facturación", "cuánto facturé este mes"],
    ["resumen del negocio", "dame un resumen del negocio"],
    ["producto", "subí el precio del curso de piano"],
    ["configurar el bot", "cambiá el tono del agente de whatsapp"],
    ["saludo suelto", "hola"],
    // El caso "no reconozco de qué habla": manda todo a propósito, y aun así
    // tiene que entrar. Si esto se pasa, el problema es el tamaño de base.
    ["sin familia", "xyzabc qwerty"],
  ];

  for (const [nombre, pedido] of PEDIDOS) {
    it(`"${nombre}" entra en el minuto de Groq`, () => {
      const t = tokens(buildMcpToolRegistry(pedido));
      expect(t, `"${pedido}" pesa ~${t} tokens`).toBeLessThan(3000);
    });
  }
});
