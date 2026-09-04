import { describe, it, expect } from "vitest";
import { puedeMandarPago } from "../estado-cognitivo";

/**
 * La etapa del trato ahora MANDA, no sugiere.
 *
 * El admin: "no está manejando las etapas, responde de una y no se siente
 * humano" — y tenía razón, pero el diagnóstico fino es peor que eso.
 *
 * `calcularEtapa` ya existía y calculaba BIEN en qué punto va el trato. Lo que
 * fallaba era que su resultado viajaba al prompt como TEXTO: una sugerencia al
 * modelo, no una regla del sistema. Es la misma lección que ya costó el
 * producto equivocado y el objetivo del anuncio: una sugerencia no es una
 * garantía.
 *
 * Y faltaba la regla que más caro sale: ninguna etapa prohibía mandar el
 * checkout. Por eso, con la etapa correctamente calculada en "interesado", el
 * bot mandó los tres medios de pago a alguien que solo había dicho "Sí" a
 * "¿te cuento qué incluye?".
 */
describe("Cobrarle a quien está averiguando", () => {
  it("el caso real: en 'interesado' no sale el checkout", () => {
    const r = puedeMandarPago({ etapa: "interesado", mensaje: "Sí" });
    expect(r.puede).toBe(false);
    expect(r.porQue).toMatch(/averiguando/);
  });

  it("tampoco en 'explorando'", () => {
    expect(puedeMandarPago({ etapa: "explorando", mensaje: "dale" }).puede).toBe(false);
  });
});

describe("Pero si lo pide, se le da", () => {
  it("negárselo sería el error opuesto, y tan malo", () => {
    // Si pregunta cómo pagar hay que contestarle, esté en la etapa que esté.
    for (const m of [
      "¿cómo pago?",
      "mándame el link de pago",
      "cuáles son las formas de pago",
      "dónde consigno",
      "quiero comprarlo",
      "el número de nequi",
    ]) {
      expect(puedeMandarPago({ etapa: "interesado", mensaje: m }).puede, m).toBe(true);
    }
  });

  it("y en explorando también, si lo pidió", () => {
    expect(puedeMandarPago({ etapa: "explorando", mensaje: "cómo puedo pagar" }).puede).toBe(true);
  });
});

describe("Cuando ya decidió, el pago es lo que corresponde", () => {
  it("no se puede frenar el cierre", () => {
    // El error opuesto: quien ya dijo que lo quiere necesita los medios de
    // pago YA. Bloquearlo ahí perdería la venta hecha.
    for (const etapa of ["decidido", "pago_reportado", "pago_verificado", "entregado"] as const) {
      expect(puedeMandarPago({ etapa, mensaje: "listo" }).puede, etapa).toBe(true);
    }
  });

  it("dice por qué, para que quede en el log", () => {
    expect(puedeMandarPago({ etapa: "decidido", mensaje: "ok" }).porQue).toMatch(/ya dijo que lo quiere/);
  });
});
