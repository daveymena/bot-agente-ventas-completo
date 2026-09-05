/**
 * El prompt de Atlas no puede viajar entero siempre.
 *
 * Medido contra el contenedor real de OpenCode el 2026-09-05:
 *
 *   llamada trivial (48 tokens)            ~2 s
 *   SOLO el prompt, sin herramientas      ~30 s
 *   pedido real completo (21.500 tokens)  13 s … +175 s
 *
 * Treinta segundos solo en LEER el prompt, sin ejecutar una herramienta. Y el
 * dato que lo confirma: un pedido de 52 s generó 183 tokens de salida -- el
 * tiempo no se va escribiendo, se va leyendo lo que le mandamos.
 *
 * El puente no era el problema: registrar, crear sesión y listar proveedores
 * suman 3,2 s medidos. Por eso cambiar OpenCode por otro no habría servido.
 *
 * ⚠️ Y una honestidad necesaria: la GANANCIA EN SEGUNDOS no se pudo demostrar,
 * porque el modelo primario (deepseek-v4-flash) es tan errático que la misma
 * carga idéntica dio 13 s y 175 s en corridas consecutivas. Lo que sí está
 * medido y es indiscutible es el tamaño: 30.014 -> 16.363 caracteres. Menos
 * entrada nunca es peor; que hoy no se note es un problema del modelo, no de
 * esta optimización.
 */
import { describe, it, expect } from "vitest";
import { promptDeAtlas, ATLAS_NUCLEO, ATLAS_SYSTEM_PROMPT_V2 } from "../app-operator";

/** El prompt completo, sin las marcas de sección. */
const COMPLETO = ATLAS_SYSTEM_PROMPT_V2.replace(/^@@SECCION:[a-z]+@@$/gm, "");

describe("lo que no se negocia viaja siempre", () => {
  it.each([
    "hola",
    "",
    "cualquier cosa rarísima que nadie escribiría",
    "crea un anuncio",
  ])("el núcleo está presente para: %s", (pedido) => {
    expect(promptDeAtlas(pedido)).toContain(ATLAS_NUCLEO);
  });

  /**
   * Recortar la identidad o las reglas que no se negocian para ganar segundos
   * sería cambiar tiempo por que Atlas haga algo que no debe.
   */
  it("nunca devuelve menos que el núcleo", () => {
    expect(promptDeAtlas("hola").length).toBeGreaterThanOrEqual(ATLAS_NUCLEO.length);
  });

  it("las marcas de sección no llegan al modelo", () => {
    expect(promptDeAtlas("crea un anuncio con imagen")).not.toContain("@@SECCION");
  });
});

describe("preguntar no arrastra las reglas de escribir", () => {
  /**
   * ⚠️ Estos son los casos que la PRIMERA versión resolvía mal. Listaba
   * sustantivos sueltos, así que "¿cuántos productos tengo?" arrastraba las
   * reglas de copywriting y "¿cómo va mi campaña?" arrastraba además los 6.087
   * caracteres de reglas de imagen para Facebook. Las dos son lecturas: no van
   * a escribir nada, y son justo los pedidos que deberían ser instantáneos.
   */
  it.each([
    "hola, cómo vas?",
    "por qué no responde el bot?",
    "cuántos productos tengo cargados?",
    "cuál es mi producto más vendido?",
    "mostrame las ventas de la semana",
    "activá la campaña del piano",
  ])("es una consulta y pesa menos de la mitad: %s", (pedido) => {
    const armado = promptDeAtlas(pedido);
    expect(armado.length, `"${pedido}" no se aligeró`).toBeLessThan(COMPLETO.length * 0.6);
  });
});

describe("escribir sí trae lo que hace falta", () => {
  /** Un anuncio necesita marketing Y las reglas de imagen: recibe casi todo. */
  it("crear un anuncio trae marketing y las reglas de imagen", () => {
    const p = promptDeAtlas("crea un anuncio del curso de piano");
    expect(p.length).toBeGreaterThan(COMPLETO.length * 0.9);
  });

  it("una pieza visual trae las reglas de imagen aunque no diga 'creá'", () => {
    expect(promptDeAtlas("cambiale la imagen al anuncio").length).toBeGreaterThan(COMPLETO.length * 0.9);
  });

  /**
   * Mejorar un copy necesita las reglas de escritura, pero NO las de imagen:
   * queda en el medio, que es lo correcto.
   */
  it("mejorar un copy trae marketing pero no las de imagen", () => {
    const p = promptDeAtlas("mejora el copy de la descripción");
    expect(p.length).toBeGreaterThan(COMPLETO.length * 0.6);
    expect(p.length).toBeLessThan(COMPLETO.length * 0.9);
  });

  /** Y una pregunta de métricas trae el bloque de métricas, que es chico. */
  it("una pregunta de resultados trae el bloque de métricas", () => {
    expect(promptDeAtlas("cómo va mi campaña?").length).toBeGreaterThan(promptDeAtlas("hola").length);
  });
});

describe("las cuatro partes suman el prompt entero", () => {
  /**
   * Si una sección quedara huérfana --sin marca o con una marca mal escrita--
   * su contenido se perdería en silencio y Atlas dejaría de saber algo sin que
   * nadie se entere. Esta prueba lo impide.
   */
  it("nada se pierde al partirlo", () => {
    const todo = promptDeAtlas("crea un anuncio con imagen, mejora el copy y mostrame las métricas");
    const sinEspacios = (s: string) => s.replace(/\s+/g, "");

    // Se compara el TAMAÑO y no la igualdad exacta, porque el orden cambia a
    // propósito: el núcleo está partido en dos tramos del archivo (identidad y
    // principios arriba, tono y herramientas más abajo) y al re-armar quedan
    // juntos. Lo que no puede pasar es que se PIERDA texto.
    expect(sinEspacios(todo).length).toBe(sinEspacios(COMPLETO).length);
  });

  /** Y cada bloque tiene que aparecer entero, no a medias. */
  it.each([
    ["identidad", "Te llamas Atlas"],
    ["las 6 reglas", "LAS 6 REGLAS QUE NO SE NEGOCIAN"],
    ["principios", "PRINCIPIOS OBLIGATORIOS"],
    ["precios", "PRECIOS CON PSICOLOGÍA"],
    ["métricas", "ANÁLISIS CON MÉTRICAS QUE IMPORTAN"],
    ["tono", "TONO PROFESIONAL EN TODA RESPUESTA"],
    ["imágenes", "IMÁGENES — REGLAS DE CALIDAD PARA FACEBOOK ADS"],
  ])("con todo pedido junto, sigue estando: %s", (_nombre, marca) => {
    expect(promptDeAtlas("crea un anuncio con imagen, mejora el copy y mostrame las métricas")).toContain(marca);
  });
});

/**
 * ⚠️ LA OPTIMIZACIÓN ROMPIÓ EL ARREGLO DEL EMOJI. Mismo día, dos horas.
 *
 * Se armó el prompt por pedido para ahorrar 45% de lectura, y el filtro de
 * marketing buscaba la palabra `copy`. El admin escribe **"copi"** --su forma
 * habitual, en todos sus mensajes-- así que el bloque de marketing NO viajaba,
 * y con él se quedaba afuera la regla de "usá el emoji del catálogo".
 *
 * Resultado: el arreglo del emoji, que había costado cuatro intentos, dejó de
 * aplicarse justo en los pedidos de copy. El admin lo vio enseguida: "siguió
 * respondiendo igual".
 *
 * Medido antes del arreglo:
 *
 *     "dame el copy"  →  24.396 car, CON la regla
 *     "dame el copi"  →  16.363 car, SIN la regla
 *
 * La lección es más grande que el typo: este admin escribe rápido y con
 * errores --"emgi", "ledmgible", "anucio"-- y una lista de palabras exactas le
 * falla JUSTO cuando está apurado. Por eso los mensajes de acá abajo son
 * TEXTUALES, con sus errores incluidos: son los que de verdad llegan.
 */
describe("los mensajes REALES del admin, con sus typos", () => {
  const REGLA = "EL EMOJI DE CADA ÍTEM SALE DEL CATÁLOGO";

  it.each([
    "Primero dame el copi q es lo que re pregunte sin tata cosa",
    "Vuelve a generar me otro copi mas bonito y profundo y real",
    "Créame el copi basado en la información real buscado el dolor y la solución buen uso de emgi",
    "dame el copy",
    "necesito un anucio para el curso",
    "mejorá los emgi del anuncio",
  ])("trae las reglas de escritura: %s", (pedido) => {
    expect(promptDeAtlas(pedido)).toContain(REGLA);
  });

  /** Y el ahorro sigue: una consulta no arrastra las reglas de escribir. */
  it.each(["hola", "cuantos productos tengo?", "por que no responde el bot"])(
    "pero una consulta sigue liviana: %s",
    (pedido) => {
      expect(promptDeAtlas(pedido)).not.toContain(REGLA);
    },
  );
});
