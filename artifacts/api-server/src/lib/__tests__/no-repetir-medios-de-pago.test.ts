import { describe, it, expect } from "vitest";
import { seccionQueCorresponde } from "../ficha-parcial";
import { datosYaDichos } from "../datos-ya-dichos";

/**
 * ============================================================
 * "Quiero comprarlo" NO reenvía los medios de pago que ya vio
 * ============================================================
 *
 * Conversación real del dueño (21-09-2026):
 *
 *   cliente: "Método de pago?"  → bot: [los cuatro medios de pago]
 *   cliente: "¿Y cómo viene?"   → bot: [entrega digital]
 *   cliente: "Quiero comprarlo" → bot: [LOS CUATRO MEDIOS OTRA VEZ]
 *
 * El cliente ya tenía los medios arriba en la pantalla. Volver a mandarlos es
 * lo que hace que la conversación se sienta un formulario y no una persona.
 * Lo que corresponde es preguntarle cuál de los que YA vio va a usar.
 */

/** El mensaje del bot que mandó los medios de pago (sección "pago"). */
const MENSAJE_CON_MEDIOS = `💰 *$60.000 COP*

🔹 *Tarjeta / PSE:* https://ventasproia.com/p/ON2J9E
🔹 *PayPal:* https://ventasproia.com/p/ksvK64
🔹 *Nequi:* 3136174267
🔹 *Daviplata:* 3136174267

Apenas transfieras, mándame el comprobante por aquí y te activo el acceso 🙌`;

describe("Los medios de pago ya enviados no se repiten", () => {
  it("'Quiero comprarlo' después de ver los medios: sin sección, contesta el texto", () => {
    const seccion = seccionQueCorresponde({
      mensaje: "Quiero comprarlo",
      intent: "payment_intent",
      fichaYaEnviada: true,
      pagoYaEnviado: true,
    });
    // "ninguna" = no va tarjeta: el modelo pregunta cuál de los medios ya vistos
    // va a usar, en vez de reenviar los cuatro enlaces.
    expect(seccion).toBe("ninguna");
  });

  it("también con la intención leída como confirmación", () => {
    expect(
      seccionQueCorresponde({
        mensaje: "listo, lo quiero",
        intent: "confirmation",
        fichaYaEnviada: true,
        pagoYaEnviado: true,
      }),
    ).toBe("ninguna");
  });

  it("si NO se le enviaron los medios, comprar sí dispara el pago", () => {
    // La regla no puede romper el cierre: al que decide comprar y todavía no
    // vio cómo pagar hay que mandarle los medios.
    expect(
      seccionQueCorresponde({
        mensaje: "Quiero comprarlo",
        intent: "payment_intent",
        fichaYaEnviada: true,
        pagoYaEnviado: false,
      }),
    ).toBe("pago");
  });

  it("pedir los datos DE NUEVO con todas las letras sí los reenvía", () => {
    // Negarle el dato a quien lo pide explícitamente sería el error opuesto.
    const yaLosVio = { fichaYaEnviada: true, pagoYaEnviado: true };
    expect(seccionQueCorresponde({ mensaje: "mándame el link de pago", ...yaLosVio })).toBe("pago_link");
    expect(seccionQueCorresponde({ mensaje: "pásame el nequi", ...yaLosVio })).toBe("pago_transferencia");
    expect(seccionQueCorresponde({ mensaje: "cómo pago?", ...yaLosVio })).toBe("pago");
  });
});

describe("El flag sale del historial, no de una bandera que se desincroniza", () => {
  it("el mensaje del bot con los medios cuenta como 'como-se-paga'", () => {
    const historial = [
      { role: "customer", content: "Método de pago?" },
      { role: "agent", content: MENSAJE_CON_MEDIOS },
    ];
    expect(datosYaDichos(historial).has("como-se-paga")).toBe(true);
  });

  it("un saludo no lo cuenta: sin medios enviados no se frena el cierre", () => {
    const historial = [
      { role: "agent", content: "¡Hola! ¿En qué te ayudo?" },
    ];
    expect(datosYaDichos(historial).has("como-se-paga")).toBe(false);
  });

  it("la secuencia completa del chat real termina sin reenviar los medios", () => {
    const historial = [
      { role: "agent", content: "🎼 Curso de Piano Completo" },
      { role: "customer", content: "Método de pago?" },
      { role: "agent", content: MENSAJE_CON_MEDIOS },
      { role: "customer", content: "¿Y cómo viene?" },
      { role: "agent", content: "💻 Es completamente digital. Te llega por este chat." },
    ];
    const pagoYaEnviado = datosYaDichos(historial).has("como-se-paga");
    expect(pagoYaEnviado).toBe(true);

    const seccion = seccionQueCorresponde({
      mensaje: "Quiero comprarlo",
      intent: "payment_intent",
      fichaYaEnviada: true,
      pagoYaEnviado,
    });
    expect(seccion).toBe("ninguna");
  });
});
