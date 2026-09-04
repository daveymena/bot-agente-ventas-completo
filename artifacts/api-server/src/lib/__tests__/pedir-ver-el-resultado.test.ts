/**
 * "Dame el copi": pedido cuatro veces, entregado ninguna.
 *
 * Mensajes TEXTUALES del chat del admin (2026-09-04). A los cuatro Atlas
 * contestó "¿Confirmás para que lo genere?" -- cuando `crear_anuncio` DEVUELVE
 * el copy en su resultado y, tal como estaba propuesta, solo guarda un borrador
 * local en pausa: no sube a Meta, no gasta, no le llega a nadie.
 *
 * El texto que pedía estaba siempre a un "sí" de distancia, y lo único que lo
 * separaba era una confirmación para algo sin consecuencia.
 */
import { describe, it, expect } from "vitest";
import { pideVerElResultado, sinConsecuencia, verloEsAutorizarlo } from "../pedir-ver-el-resultado";

const BORRADOR = [{ tool: "crear_anuncio", args: { producto: "curso de IA", dailyBudget: 20000 } }];
const A_META = [{ tool: "crear_anuncio", args: { producto: "curso de IA", dailyBudget: 20000, subirAMeta: true } }];

describe("pedir ver lo que se va a publicar", () => {
  it.each([
    "Demuéstrale el copi",
    "Entregamos el copi completo para ver q vas a publicar ?",
    "Dame el copi para saber que vas a publicar",
    "Preparar el ponzo y dejar lista la muestra del copo.",
    "muéstrame el texto del anuncio",
    "quiero ver cómo queda antes de subirlo",
  ])("reconoce: %s", (m) => {
    expect(pideVerElResultado(m)).toBe(true);
  });

  /** Mencionar "copy" no alcanza: cambiarlo es otra cosa que verlo. */
  it("no confunde pedir un cambio con pedir verlo", () => {
    expect(pideVerElResultado("cambiá el copy, ponelo más corto")).toBe(false);
    expect(pideVerElResultado("el copy no me gusta")).toBe(false);
  });

  it("un sí a secas no es pedir verlo", () => {
    expect(pideVerElResultado("dale")).toBe(false);
    expect(pideVerElResultado("")).toBe(false);
  });
});

describe("qué se puede ejecutar sin preguntar", () => {
  it("un borrador local no tiene consecuencia", () => {
    expect(sinConsecuencia(BORRADOR)).toBe(true);
  });

  /**
   * LO QUE NO PUEDE PASAR. `subirAMeta` saca la acción del borrador local: ahí
   * la campaña se crea de verdad en la cuenta del admin, y aunque quede en
   * pausa vuelve a hacer falta su sí.
   */
  it("subir a Meta SÍ tiene consecuencia: se sigue preguntando", () => {
    expect(sinConsecuencia(A_META)).toBe(false);
    expect(verloEsAutorizarlo("dame el copi", A_META)).toBe(false);
  });

  it("una acción que no está en la lista blanca no se ejecuta sola", () => {
    expect(sinConsecuencia([{ tool: "fb_resume_campaign", args: {} }])).toBe(false);
    expect(sinConsecuencia([{ tool: "update_product", args: { price: 1 } }])).toBe(false);
  });

  /** Si hay varias y UNA toca el mundo real, se pregunta por todas. */
  it("basta una acción con consecuencia para exigir confirmación", () => {
    expect(sinConsecuencia([...BORRADOR, { tool: "fb_resume_campaign", args: {} }])).toBe(false);
  });

  it("un plan vacío no autoriza nada", () => {
    expect(sinConsecuencia([])).toBe(false);
    expect(sinConsecuencia(null)).toBe(false);
  });
});

describe("ver el resultado es autorizarlo, cuando verlo es gratis", () => {
  it("el caso del admin, punta a punta", () => {
    expect(verloEsAutorizarlo("Dame el copi para saber que vas a publicar", BORRADOR)).toBe(true);
  });

  it("pero un sí a secas sigue pasando por el camino normal de confirmación", () => {
    expect(verloEsAutorizarlo("dale", BORRADOR)).toBe(false);
  });
});
