import { describe, it, expect } from "vitest";
import { seccionQueCorresponde } from "../ficha-parcial";

/**
 * ============================================================
 * LA CONVERSACIÓN AVANZA: NUNCA SE REPITE LO QUE EL CLIENTE YA TIENE
 * ============================================================
 *
 * El admin lo pidió así:
 *
 *   "cuando vayas a presentar la información mándala con la imagen. Cuando
 *    pregunte por más información le mandas el video, así que el bot sepa las
 *    etapas... si ya preguntaron y tiene información el cliente, ¿por qué le
 *    da información que ya tiene? Debemos usar la lógica para hacer inteligente
 *    este bot y no sólo dar respuestas por dar, sin tener el sentido de la
 *    conversación y dónde vamos."
 *
 * El orden que tiene sentido comercial, y el que se prueba acá:
 *
 *   presentación (con imagen) → video → precio → pago
 *
 * Cada paso muestra algo que el cliente TODAVÍA no vio. El video va en el
 * medio a propósito: es lo que más convence, y ofrecerlo antes de que muestre
 * interés lo gasta.
 */

const PIANO = { fichaYaEnviada: true, yaVioContenido: true, tieneVideo: true };

describe("Cada turno entrega algo nuevo", () => {
  it("el primer contacto recibe la presentación completa", () => {
    expect(seccionQueCorresponde({ mensaje: "me interesa el curso de piano" })).toBe("completa");
  });

  it("«más información» con el contenido ya visto escala al VIDEO", () => {
    // Antes devolvía "info" y le repetía el mismo bloque de características.
    for (const m of ["cuéntame más", "más información", "qué más incluye", "dame más detalles"]) {
      expect(seccionQueCorresponde({ mensaje: m, ...PIANO }), m).toBe("video");
    }
  });

  it("si el video ya salió, «más información» no lo repite", () => {
    expect(seccionQueCorresponde({
      mensaje: "cuéntame más", ...PIANO, videoYaEnviado: true,
    })).toBe("info");
  });

  it("si el producto NO tiene video, se queda en info", () => {
    // Y ahí construirSeccion muestra los puntos que no entraron la primera vez.
    expect(seccionQueCorresponde({
      mensaje: "cuéntame más", fichaYaEnviada: true, yaVioContenido: true, tieneVideo: false,
    })).toBe("info");
  });

  it("la primera vez que pregunta qué incluye SÍ recibe el contenido", () => {
    // No se escala al video a quien todavía no vio de qué se trata.
    expect(seccionQueCorresponde({
      mensaje: "¿qué incluye?", fichaYaEnviada: true, yaVioContenido: false, tieneVideo: true,
    })).toBe("info");
  });
});

describe("Una pregunta concreta manda sobre la etapa", () => {
  it("pedir el precio da el precio, aunque no haya visto el video", () => {
    expect(seccionQueCorresponde({ mensaje: "¿cuánto vale?", ...PIANO })).toBe("precio");
  });

  it("pedir pagar da el pago, sin obligarlo a pasar por el video", () => {
    expect(seccionQueCorresponde({ mensaje: "¿cómo pago?", ...PIANO })).toBe("pago");
  });

  it("pedir el video explícitamente lo da, aunque no haya visto el contenido", () => {
    expect(seccionQueCorresponde({
      mensaje: "muéstrame el video", fichaYaEnviada: true, yaVioContenido: false, tieneVideo: true,
    })).toBe("video");
  });
});

describe("El recorrido completo, turno por turno", () => {
  it("nunca entrega dos veces lo mismo", () => {
    const recorrido = [
      { dice: "me interesa el curso de piano", estado: {}, espera: "completa" },
      { dice: "cuéntame más", estado: { ...PIANO }, espera: "video" },
      { dice: "cuéntame más", estado: { ...PIANO, videoYaEnviado: true }, espera: "info" },
      { dice: "¿cuánto vale?", estado: { ...PIANO, videoYaEnviado: true }, espera: "precio" },
      { dice: "¿cómo pago?", estado: { ...PIANO, videoYaEnviado: true }, espera: "pago" },
      { dice: "por nequi", estado: { ...PIANO, videoYaEnviado: true }, espera: "pago_transferencia" },
    ];

    const entregadas: string[] = [];
    for (const paso of recorrido) {
      const s = seccionQueCorresponde({ mensaje: paso.dice, ...paso.estado } as any);
      expect(s, paso.dice).toBe(paso.espera);
      entregadas.push(s);
    }
    // Ninguna sección se repite: cada turno agregó algo.
    expect(new Set(entregadas).size).toBe(entregadas.length);
  });
});
