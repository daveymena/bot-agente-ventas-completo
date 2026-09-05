/**
 * Lo único que importa del bot: que cierre.
 *
 * Medido sobre producción: 10 conversaciones, 0 cierres. La causa que se
 * encontró entonces fue que "¿cómo pago?" no disparaba el cierre, y se agregó
 * `PAYMENT_INSTRUCTION_PATTERNS` para atraparlo.
 *
 * Esta prueba existe para contestar la pregunta siguiente: ¿QUÉ MÁS dice un
 * cliente que significa lo mismo y sigue sin atraparse? Cada frase de acá que
 * falle es una venta que se enfría mientras el bot responde otra cosa.
 *
 * El clasificador de intención es un modelo, y el prompt le dice qué NO es
 * `payment_intent` pero nunca qué SÍ es. Por eso esta lista determinística no
 * es un parche: es el piso que no depende de que el modelo acierte.
 */
import { describe, it, expect } from "vitest";
import { isPaymentInstructionIntent } from "../conversation-engine";

describe("un cliente pidiendo pagar no se puede escapar", () => {
  /** Las que ya funcionaban. No pueden romperse al agregar las nuevas. */
  it.each([
    "como pago?",
    "cómo pago",
    "cómo te pago",
    "a qué cuenta",
    "datos para pagar",
    "a nombre de quién",
    "número de cuenta",
  ])("sigue reconociendo: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(true);
  });

  /**
   * DECIDIR COMPRAR. El cliente ya no pregunta cómo se paga: dice que lo
   * quiere. Es el momento de mayor intención de toda la conversación, y
   * responderle con otra cosa es donde más caro sale equivocarse.
   */
  it.each([
    "quiero comprarlo",
    "lo quiero comprar",
    "cómo lo compro",
    "como hago para comprarlo",
    "cómo hago para adquirirlo",
    "dónde lo compro",
    "me lo llevo",
    "quiero uno",
  ])("decide comprar: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(true);
  });

  /**
   * PEDIR LOS DATOS. Ya decidió y está esperando que le pasen dónde consignar.
   * Acá cada minuto de demora es una venta que se enfría.
   */
  it.each([
    "me pasas los datos",
    "pásame los datos",
    "pasame la cuenta",
    "mándame el link",
    "pasame el link de pago",
    "por dónde te pago",
    "por donde te consigno",
  ])("pide los datos: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(true);
  });

  /**
   * EL SIGUIENTE PASO. No nombra el pago, pero está preguntando cómo avanzar.
   * Un "listo, ¿qué hago?" es un sí con otra forma.
   */
  it.each([
    "listo, qué hago",
    "y ahora qué hago",
    "cómo procedo",
    "qué sigue para comprar",
  ])("pregunta el siguiente paso: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(true);
  });
});

describe("pero no se adelanta a quien todavía está mirando", () => {
  /**
   * Preguntar el precio NO es querer pagar. Mandarle los datos de consignación
   * a quien apenas está averiguando es apurar la venta, y apurar espanta --que
   * es el error opuesto y también cuesta plata.
   */
  it.each([
    "cuánto cuesta",
    "de qué se trata",
    "tienes envío a Cali",
    "qué incluye",
    "hola, buenas",
  ])("no dispara el cierre: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(false);
  });

  /**
   * Y quien YA pagó no está preguntando cómo pagar: está esperando su compra.
   * Confundirlos es el caso que el admin reportó como más vergonzoso -- el bot
   * insistiendo con "¿cómo vas a pagar?" a alguien que ya transfirió.
   */
  it.each([
    "ya te pagué",
    "ya hice la transferencia",
    "acabo de consignar",
  ])("no confunde a quien ya pagó: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(false);
  });
});

/**
 * La negación, que es el riesgo de haber ampliado la lista.
 *
 * ⚠️ Al agregar 40 frases nuevas apareció un peligro que antes no existía: la
 * detección busca SUBCADENAS, y "quiero comprar" está adentro de "NO quiero
 * comprar". Sin el guardia, ampliar la lista habría hecho que el bot mandara
 * los datos de consignación a alguien que acababa de decir que no -- la peor
 * forma de perder una venta que todavía estaba viva.
 *
 * Es la misma lección que `pedir-ver-el-resultado` el 2026-09-04: una lista de
 * frases sin guardia de negación hace lo contrario de lo que le piden.
 */
describe("una negación apaga el cierre aunque la frase coincida", () => {
  it.each([
    "no quiero comprarlo",
    "no lo quiero comprar todavía",
    "todavía no quiero comprar",
    "aún no, gracias",
    "más adelante lo compro",
    "después te pago",
  ])("no dispara: %s", (frase) => {
    expect(isPaymentInstructionIntent(frase)).toBe(false);
  });

  /** Y la versión afirmativa de la MISMA frase sigue funcionando. */
  it("pero el sí sigue contando", () => {
    expect(isPaymentInstructionIntent("quiero comprarlo")).toBe(true);
    expect(isPaymentInstructionIntent("lo quiero comprar")).toBe(true);
  });
});
