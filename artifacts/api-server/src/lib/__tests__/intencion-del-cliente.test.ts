import { describe, it, expect } from "vitest";
import { detectIntent } from "../conversation-engine";

/**
 * Qué entiende el motor cuando el cliente escribe.
 *
 * Los casos salen del manual de venta que definió el dueño del negocio: las
 * formas de confirmar (§15), las objeciones que hay que reconocer (§27), y el
 * "cuéntame más" de quien quiere ampliar información (§26). Se midieron uno por
 * uno contra el motor el 2026-08-24. Casi todos fallaban.
 *
 * La causa de fondo era una sola y estaba en todas las listas: se comparaba con
 * `includes()` sobre el texto entero, es decir por PEDAZOS de palabra. La
 * detección de saludos ya se había pasado a palabra completa tras un incidente
 * en producción (un cliente quedó sin respuesta por una recursión infinita:
 * "chicas" contiene "hi"). Las demás listas se quedaron atrás.
 *
 * Lo que eso producía, medido:
 *
 *   "cuéntame más"                → intención de PAGO   ("cuentame" ⊃ "cuenta")
 *   "necesito el curso de piano"  → CONFIRMACIÓN        ("necesito" ⊃ "si")
 *   "hasta luego"                 → OBJECIÓN            ("luego" suelto)
 *   "déjalo así"                  → CONFIRMACIÓN        ("asi" ⊃ "si")
 *
 * En los dos casos de "si", el motor saltaba directo al CIERRE: el cliente
 * pedía información o se despedía, y recibía los datos de pago.
 */

describe("§15 · Formas de confirmar que hay que reconocer", () => {
  // El manual las enumera. De las 11, cinco no se reconocían y el motor las
  // leía como "consulta de producto": el cliente aceptaba y el bot se quedaba
  // en presentación en vez de cerrar.
  const CONFIRMAN = [
    "si", "listo", "hazlo", "correcto", "esta bien",
    "envialo", "confirmado", "de una", "obvio", "ese me sirve",
  ];

  it.each(CONFIRMAN)('"%s" es una aceptación', (mensaje) => {
    // "confirmo"/"dale" caen en payment_intent, que también cierra: lo que no
    // puede pasar es que se lean como una consulta más.
    expect(["confirmation", "payment_intent"]).toContain(detectIntent(mensaje));
  });

  // Un "si" dentro de una frase larga casi nunca es un sí: es el condicional.
  // Sin esta distinción, quien preguntaba si el curso le servía recibía los
  // datos de pago.
  it("no confunde el 'si' condicional con una aceptación", () => {
    expect(detectIntent("quiero saber si sirve para principiantes")).not.toBe("confirmation");
    expect(detectIntent("me gustaria saber si me sirve para mi hijo")).not.toBe("confirmation");
  });
});

describe("§27 · Objeciones que hay que reconocer", () => {
  // `objectionHandler.ts` tiene 11 tipos y 8 estrategias, y estaba cableado al
  // turno. Pero no se activaba para ninguna de estas, porque la intención nunca
  // se clasificaba como objeción: caían en "consulta de producto" y el bot
  // contestaba como si le hubieran preguntado una característica.
  //
  // "Lo voy a pensar" es LA objeción clásica de cualquier venta, y no estaba en
  // la lista: solo estaban "pensarlo" y "lo pienso".
  const OBJECIONES = [
    "esta caro",
    "lo voy a pensar",
    "no estoy seguro",
    "realmente funciona?",
    "y si no me gusta?",
    "es confiable?",
    "como se que llegara?",
    "me da desconfianza",
  ];

  it.each(OBJECIONES)('"%s" es una objeción', (mensaje) => {
    expect(detectIntent(mensaje)).toBe("objection");
  });
});

describe("§26 · El cliente que quiere más información", () => {
  // REGRESIÓN: "cuentame" contiene "cuenta", que es palabra de PAGO (cuenta
  // bancaria). Quien pedía que le contaran más entraba al flujo de cierre.
  it('"cuéntame más" no es intención de pago', () => {
    for (const m of ["cuentame mas", "cuentame mas del curso", "cuéntame más porfa"]) {
      expect(detectIntent(m)).not.toBe("payment_intent");
    }
  });
});

describe("Pedazos de palabra que cambiaban la intención", () => {
  // REGRESIÓN: "necesito" contiene "si". El cliente nombraba un producto y el
  // motor lo leía como una confirmación, saltando la presentación entera.
  it('"necesito" no se lee como un "sí"', () => {
    expect(detectIntent("necesito el curso de piano")).toBe("product_query");
    expect(detectIntent("necesito informacion del pack canva")).toBe("product_query");
  });

  // REGRESIÓN: "luego" estaba suelto en la lista de objeciones, así que una
  // despedida se trataba como una duda que había que trabajar.
  it('"hasta luego" es una despedida, no una objeción', () => {
    expect(detectIntent("hasta luego")).toBe("leaving");
  });

  // Posponer SÍ es una objeción — pero dicho como frase, no por la palabra suelta.
  it("posponer sigue siendo una objeción", () => {
    expect(detectIntent("lo dejo para despues")).toBe("objection");
    expect(detectIntent("mas adelante lo compro")).toBe("objection");
  });
});

describe("§44 · Cuando el cliente dice que no", () => {
  it.each(["no gracias", "no me interesa", "no quiero"])('"%s" es una despedida', (mensaje) => {
    expect(detectIntent(mensaje)).toBe("leaving");
  });

  // REGRESIÓN: "déjalo así" terminaba en CIERRE, porque "asi" contiene "si".
  // El cliente se bajaba de la compra y el bot avanzaba hacia el pago.
  it('"déjalo así" no dispara el cierre', () => {
    expect(detectIntent("dejalo asi")).not.toBe("confirmation");
    expect(detectIntent("dejalo asi")).not.toBe("payment_intent");
  });
});
