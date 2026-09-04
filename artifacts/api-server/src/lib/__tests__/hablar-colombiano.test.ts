import { describe, it, expect } from "vitest";
import { hablarColombiano, restosDeVoseo } from "../hablar-colombiano";

/**
 * M4 lleva CUATRO rondas de QA sin caer, con la regla escrita en mayúsculas en
 * el prompt y con el prompt ya corregido de su propio voseo.
 *
 * Las frases de acá salieron del bot en producción, no las inventé.
 */

describe("el voseo se traduce al salir", () => {
  it("las frases reales que salieron del bot", () => {
    const casos: Array<[string, string]> = [
      // Medida el 2026-08-27, después de corregir el prompt.
      ["Si decidís comprar, te envío el link de pago.", "Si decides comprar, te envío el link de pago."],
      // Ronda 4 del QA.
      ["¿Me podés mandar el comprobante?", "¿Me puedes mandar el comprobante?"],
      // Ronda 1 a 3.
      ["¡Sí! Tenés el curso que buscás.", "¡Sí! Tienes el curso que buscas."],
      ["Contame qué necesitás y te ayudo.", "Cuéntame qué necesitas y te ayudo."],
      ["Si querés te paso la ficha, avisame.", "Si quieres te paso la ficha, avísame."],
    ];
    for (const [antes, despues] of casos) {
      expect(hablarColombiano(antes), antes).toBe(despues);
    }
  });

  it("conserva el énfasis: MAYÚSCULAS y Capitalizada", () => {
    expect(hablarColombiano("PODÉS pagar por Nequi")).toBe("PUEDES pagar por Nequi");
    expect(hablarColombiano("Contame más")).toBe("Cuéntame más");
  });

  it("no toca el español que ya está bien", () => {
    // Estas se rompen con la regla ingenua de "todo lo que termina en -ás/-és
    // es voseo": son español correcto y quedarían destrozadas.
    const intactas = [
      "¿Cómo estás? El curso cuesta más de lo que crees.",
      "Además, después de pagar te llega al instante.",
      "Es el país con más ventas, quizás mañana te confirmo.",
      "No hay nada atrás de eso.",
    ];
    for (const t of intactas) expect(hablarColombiano(t), t).toBe(t);
  });

  it("funciona con el voseo al final de la frase", () => {
    // ⚠️ `\b` en JS se define sobre \w, que NO incluye vocales acentuadas: un
    // /\bpodés\b/ ingenuo no matchea "podés" cuando cierra la oración. Es el
    // mismo error que ya costó un arreglo entero en este proyecto.
    expect(hablarColombiano("Claro que podés")).toBe("Claro que puedes");
    expect(hablarColombiano("¿Vos qué querés?")).toBe("¿Vos qué quieres?");
    expect(hablarColombiano("dale, contame")).toBe("dale, cuéntame");
  });

  it("no deja restos en un mensaje largo de venta", () => {
    const original =
      "¡Hola! Contame qué buscás. Si querés el curso de piano, podés pagarlo por Nequi. " +
      "Decime cuando transfieras y mandame el comprobante, así te lo activo. Vos elegís cómo pagás.";
    const salida = hablarColombiano(original);
    expect(restosDeVoseo(salida)).toEqual([]);
    expect(salida).toMatch(/Cuéntame qué buscas/);
    expect(salida).toMatch(/puedes pagarlo/);
    expect(salida).toMatch(/Dime cuando transfieras/);
  });

  it("un texto vacío no rompe", () => {
    expect(hablarColombiano("")).toBe("");
  });
});
