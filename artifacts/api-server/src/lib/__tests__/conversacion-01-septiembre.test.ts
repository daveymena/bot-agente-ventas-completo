import { describe, it, expect } from "vitest";
import { seccionQueCorresponde, elCierreOfrece, invitacionDe, elSiContestaLaOferta } from "../ficha-parcial";
import { promesasIncumplidas } from "../promesas";
import { videoDeProducto } from "../video-de-producto";

/**
 * ============================================================
 * LA CONVERSACION DEL 2026-09-01, TURNO POR TURNO
 * ============================================================
 *
 * El admin la trajo entera y tenia razon en las tres cosas que marco. Esta
 * prueba la replica sobre las funciones que DECIDEN, para que ninguna de las
 * tres pueda volver sin que el banco se ponga rojo.
 *
 * No llama al modelo a proposito: lo que fallo no fue el modelo, fueron las
 * reglas del servidor alrededor. Un banco que necesita la IA para correr no se
 * ejecuta en cada cambio, y este tiene que ejecutarse en cada cambio.
 *
 * Transcripcion original (los tres fallos marcados):
 *
 *   05:17 cliente: "Me interesa el curso de piano"
 *   05:17 bot:     "Te paso la ficha completa asi lo miras con calma."   [1]
 *   06:23 cliente: "?"
 *   06:23 bot:     "¡Sí! Mira 👇" + ficha de INTELIGENCIA ARTIFICIAL     [2]
 *   06:37 cliente: "Y el curso de piano?"
 *   06:37 bot:     [ficha de piano] "¿Te muestro el video? 🎬"
 *   06:37 cliente: "Si"
 *   06:37 bot:     "¡Perfecto!" + [los tres medios de pago]              [3]
 *
 *   [1] prometio la ficha y no mando ninguna -> una hora esperando
 *   [2] pidio piano dos veces y recibio otro curso, afirmando "¡Sí!"
 *   [3] acepto ver el video y recibio el checkout
 */

const PIANO = {
  id: 123,
  name: "CURSO DE PIANO COMPLETO",
  kind: "digital",
  metadata: { videoIntro: "https://drive.google.com/file/d/piano/view" },
};

describe("Fallo 3: el video se comparte sin pedir autorización", () => {
  it("la ficha completa de un curso CON video avanza al precio", () => {
    const tieneVideo = !!videoDeProducto(PIANO.metadata);
    const cierre = invitacionDe("completa", false, "573042748687", tieneVideo, true);
    expect(cierre).toMatch(/precio|cu[aá]nto/i);
  });

  it("y esa oferta se guarda como 'precio'", () => {
    // Aca estaba el bug: agent.ts pasaba `producto.metadata` a una funcion que
    // espera el PRODUCTO, asi que tieneVideo era siempre false y la metadata
    // guardada decia "otro".
    const tieneVideo = !!videoDeProducto(PIANO.metadata);
    expect(elCierreOfrece("completa", false, tieneVideo, true)).toBe("precio");
  });

  it("un sí solo sigue llevando al video si el cliente lo pidió explícitamente", () => {
    const seccion = seccionQueCorresponde({
      mensaje: "Si",
      intent: "confirmation", // detectIntent lee un "si" suelto como compra
      fichaYaEnviada: true,
      ofrecimosVideo: true,
      videoYaEnviado: false,
    });
    expect(seccion).toBe("video");
  });

  it("y el guardia anti-checkout conserva la lectura de una oferta de video", () => {
    expect(elSiContestaLaOferta({ mensaje: "Si", ofrecimosVideo: true })).toBe(true);
  });

  it("si el curso NO tuviera video, nunca se habria ofrecido", () => {
    const cierre = invitacionDe("completa", false, "573042748687", false, true);
    expect(cierre).not.toMatch(/video/i);
    expect(elCierreOfrece("completa", false, false, true)).not.toBe("video");
  });
});

describe("Fallo 1: prometio la ficha y no mando ninguna", () => {
  const textoDelBot =
    "¡Buenísimo que preguntes por el de piano! 🎹 Te paso la ficha completa así lo miras con calma.";

  it("el candado detecta que ese texto promete algo que no sale", () => {
    expect(
      promesasIncumplidas(textoDelBot, { hayFicha: false, seccion: null, mensajes: [textoDelBot] }),
    ).toEqual(["ficha"]);
  });

  it("y no molesta cuando la ficha SI sale", () => {
    expect(
      promesasIncumplidas(textoDelBot, { hayFicha: true, seccion: "completa", mensajes: [textoDelBot] }),
    ).toEqual([]);
  });
});

describe("Fallo 3 bis: el checkout no puede salir por un 'si' a otra cosa", () => {
  it("un 'si' que acepta CONTENIDO devuelve info, no pago", () => {
    expect(
      seccionQueCorresponde({
        mensaje: "Si", intent: "confirmation",
        fichaYaEnviada: true, ofrecimosContenido: true,
      }),
    ).toBe("info");
  });

  it("pero un 'si' que ademas pide pagar SI va al pago", () => {
    expect(
      seccionQueCorresponde({
        mensaje: "si, ¿cómo pago?", intent: "confirmation",
        fichaYaEnviada: true, ofrecimosContenido: true,
      }),
    ).toBe("pago");
  });

  it("y un 'si' sin nada ofrecido antes sigue siendo intencion de compra", () => {
    expect(
      seccionQueCorresponde({ mensaje: "Si", intent: "confirmation", fichaYaEnviada: true }),
    ).toBe("pago");
  });
});

describe("El recorrido completo del cliente que SI compra", () => {
  /** Cada turno: lo que escribe el cliente y que seccion le corresponde. */
  const recorrido: Array<{ dice: string; contexto: Parameters<typeof seccionQueCorresponde>[0]; espera: string }> = [
    {
      dice: "Me interesa el curso de piano",
      contexto: { mensaje: "Me interesa el curso de piano" },
      espera: "completa",
    },
    {
      dice: "¿qué incluye?",
      contexto: { mensaje: "¿qué incluye?", fichaYaEnviada: true },
      espera: "info",
    },
    {
      dice: "Si  (aceptando ver el video)",
      contexto: { mensaje: "Si", fichaYaEnviada: true, ofrecimosVideo: true },
      espera: "video",
    },
    {
      dice: "¿cuánto vale?",
      contexto: { mensaje: "¿cuánto vale?", fichaYaEnviada: true, videoYaEnviado: true },
      espera: "precio",
    },
    {
      dice: "¿cómo pago?",
      contexto: { mensaje: "¿cómo pago?", fichaYaEnviada: true, videoYaEnviado: true },
      espera: "pago",
    },
    {
      dice: "por nequi",
      contexto: { mensaje: "por nequi", fichaYaEnviada: true, videoYaEnviado: true },
      espera: "pago_transferencia",
    },
  ];

  it("cada turno recibe lo que pidio, y nada mas", () => {
    for (const paso of recorrido) {
      expect(seccionQueCorresponde(paso.contexto), paso.dice).toBe(paso.espera);
    }
  });

  it("el video no se repite si ya se envio", () => {
    expect(
      seccionQueCorresponde({
        mensaje: "Si", fichaYaEnviada: true, ofrecimosVideo: true, videoYaEnviado: true,
      }),
    ).not.toBe("video");
  });
});
