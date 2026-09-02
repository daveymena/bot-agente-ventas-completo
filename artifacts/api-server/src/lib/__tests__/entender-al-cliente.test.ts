import { describe, it, expect } from "vitest";
import { extraerJson, normalizar } from "../entender-al-cliente";

/**
 * Este paso le devuelve al modelo la única decisión que las listas de palabras
 * hacían mal: entender qué está pidiendo el cliente.
 *
 * Pero nada de lo que devuelve entra sin revisar. El modelo elige mal el id de
 * producto seguido -- medido el 2026-09-02, escribió [CARD: 115] y [CARD: 101]
 * para el producto 124 en la misma sesión. Por eso `normalizar` valida contra
 * el catálogo REAL antes de dejar pasar nada.
 */

const CATALOGO = new Set([123, 124, 55]);

describe("El JSON se saca aunque el modelo lo envuelva", () => {
  it("crudo", () => {
    expect(extraerJson('{"intencion":"greeting"}')?.intencion).toBe("greeting");
  });

  it("dentro de un bloque de código", () => {
    expect(extraerJson('```json\n{"intencion":"objection"}\n```')?.intencion).toBe("objection");
  });

  it("con cháchara alrededor, que es lo que hacen los modelos chicos", () => {
    const bruto = 'Claro, acá va:\n{"intencion":"payment_intent","productoId":124}\nEspero que sirva.';
    expect(extraerJson(bruto)?.productoId).toBe(124);
  });

  it("y si no hay JSON, no revienta", () => {
    expect(extraerJson("no tengo idea")).toBe(null);
    expect(extraerJson("")).toBe(null);
    expect(extraerJson("{roto")).toBe(null);
  });
});

describe("Nada del modelo entra sin revisar", () => {
  it("una intención que no existe se descarta entera", () => {
    expect(normalizar({ intencion: "comprar_ya" }, CATALOGO)).toBe(null);
    expect(normalizar({}, CATALOGO)).toBe(null);
    expect(normalizar(null, CATALOGO)).toBe(null);
  });

  it("un id que no está en el catálogo se cae, no viaja", () => {
    // Este es el caso real: el modelo escribió 115 y 101 para el producto 124.
    const r = normalizar({ intencion: "product_query", productoId: 115 }, CATALOGO);
    expect(r?.productoId).toBe(null);
  });

  it("un id real pasa", () => {
    const r = normalizar({ intencion: "product_query", productoId: 124 }, CATALOGO);
    expect(r?.productoId).toBe(124);
  });

  it("las banderas solo son true si el modelo dijo true", () => {
    const r = normalizar(
      { intencion: "objection", pideRebaja: "si", dicePago: 1, preguntaPorElBot: null },
      CATALOGO,
    );
    expect(r?.pideRebaja).toBe(false);
    expect(r?.dicePago).toBe(false);
    expect(r?.preguntaPorElBot).toBe(false);
  });

  it("la confianza queda entre 0 y 1 pase lo que pase", () => {
    expect(normalizar({ intencion: "general", confianza: 7 }, CATALOGO)?.confianza).toBe(1);
    expect(normalizar({ intencion: "general", confianza: -3 }, CATALOGO)?.confianza).toBe(0);
    expect(normalizar({ intencion: "general", confianza: "alta" }, CATALOGO)?.confianza).toBe(0.5);
  });

  it("las preguntas se limpian y se acotan", () => {
    const r = normalizar(
      { intencion: "details_query", preguntas: ["¿cuánto vale?", "", null, 42, "¿cómo llega?"] },
      CATALOGO,
    );
    expect(r?.preguntas).toEqual(["¿cuánto vale?", "¿cómo llega?"]);
  });
});
