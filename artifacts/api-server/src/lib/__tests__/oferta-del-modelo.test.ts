import { describe, it, expect } from "vitest";
import { queOfrecioElBot, seccionQueCorresponde } from "../ficha-parcial";

/**
 * ============================================================
 * EL MODELO INVENTA SUS PROPIAS FRASES PARA OFRECER
 * ============================================================
 *
 * Habia dos expresiones regulares con las frases EXACTAS que arma el servidor.
 * Pero el modelo redacta libre. Medido en produccion el 2026-09-01, 17:11:
 *
 *   cliente: "Tienes el curso de inteligencia artifical"
 *   bot:     "...¿Te gustaria que te pase toda la informacion con el precio
 *             y los modulos? 😊"
 *   cliente: "Si"
 *   bot:     [los tres medios de pago]
 *
 * Le ofrecio los modulos y le cobro. Ninguna de las dos expresiones casaba esa
 * frase, asi que el "Si" cayo en `intent: confirmation`.
 *
 * Enumerar frases no sirve: son infinitas. Se reconoce la FORMA.
 */

describe("Qué ofreció el bot, lo escriba como lo escriba", () => {
  it("la frase real que fallo en produccion", () => {
    expect(queOfrecioElBot(
      "¡Sí! Te cuento rápido cómo es el curso 🤖 ¿Te gustaría que te pase toda la información con el precio y los módulos? 😊",
    )).toBe("contenido");
  });

  it("otras formas de ofrecer lo mismo que el modelo podria escribir", () => {
    for (const frase of [
      "¿Quieres que te mande el temario completo?",
      "¿Te comparto los módulos del curso?",
      "¿Te paso la ficha con todos los detalles?",
      "Si quieres te cuento qué incluye, ¿te parece?",
      "¿Te gustaría ver todo lo que trae?",
    ]) {
      expect(queOfrecioElBot(frase), frase).toBe("contenido");
    }
  });

  it("distingue el video", () => {
    expect(queOfrecioElBot("¿Te muestro el video? 🎬")).toBe("video");
    expect(queOfrecioElBot("¿Quieres ver cómo es por dentro?")).toBe("video");
    expect(queOfrecioElBot("¿Te mando una clase de muestra?")).toBe("video");
  });

  it("distingue la tienda", () => {
    expect(queOfrecioElBot("¿Te paso el link de la tienda?")).toBe("tienda");
  });

  it("cuando ofrece PAGAR, el sí es para pagar", () => {
    // Este es el caso en que el checkout SI corresponde: no se puede
    // sobrecorregir y dejar sin pagar a quien quiere pagar.
    for (const frase of [
      "¿Te paso los datos de pago?",
      "¿Te mando el link de pago?",
      "¿Arrancamos?",
      "¿Te lo dejo listo?",
    ]) {
      expect(queOfrecioElBot(frase), frase).toBe("pago");
    }
  });

  it("si ofrece contenido Y pago, gana el pago", () => {
    expect(queOfrecioElBot("¿Te paso los módulos y los datos de pago?")).toBe("pago");
  });

  it("mira la ULTIMA pregunta, que es la que el cliente contesta", () => {
    const t = "¿Ya tocaste piano antes? Bueno, ¿te muestro el video? 🎬";
    expect(queOfrecioElBot(t)).toBe("video");
  });

  it("sin pregunta no hubo oferta", () => {
    expect(queOfrecioElBot("El curso trae 19 módulos en video.")).toBe(null);
    expect(queOfrecioElBot("")).toBe(null);
  });
});

describe("Con la oferta bien leida, el 'Si' ya no cobra", () => {
  it("el caso de produccion: contesta el contenido, no el checkout", () => {
    const ofrecio = queOfrecioElBot(
      "¿Te gustaría que te pase toda la información con el precio y los módulos? 😊",
    );
    expect(ofrecio).toBe("contenido");

    const seccion = seccionQueCorresponde({
      mensaje: "Si",
      intent: "confirmation", // asi lo clasifica detectIntent un "Si" pelado
      fichaYaEnviada: false,
      ofrecimosContenido: ofrecio === "contenido",
    });
    expect(seccion).toBe("info");
  });

  it("pero si ofrecio pagar, el checkout sigue saliendo", () => {
    const ofrecio = queOfrecioElBot("¿Te paso los datos de pago?");
    const seccion = seccionQueCorresponde({
      mensaje: "Si",
      intent: "confirmation",
      fichaYaEnviada: true,
      ofrecimosContenido: ofrecio === "contenido",
      ofrecimosVideo: ofrecio === "video",
    });
    expect(seccion).toBe("pago");
  });
});
