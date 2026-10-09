import { describe, it, expect } from "vitest";
import { ANGULOS, elegirAngulo, bloqueDeAngulo, ganchoDe } from "../angulos-de-anuncio";

// 08-10-2026, dueño: "arma siempre el mismo anuncio, el mismo copy".
describe("ángulo de cada anuncio", () => {
  it("sin anuncios previos arranca por el primero", () => {
    expect(elegirAngulo([]).id).toBe(ANGULOS[0]!.id);
  });

  it("un A/B (dos anuncios seguidos) sale con ángulos distintos", () => {
    const a = elegirAngulo([]);
    const b = elegirAngulo([a.id]);
    expect(b.id).not.toBe(a.id);
  });

  it("borradores viejos sin ángulo no bloquean nada", () => {
    expect(elegirAngulo([null, undefined, ""]).id).toBe(ANGULOS[0]!.id);
  });

  it("con todos usados vuelve al menos reciente, no siempre al primero", () => {
    const usados = [...ANGULOS].reverse().map((a) => a.id); // del más nuevo al más viejo
    expect(elegirAngulo(usados).id).toBe(ANGULOS[0]!.id);
    const otroOrden = ANGULOS.map((a) => a.id); // el más viejo es el último
    expect(elegirAngulo(otroOrden).id).toBe(ANGULOS[ANGULOS.length - 1]!.id);
  });

  it("el prompt lleva el ángulo y los ganchos que no se pueden repetir", () => {
    const txt = bloqueDeAngulo(ANGULOS[1]!, [{ headline: "Postura perfecta sin esfuerzo", gancho: "🤔 ¿Dolor de espalda al final del día?" }]);
    expect(txt).toContain(ANGULOS[1]!.nombre);
    expect(txt).toContain("Postura perfecta sin esfuerzo");
    expect(txt).toContain("¿Dolor de espalda al final del día?");
  });

  it("el gancho es la primera línea con texto", () => {
    expect(ganchoDe("\n\n🎯 Postura correcta al instante\n\nmás")).toBe("🎯 Postura correcta al instante");
  });
});
