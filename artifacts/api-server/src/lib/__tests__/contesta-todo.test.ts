import { describe, it, expect } from "vitest";
import { preguntasSueltas, contienePregunta } from "../estado-cognitivo";

/**
 * El cliente pregunta tres cosas y el bot contesta una.
 *
 * Es el defecto que más rondas de QA lleva sin moverse, y el admin volvió a
 * pedirlo el 2026-09-01: *"el sistema debe estar preparado para desmenuzar
 * cada pregunta y dar respuesta"*.
 *
 * Había DOS mecanismos escritos para esto --el aviso al modelo antes de
 * escribir, y la revisión del supervisor después-- y un tercer camino que los
 * saltaba a los dos: el atajo de respuestas verificadas (`hardcoded_detail`)
 * contesta al instante y hace `return` ahí mismo, sin mirar el resto del
 * mensaje. Perfecto para "¿trae certificado?", desastroso para "¿trae
 * certificado y cuánto vale?".
 *
 * Ahora ese atajo se desactiva cuando hay dos o más preguntas. Esta prueba
 * cuida al detector del que depende esa decisión.
 */

describe("desmenuzar el mensaje en preguntas", () => {
  const CASOS: Array<[string, number]> = [
    ["¿trae certificado y cuánto vale?", 2],
    ["cuánto vale? tiene garantía? y cómo me llega?", 3],
    ["hola, me interesa el de piano, cuánto cuesta y qué incluye", 2],
  ];

  for (const [mensaje, minimo] of CASOS) {
    it(`"${mensaje.slice(0, 40)}…" se parte en ${minimo} o más`, () => {
      expect(preguntasSueltas(mensaje).length, mensaje).toBeGreaterThanOrEqual(minimo);
    });
  }

  it("una sola pregunta NO se parte: ahí el atajo sigue sirviendo", () => {
    // Importa tanto como lo otro: si una pregunta simple se contara como dos,
    // se perdería la respuesta instantánea en el caso más común.
    for (const uno of ["¿trae certificado?", "cuánto vale", "tiene garantía?"]) {
      expect(preguntasSueltas(uno).length, uno).toBeLessThan(2);
    }
  });

  it("un saludo no llega a contar como dos", () => {
    // `preguntasSueltas` es un PARTIDOR, no un detector: con un solo tema
    // devuelve el mensaje entero como una unidad. Eso está bien para el
    // supervisor, y para el atajo lo único que importa es que no cuente dos --
    // si contara de más, se perdería la respuesta instantánea sin motivo.
    expect(preguntasSueltas("hola buenas tardes").length).toBeLessThan(2);
    expect(contienePregunta("hola buenas tardes")).toBe(false);
  });

  it("reconoce preguntas sin signo, que es como escribe la gente", () => {
    expect(contienePregunta("cuanto vale")).toBe(true);
    expect(contienePregunta("tienes envio a medellin")).toBe(true);
  });
});
