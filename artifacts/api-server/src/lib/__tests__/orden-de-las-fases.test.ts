import { describe, it, expect } from "vitest";
import { seccionQueCorresponde, invitacionDe } from "../ficha-parcial";

/**
 * EL ORDEN DE LAS FASES, escrito para que no se corra solo.
 *
 * El admin lo pidió así el 2026-09-01: *"revisá cada maqueta, cada detalle, y
 * no solo recortes: sacá el tiempo para ordenar cada fase en su lugar, y que
 * no diga contenido cuando ya está arriba, o precio dando cuando no lo han
 * preguntado"*.
 *
 * La secuencia que se defiende acá:
 *
 *   1. PRESENTAR   qué es y qué trae.            SIN precio.
 *   2. PROFUNDIZAR el video, si lo pide o acepta.
 *   3. PRECIO      cuando lo pregunta.
 *   4. PAGO        cuando pregunta CÓMO pagar.
 *   5. ENTREGA     cuando pregunta cómo le llega.
 *
 * Cada fase responde lo que se preguntó y deja UNA cosa por preguntar. Las dos
 * formas de romperla son adelantarse --dar el precio a quien preguntó si el
 * producto existe-- y repetirse --ofrecer el contenido en el mismo mensaje que
 * lo lista. Las dos aparecieron en producción y las dos están cubiertas abajo.
 */

const elige = (mensaje: string, extra: Partial<Parameters<typeof seccionQueCorresponde>[0]> = {}) =>
  seccionQueCorresponde({ mensaje, intent: "info", fichaYaEnviada: false, ...extra } as any);

describe("1. cada pregunta cae en su fase", () => {
  it("'¿tienes el curso de piano?' presenta, no cotiza", () => {
    // Pregunta si EXISTE. Contestar con el número salta dos pasos.
    expect(elige("Tienes el curso de piano")).toBe("completa");
    expect(elige("Me interesa el curso de inteligencia artificial")).toBe("completa");
  });

  it("'¿cuánto vale?' sí cotiza", () => {
    expect(elige("cuánto vale")).toBe("precio");
    expect(elige("qué precio tiene")).toBe("precio");
  });

  it("'¿cómo pago?' da los medios, que ya incluyen el precio", () => {
    expect(elige("cómo pago")).toBe("pago");
    expect(elige("qué formas de pago tienen")).toBe("pago");
  });

  it("'¿cómo me llega?' habla de entrega, no de plata", () => {
    expect(elige("cómo me llega")).toBe("entrega");
  });

  it("pedir el video gana a todo lo demás", () => {
    expect(elige("me muestras el video")).toBe("video");
  });

  it("y un 'sí' contesta lo ÚLTIMO que se ofreció, no pide pagar", () => {
    // El defecto del 2026-08-31: ofreció el video, el cliente dijo "Si", y
    // recibió los tres medios de pago.
    expect(elige("Si", { ofrecimosVideo: true })).toBe("video");
    expect(elige("dale", { ofrecimosContenido: true })).toBe("info");
  });
});

describe("2. la presentación no se adelanta al precio", () => {
  it("el cierre de 'completa' avanza al precio", () => {
    // El video se comparte automáticamente una vez con la presentación.
    expect(invitacionDe("completa", false, "sem", true)).toMatch(/precio|cu[aá]nto/i);
  });

  it("sin video cargado, ofrece el precio y NO promete un video que no existe", () => {
    const c = invitacionDe("completa", false, "sem", false);
    expect(c).not.toMatch(/video/i);
    expect(c).toMatch(/precio|cu[aá]nto/i);
  });
});

describe("3. no se ofrece lo que ya está arriba", () => {
  it("'completa' NUNCA ofrece contar qué incluye: acaba de listarlo", () => {
    // Los dos caminos, porque el defecto vivía en el que no se revisó: el
    // atajo de "sin video" corre ANTES de la lógica de yaVioContenido.
    for (const tieneVideo of [true, false]) {
      const c = invitacionDe("completa", false, "sem", tieneVideo);
      expect(c, `tieneVideo=${tieneVideo}`).not.toMatch(/qu[eé] (incluye|trae|viene)/i);
    }
  });

  it("'info' tampoco: es la otra que lista características", () => {
    for (const tieneVideo of [true, false]) {
      const c = invitacionDe("info", false, "sem", tieneVideo);
      expect(c, `tieneVideo=${tieneVideo}`).not.toMatch(/qu[eé] (incluye|trae|viene)/i);
    }
  });

  it("y si ya vio la ficha, el precio tampoco se la vuelve a ofrecer", () => {
    const c = invitacionDe("precio", false, "sem", true, true);
    expect(c).not.toMatch(/qu[eé] (incluye|trae|viene)/i);
  });
});

describe("4. lo que ya funcionaba no se rompe", () => {
  it("con la ficha ya enviada no se vuelca el muro entero", () => {
    // Repetir la ficha es lo que hace ver al bot como un folleto en bucle.
    expect(elige("y eso qué tal es", { fichaYaEnviada: true })).toBe("info");
  });

  it("pedir la tienda no manda a pagar", () => {
    expect(elige("tienes tienda")).toBe("tienda");
  });

  it("un medio concreto gana sobre el genérico", () => {
    expect(elige("me pasas el nequi")).toBe("pago_transferencia");
  });
});
