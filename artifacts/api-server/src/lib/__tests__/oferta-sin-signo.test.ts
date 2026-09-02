import { describe, it, expect } from "vitest";
import { queOfrecioElBot } from "../ficha-parcial";

/**
 * Conversacion real del 2026-09-02, 10:42:
 *
 *   bot:     "...Ideal si nunca has tocado. Te muestro el contenido detallado"
 *   cliente: "Si"
 *   bot:     [el contenido]
 *   bot:     [💰 $60.000 + Tarjeta/PSE + PayPal + el Nequi con la cuenta]
 *
 * El cliente acepto VER EL CONTENIDO y recibio la caja. La causa era una
 * linea: "sin signo de interrogacion no hubo oferta". En español se ofrece
 * afirmando tanto como preguntando.
 *
 * El admin lo zanjo asi: los medios de pago solo cuando pide pagar.
 */
describe("Ofrecer sin signo de interrogación también es ofrecer", () => {
  it("el cierre exacto del caso real se lee como contenido", () => {
    expect(
      queOfrecioElBot("¡Buenísimo que preguntes por el de piano! Aprende desde lo básico. Te muestro el contenido detallado"),
    ).toBe("contenido");
  });

  it("las otras formas de ofrecer afirmando", () => {
    expect(queOfrecioElBot("Te paso el precio")).toBe("precio");
    expect(queOfrecioElBot("Te cuento qué incluye")).toBe("contenido");
    expect(queOfrecioElBot("Te dejo el video para que lo veas")).toBe("video");
  });

  it("y preguntando se sigue leyendo igual que antes", () => {
    expect(queOfrecioElBot("¿Te cuento qué incluye? 👀")).toBe("contenido");
    expect(queOfrecioElBot("¿Te paso el precio? 💰")).toBe("precio");
  });

  it("pero una afirmación que NO ofrece nada no cuenta como oferta", () => {
    // Si esto contara, cualquier "sí" posterior se leería como respuesta a algo
    // que nadie ofreció, y el bot quedaría esperando una aceptación fantasma.
    expect(queOfrecioElBot("El curso cuesta $60.000 y el acceso es de por vida.")).toBe(null);
    expect(queOfrecioElBot("Perfecto, ya quedó registrado.")).toBe(null);
    expect(queOfrecioElBot("")).toBe(null);
  });
});
