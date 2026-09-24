/**
 * Voz o texto, nunca los dos. Y nunca voz sobre una ficha.
 * Pedido del dueño (2026-09-24).
 */
import { describe, it, expect } from "vitest";
import { decideSiMandaVoz, MIN_CHARS_POR_DEFECTO } from "../cuando-va-la-voz";

const LARGO = "Mira, el curso te sirve aunque nunca hayas tocado un piano: arranca desde cero, " +
  "y en las primeras semanas ya tocas una canción completa. ¿Te sirve que te cuente cómo funciona?";

describe("una ficha nunca va con voz", () => {
  it("aunque el texto sea largo y el azar diga que sí", () => {
    expect(decideSiMandaVoz({ tieneFicha: true, texto: LARGO, activo: true, prob: 1, azar: () => 0 })).toBe(false);
  });
});

describe("el texto y la voz son excluyentes", () => {
  it("una explicación puede ir hablada", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, prob: 1, azar: () => 0.5 })).toBe(true);
  });

  it("y a veces va escrita, aunque sea una explicación", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, prob: 0.5, azar: () => 0.9 })).toBe(false);
  });
});

describe("no se habla la charla corta", () => {
  it("un 'sí' o un 'dale' no se manda por voz", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: "Dale, ahí va.", activo: true, prob: 1, azar: () => 0 })).toBe(false);
  });

  it("justo en el largo mínimo ya no habla; por encima sí", () => {
    const corto = "a".repeat(MIN_CHARS_POR_DEFECTO - 1);
    const justo = "a".repeat(MIN_CHARS_POR_DEFECTO);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: corto, activo: true, prob: 1, azar: () => 0 })).toBe(false);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: justo, activo: true, prob: 1, azar: () => 0 })).toBe(true);
  });
});

describe("la bandera apaga todo", () => {
  it("con la voz desactivada nunca habla", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: false, prob: 1, azar: () => 0 })).toBe(false);
  });
});

describe("los extremos del azar no rompen", () => {
  it("prob 0 nunca habla; prob 1 siempre", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, prob: 0, azar: () => 0 })).toBe(false);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, prob: 1, azar: () => 0.999 })).toBe(true);
  });

  it("usa el default 0.5 cuando no se pasa prob", () => {
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, azar: () => 0.49 })).toBe(true);
    expect(decideSiMandaVoz({ tieneFicha: false, texto: LARGO, activo: true, azar: () => 0.51 })).toBe(false);
  });
});
