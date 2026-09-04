/**
 * "No tengo ese producto" sobre productos que SÍ tiene.
 *
 * Medido contra producción el 2026-09-04 con el agente completo:
 *
 *   cliente: "¿cuál es la diferencia real entre el curso de marketing digital
 *             y el de desarrollo web?"
 *   bot:     "Hmm, creo que no tengo ese producto en el catálogo 😅. Lo que sí
 *             manejo es: INGLES, MARKETING DIGITAL, FX PREMIERE,
 *             DESARROLLO WEB, ..."
 *
 * Niega los dos y los lista en la misma frase. Pasa porque el candado
 * anti-invento se dispara con `productSearchFailed`, que significa "no pude
 * resolver UN producto" -- y nombrar DOS para compararlos también falla.
 */
import { describe, it, expect } from "vitest";
import { productosNombrados, negarloSeriaMentira, elegirPorNombre } from "../nombra-productos-reales";

/** El catálogo real del negocio que se sondeó. */
const CATALOGO = [
  { name: "INGLES" },
  { name: "MARKETING DIGITAL" },
  { name: "FX PREMIERE" },
  { name: "DESARROLLO WEB" },
  { name: "EXPEDIENTES OBRAS RESIDENTE DE OBRAS" },
];

describe("qué productos nombró el cliente", () => {
  /** EL CASO. Los dos existen y estaban en la pregunta. */
  it("reconoce los dos productos de una comparación", () => {
    const r = productosNombrados(
      "cual es la diferencia real entre el curso de marketing digital y el de desarrollo web?",
      CATALOGO,
    );
    expect(r).toContain("MARKETING DIGITAL");
    expect(r).toContain("DESARROLLO WEB");
    expect(negarloSeriaMentira("cual es la diferencia entre marketing digital y desarrollo web", CATALOGO)).toBe(true);
  });

  it("reconoce uno solo, con acentos y mayúsculas de por medio", () => {
    expect(productosNombrados("me interesa el de Inglés", CATALOGO)).toEqual(["INGLES"]);
  });

  /**
   * LO QUE NO PUEDE PASAR: apagar el candado que existe para atajar productos
   * inventados. Medido en vivo el 2026-08-23 -- el cliente pidió "el de
   * pastas" y el bot fabricó un curso de cocina con detalles falsos.
   */
  it("un producto que NO existe no cuenta como nombrado", () => {
    expect(productosNombrados("tenés el de pastas?", CATALOGO)).toEqual([]);
    expect(negarloSeriaMentira("tenés el de pastas?", CATALOGO)).toBe(false);
  });

  /**
   * Y el otro extremo: una palabra suelta no alcanza. Con "alguna palabra"
   * bastaría decir "web" para dar por nombrados DESARROLLO WEB, DISEÑO WEB y
   * HOSTING WEB -- tres productos distintos por una palabra.
   */
  it("una palabra suelta del nombre no alcanza", () => {
    const catalogo = [{ name: "DESARROLLO WEB" }, { name: "DISENO WEB" }];
    expect(productosNombrados("quiero algo web", catalogo)).toEqual([]);
  });

  /**
   * Las palabras que aparecen en medio catálogo no identifican nada. Sin esto,
   * decir "curso" daría por nombrado cualquier producto y el candado
   * anti-invento quedaría apagado justo para el caso que viene a atajar.
   */
  it("las palabras genéricas no nombran a nadie", () => {
    expect(productosNombrados("quiero un curso completo", [{ name: "CURSO COMPLETO" }])).toEqual([]);
    expect(productosNombrados("busco un producto premium", [{ name: "PRODUCTO PREMIUM" }])).toEqual([]);
  });

  it("aguanta el plural del cliente", () => {
    expect(productosNombrados("tenés cursos de ingles?", CATALOGO)).toContain("INGLES");
  });

  it("no rompe con catálogo vacío ni mensaje vacío", () => {
    expect(productosNombrados("", CATALOGO)).toEqual([]);
    expect(productosNombrados("hola", [])).toEqual([]);
    expect(productosNombrados("hola", [null as any, { name: null }])).toEqual([]);
  });
});

/**
 * "Hay varios productos que encajan": el bot preguntando lo obvio.
 *
 * Medido contra producción el 2026-09-04. El admin pidió el anuncio del "curso
 * de inteligencia artificial" y la creación se frenó con dos candidatos --uno
 * que se llama exactamente así, y otro que solo menciona "inteligencia" en su
 * descripción--. El buscador miraba nombre y descripción con el mismo peso.
 */
describe("cuando varios encajan, gana el del nombre", () => {
  const CANDIDATOS = [
    { id: 92, name: "PSICOLOGIA PROFESIONAL" },
    { id: 124, name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTONOMOS" },
  ];

  it("EL CASO: elige el que se llama así", () => {
    const r = elegirPorNombre("curso de inteligencia artificial", CANDIDATOS);
    expect(r?.id).toBe(124);
  });

  /** "curso" es genérica y no debe pesar. */
  it("las palabras genéricas no deciden", () => {
    expect(elegirPorNombre("el curso", CANDIDATOS)).toBeNull();
  });

  /**
   * LO QUE NO PUEDE PASAR: adivinar cuando la duda es real. Este catálogo tiene
   * cuatro productos con "MARKETING" en el nombre y dos con nombre idéntico y
   * distinto precio.
   */
  it("con dos que se llaman igual, se sigue preguntando", () => {
    const ambiguos = [
      { id: 114, name: "MARKETING DIGITAL" },
      { id: 73, name: "PACK MARKETING DIGITAL" },
    ];
    expect(elegirPorNombre("marketing digital", ambiguos)).toBeNull();
  });

  it("si ninguno lo tiene en el nombre, no inventa", () => {
    expect(elegirPorNombre("curso de pastelería", CANDIDATOS)).toBeNull();
  });

  it("no rompe con lista vacía", () => {
    expect(elegirPorNombre("lo que sea", [])).toBeNull();
  });
});
