import { describe, it, expect } from "vitest";
import { seccionQueCorresponde } from "../ficha-parcial";

/**
 * De una conversación REAL de producción (2026-08-27):
 *
 *   bot:     ¿Te cuento qué incluye? 👀
 *   cliente: Si
 *   bot:     💰 $60.000 · Tarjeta/PSE · PayPal · Nequi 3136174267
 *
 * Dijo que sí a que le contaran el contenido y le llegaron los enlaces de
 * pago. No es un detalle de forma: es cobrarle a alguien que todavía estaba
 * averiguando, que es exactamente como se pierde una venta que ya estaba
 * encaminada.
 *
 * Un "sí" pelado no tiene significado propio: contesta lo ÚLTIMO que se
 * preguntó. El modelo lo leía como `confirmation` ("sí, quiero comprar"), y
 * esa es una interpretación suya; el servidor, en cambio, SABE qué ofreció en
 * el mensaje anterior. Cuando algo se puede saber en vez de interpretar, se
 * sabe -- es la misma regla que ya arregló el precio y la cuenta de cobro.
 */

describe("un 'sí' contesta lo último que se ofreció, no lo que el modelo supone", () => {
  const trasOfrecerContenido = (mensaje: string, intent = "confirmation") =>
    seccionQueCorresponde({
      mensaje,
      intent,
      fichaYaEnviada: true,
      ofrecimosContenido: true,
    });

  it("'Si' después de '¿Te cuento qué incluye?' devuelve el contenido, no el pago", () => {
    expect(trasOfrecerContenido("Si")).toBe("info");
  });

  it("vale para las formas en que la gente dice que sí", () => {
    for (const m of ["si", "Sí", "sii", "dale", "listo", "claro", "bueno", "de una", "obvio", "por favor"]) {
      expect(trasOfrecerContenido(m), m).toBe("info");
    }
  });

  it("si NO se ofreció contenido, un 'sí' sigue leyéndose como antes", () => {
    // Acá el "sí" sí contesta a otra cosa (una intención de pago detectada), y
    // ese camino no se toca.
    expect(
      seccionQueCorresponde({ mensaje: "Si", intent: "payment_intent", fichaYaEnviada: true }),
    ).toBe("pago");
  });

  it("un pedido explícito de pago gana, aunque se haya ofrecido contenido", () => {
    // "sí, ¿cómo pago?" es un sí que YA dice qué quiere. Se respeta.
    expect(trasOfrecerContenido("si, como pago?")).toMatch(/^pago/);
  });

  it("preguntar el precio tampoco queda tapado por el ofrecimiento", () => {
    expect(trasOfrecerContenido("si, cuanto vale?")).toMatch(/precio|pago/);
  });
});
