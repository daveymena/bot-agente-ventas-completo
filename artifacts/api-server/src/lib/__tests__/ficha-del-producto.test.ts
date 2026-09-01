import { describe, it, expect } from "vitest";
import { leerFicha } from "../ficha-del-producto";

/**
 * Datos REALES de produccion, copiados tal cual de la base el 2026-09-01.
 * Si estas pruebas pasan con inventos, no prueban nada.
 */

const PIANO_NOMBRE = "Curso de Piano Completo: De Cero a Nivel Avanzado";
const PIANO_DESC = [
  "🎹 CURSO COMPLETO DE PIANO — DE CERO A AVANZADO",
  "",
  "Aprendé a tocar piano paso a paso, desde los fundamentos hasta las técnicas avanzadas, a tu propio ritmo. Ideal para principiantes, intermedios y avanzados, para todas las edades.",
  "",
  "📚 QUÉ VAS A APRENDER",
  "",
  "🎹 Tocar piano: independencia y coordinación de ambas manos, lectura de partituras y dominio del instrumento, desde cero hasta nivel avanzado.",
  "",
  "📦 QUÉ INCLUYE",
  "",
  "🎬 19 módulos en video con teoría y lenguaje musical, lectura rítmica, fraseo y expresión.",
  "",
  "🎵 Repertorio: 5 valses de Alberto Martínez, baladas, pop, blues y jazz, e improvisación con progresiones y escalas.",
  "",
  "🎻 Técnicas de acompañamiento y música clásica moderna.",
  "",
  "📱 Estudiá desde tu celular o computador, donde quieras.",
  "",
  "📩 Escríbenos para empezar hoy mismo. 🚀",
].join("\n");

describe("Leer la ficha que el dueño ya escribió", () => {
  const ficha = leerFicha(PIANO_DESC, PIANO_NOMBRE);

  it("toma el emoji del producto de su propio título", () => {
    // Antes se adivinaba con una tabla de palabras. El producto ya lo traía.
    expect(ficha.emoji).toBe("🎹");
  });

  it("descarta el título, porque la tarjeta ya lo pone arriba", () => {
    // Este era el defecto visible: el nombre salía dos veces seguidas.
    expect(ficha.intro).not.toMatch(/CURSO COMPLETO DE PIANO/i);
    expect(ficha.puntos.some((p) => /CURSO COMPLETO DE PIANO/i.test(p.texto))).toBe(false);
  });

  it("conserva el párrafo de presentación entero, sin cortarlo a la mitad", () => {
    expect(ficha.intro).toMatch(/^Aprendé a tocar piano paso a paso/);
    expect(ficha.intro).toMatch(/para todas las edades\.$/);
  });

  it("usa los emojis que el dueño le puso a cada línea", () => {
    const emojis = ficha.puntos.map((p) => p.emoji);
    // Los suyos: 🎹 🎬 🎵 🎻 📱 — no dos 🎼 repetidos de una tabla.
    expect(emojis).toEqual(["🎹", "🎬", "🎵", "🎻", "📱"]);
  });

  it("mantiene el orden y el texto tal como los escribió", () => {
    expect(ficha.puntos[1]).toEqual({
      emoji: "🎬",
      texto: "19 módulos en video con teoría y lenguaje musical, lectura rítmica, fraseo y expresión.",
    });
    expect(ficha.puntos[2].texto).toMatch(/5 valses de Alberto Martínez/);
  });

  it("descarta los rótulos de sección, que en WhatsApp solo ocupan renglón", () => {
    const textos = ficha.puntos.map((p) => p.texto);
    expect(textos).not.toContain("QUÉ VAS A APRENDER");
    expect(textos).not.toContain("QUÉ INCLUYE");
  });

  it("descarta el «escríbenos», que en WhatsApp ya está escribiendo", () => {
    expect(ficha.puntos.some((p) => /escríbenos/i.test(p.texto))).toBe(false);
  });
});

describe("Otros formatos de descripción", () => {
  it("una descripción sin estructura no devuelve puntos, y el llamador cae a features", () => {
    const f = leerFicha(
      "Curso práctico para aprender a manejar Excel desde cero, con ejercicios.",
      "Curso de Excel",
    );
    expect(f.puntos).toEqual([]);
    expect(f.intro).toMatch(/^Curso práctico/);
    expect(f.emoji).toBe("");
  });

  it("una descripción vacía no revienta", () => {
    expect(leerFicha("", "Lo que sea")).toEqual({ emoji: "", intro: "", puntos: [] });
    expect(leerFicha(null, "Lo que sea").puntos).toEqual([]);
  });

  it("reconoce el título aunque esté escrito distinto que el nombre", () => {
    // "CURSO COMPLETO DE PIANO — DE CERO A AVANZADO" vs
    // "Curso de Piano Completo: De Cero a Nivel Avanzado"
    const f = leerFicha("🤖 INTELIGENCIA ARTIFICIAL 2026\n\n🚀 Agentes autónomos que trabajan por ti.",
      "Inteligencia Artificial 2026: Herramientas + Agentes Autónomos");
    expect(f.emoji).toBe("🤖");
    expect(f.puntos).toEqual([{ emoji: "🚀", texto: "Agentes autónomos que trabajan por ti." }]);
  });

  it("no confunde un punto normal con el título", () => {
    const f = leerFicha("🎹 Tocar piano desde cero.\n\n🎬 19 módulos.", "Curso de Guitarra Flamenca");
    // Ninguno de los dos es el título de ESE producto: los dos son puntos.
    expect(f.puntos.length).toBe(2);
    expect(f.emoji).toBe("");
  });
});
