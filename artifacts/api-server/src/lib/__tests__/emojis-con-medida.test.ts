import { describe, it, expect } from "vitest";
import { medirEmojis, conEmojisMedidos } from "../emojis-con-medida";

const cuantos = (t: string) => (t.match(/\p{Extended_Pictographic}/gu) || []).length;

/**
 * Medido sobre 109 mensajes del bot en produccion el 2026-09-01:
 * promedio 1,6 emojis (bien), pero 11 mensajes con 5 o mas y 5 repitiendo el
 * mismo tres veces. El peor: 8 emojis en 76 palabras.
 */

describe("Los mensajes que ya estaban bien no se tocan", () => {
  it("una frase corta con uno o dos emojis queda igual", () => {
    for (const t of [
      "¡Buena elección! 🙌 ¿Qué te gustaría lograr?",
      "Claro que sí 😊",
      "El curso va de cero a avanzado.",
      "",
    ]) {
      expect(conEmojisMedidos(t), t).toBe(t);
    }
  });

  it("un dato por línea con su emoji es el formato correcto", () => {
    const ficha = [
      "🎬 19 módulos en video",
      "🎵 Repertorio de valses y baladas",
      "🎻 Técnicas de acompañamiento",
    ].join("\n");
    expect(conEmojisMedidos(ficha)).toBe(ficha);
  });
});

describe("Lo que se riega se recorta", () => {
  it("no deja más de un emoji por línea", () => {
    const r = medirEmojis("¡Perfecto! 🎹✨🔥 Te cuento del curso");
    expect(cuantos(r.texto)).toBe(1);
    expect(r.quitados).toBe(2);
    expect(r.texto).toContain("🎹"); // se queda el PRIMERO, que es el que ancla
    expect(r.texto).not.toContain("✨");
  });

  it("no deja el mismo emoji tres veces", () => {
    const r = medirEmojis("Genial 🙌\nBuenísimo 🙌\nExcelente 🙌\nPerfecto 🙌");
    expect(cuantos(r.texto)).toBe(2);
  });

  it("recorta el peor caso real de producción", () => {
    const peor = "¡Perfecto, Duvier! 🎹 Te paso los datos 😊✨\n✅ 19 módulos 🔥\n✅ Partituras 💯\n💰 Acceso de por vida 🙌";
    const r = medirEmojis(peor);
    expect(cuantos(peor)).toBeGreaterThan(4); // el mensaje entra regado
    expect(cuantos(r.texto)).toBeLessThanOrEqual(4);
    expect(r.quitados).toBeGreaterThan(0);
  });

  it("una frase de una sola línea nunca pasa de dos", () => {
    const r = medirEmojis("Hola 😊 qué tal 👋 todo bien 🙌 por acá 🔥");
    expect(cuantos(r.texto)).toBeLessThanOrEqual(2);
  });
});

describe("No rompe el texto al recortar", () => {
  it("no deja espacios dobles ni espacios antes de un signo", () => {
    const r = medirEmojis("Claro 😊✨, te cuento 🙌🔥.");
    expect(r.texto).not.toMatch(/ {2,}/);
    expect(r.texto).not.toMatch(/ [,.;:!?]/);
  });

  it("conserva todas las palabras", () => {
    const t = "¡Perfecto! 🎹✨🔥 Te cuento del curso completo de piano";
    const palabras = (s: string) => (s.replace(/\p{Extended_Pictographic}/gu, "").match(/\p{L}+/gu) || []).join(" ");
    expect(palabras(medirEmojis(t).texto)).toBe(palabras(t));
  });

  it("conserva los saltos de línea", () => {
    const t = "🎬 uno 🔥\n🎵 dos ✨\n🎻 tres 💯";
    expect(medirEmojis(t).texto.split("\n")).toHaveLength(3);
  });

  it("no toca un texto sin emojis", () => {
    const t = "El curso cuesta $60.000 COP y el acceso es de por vida.";
    expect(conEmojisMedidos(t)).toBe(t);
  });
});

/**
 * ============================================================
 * LA LISTA QUE LLEGO COJA A UN CLIENTE
 * ============================================================
 *
 * Produccion, 2026-09-05 11:58. El dueno lo reenvio desde su WhatsApp.
 */
describe("una lista no es prosa: la viñeta se respeta", () => {
  // TEXTUAL del mensaje que salio, con los ✅ que todavia tenia.
  const LISTA = [
    "✅ Clases paso a paso para principiantes absolutos",
    "✅ Técnica, lectura de partituras y teoría musical",
    "✅ Ejercicios prácticos para ambas manos",
    "✅ Repertorio de canciones de distintos géneros",
    "✅ Acceso de por vida al material",
  ].join("\n");

  it("los cinco ítems conservan su viñeta", () => {
    // Antes caian el 3o, 4o y 5o por MAX_REPETIDO y por el techo de 4.
    const r = medirEmojis(LISTA);
    expect(r.texto.split("\n").filter((l) => l.startsWith("✅"))).toHaveLength(5);
  });

  it("ningún renglón arranca con un espacio huérfano", () => {
    // Es lo que el cliente veia: " Ejercicios prácticos".
    for (const linea of medirEmojis(LISTA).texto.split("\n")) {
      expect(linea).not.toMatch(/^[ \t]/);
    }
  });

  it("no se pierde el texto de ningún ítem", () => {
    const r = medirEmojis(LISTA);
    for (const t of ["Clases paso a paso", "Técnica", "Ejercicios", "Repertorio", "Acceso de por vida"]) {
      expect(r.texto).toContain(t);
    }
  });

  it("dentro del renglón lo que sobra se sigue quitando", () => {
    // La exención es SOLO para la viñeta que abre; el adorno del final no.
    // La viñeta ocupa el único cupo del renglón (MAX_POR_LINEA = 1), así que
    // el adorno de adentro cae entero. La exención es solo para la viñeta.
    const r = medirEmojis("✅ Clases 🎹🎹🎹 desde cero\n✅ Técnica\n✅ Repertorio");
    expect(r.texto.split("\n")[0]).toBe("✅ Clases desde cero");
  });

  it("dos renglones NO son una lista: sigue midiéndose como prosa", () => {
    // Con dos, el patron no esta establecido y el tope de prosa debe mandar.
    const r = medirEmojis("🎹 Hola 🎹 qué tal 🎹 mirá 🎹 esto 🎹 acá 🎹 más");
    expect((r.texto.match(/🎹/gu) || []).length).toBeLessThanOrEqual(2);
  });

  it("la prosa suelta no cambió de comportamiento", () => {
    const r = medirEmojis("¡Hola! 😊 Te cuento que el curso es completo 😊 y bueno 😊 de verdad 😊");
    expect((r.texto.match(/😊/gu) || []).length).toBeLessThanOrEqual(2);
  });
});
