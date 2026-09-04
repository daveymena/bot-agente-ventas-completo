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
