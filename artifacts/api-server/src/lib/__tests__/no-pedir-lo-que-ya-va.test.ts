/**
 * Las frases son las TEXTUALES de la conversación de producción del
 * 2026-09-05 11:02, donde el bot preguntó dos veces y no esperó ninguna de las
 * dos respuestas.
 */
import { describe, expect, it } from "vitest";
import { loQueYaVa, sinPedirPermiso, sinPreguntarLoQueYaVa } from "../no-pedir-lo-que-ya-va";

// El texto exacto que escribió el modelo antes de que saliera la ficha.
const PREAMBULO =
  "¡Hola Duvier! 😊 Te cuento que el curso de piano es súper completo: arranca desde cero y llega hasta nivel avanzado.\n\n¿Quieres que te pase toda la info por acá?";

const FICHA = { kind: "card", productId: 7, seccion: "info" };

describe("el caso real: pregunta y no espera", () => {
  it("quita la pregunta cuando la ficha va en el mismo envío", () => {
    const { partes, quitadas } = sinPreguntarLoQueYaVa([
      { kind: "text", content: PREAMBULO },
      FICHA,
    ]);
    expect(quitadas).toBe(1);
    const texto = String(partes[0].content);
    expect(texto).not.toContain("¿Quieres que te pase toda la info");
    // Y lo que sí valía se conserva: es la parte que presenta el producto.
    expect(texto).toContain("arranca desde cero");
  });

  it("si la ficha NO va, la pregunta se queda", () => {
    // Sin entrega enganchada, esa pregunta es lo único que mantiene viva la
    // conversación. Quitarla dejaría al bot entregando y callándose.
    const { partes, quitadas } = sinPreguntarLoQueYaVa([{ kind: "text", content: PREAMBULO }]);
    expect(quitadas).toBe(0);
    expect(String(partes[0].content)).toContain("¿Quieres que te pase toda la info");
  });
});

describe("qué se va a entregar en el envío", () => {
  it("la ficha de info entrega contenido, y arrastra el video", () => {
    // `estaFichaMuestraContenido` engancha el video al final de "info" y
    // "completa": ofrecerlo en el texto sería ofrecer lo que ya va.
    const va = loQueYaVa([FICHA]);
    expect(va.has("contenido")).toBe(true);
    expect(va.has("video")).toBe(true);
  });

  it('"info" NO lleva precio: esa pregunta sigue siendo válida', () => {
    // Es deliberado en whatsapp.ts -- el precio es la pregunta siguiente.
    expect(loQueYaVa([FICHA]).has("precio")).toBe(false);
  });

  it('"completa" sí lleva precio', () => {
    expect(loQueYaVa([{ kind: "card", seccion: "completa" }]).has("precio")).toBe(true);
  });

  it("sin tarjetas no se entrega nada", () => {
    expect(loQueYaVa([{ kind: "text", content: "hola" }]).size).toBe(0);
  });
});

describe("se quita lo que sobra, no lo que sirve", () => {
  it('"¿Te paso el precio?" se queda si el precio no viaja', () => {
    const { partes } = sinPreguntarLoQueYaVa([
      { kind: "text", content: "¿Te paso el precio? 💰" },
      FICHA,
    ]);
    expect(String(partes[0].content)).toContain("¿Te paso el precio?");
  });

  it('"¿Te paso el precio?" se va si la ficha completa ya lo trae', () => {
    const { partes, quitadas } = sinPreguntarLoQueYaVa([
      { kind: "text", content: "Mirá esto. ¿Te paso el precio? 💰" },
      { kind: "card", seccion: "completa" },
    ]);
    expect(quitadas).toBe(1);
    expect(String(partes[0].content)).not.toContain("¿Te paso el precio?");
    expect(String(partes[0].content)).toContain("Mirá esto");
  });

  it("también atrapa el ofrecimiento sin signo de pregunta", () => {
    // "Te muestro el contenido detallado" ofrece igual que "¿Te lo muestro?".
    // Ya costó una venta en producción (ver ficha-parcial.ts, 2026-09-02).
    const { quitadas } = sinPreguntarLoQueYaVa([
      { kind: "text", content: "Ideal si nunca has tocado. Te muestro el contenido detallado" },
      FICHA,
    ]);
    expect(quitadas).toBe(1);
  });

  it("no toca un texto que no ofrece nada", () => {
    const t = "El curso arranca desde cero y llega a nivel avanzado.";
    const { partes, quitadas } = sinPreguntarLoQueYaVa([{ kind: "text", content: t }, FICHA]);
    expect(quitadas).toBe(0);
    expect(partes[0].content).toBe(t);
  });

  it("una pregunta sobre otra cosa se respeta", () => {
    const t = "¿Ya has tocado algún instrumento antes?";
    const { partes, quitadas } = sinPreguntarLoQueYaVa([{ kind: "text", content: t }, FICHA]);
    expect(quitadas).toBe(0);
    expect(partes[0].content).toBe(t);
  });
});

describe("bordes que no pueden romper el envío", () => {
  it("si el texto queda vacío, la parte se elimina en vez de mandar un blanco", () => {
    // Un mensaje en blanco es peor que la pregunta, y ademas cuenta contra los
    // topes anti-bloqueo de WhatsApp.
    const { partes } = sinPreguntarLoQueYaVa([
      { kind: "text", content: "¿Quieres que te pase toda la info por acá?" },
      FICHA,
    ]);
    expect(partes.filter((p) => p.kind === "text")).toHaveLength(0);
    expect(partes).toHaveLength(1);
  });

  it("la tarjeta nunca se toca", () => {
    const { partes } = sinPreguntarLoQueYaVa([{ kind: "text", content: PREAMBULO }, FICHA]);
    expect(partes.find((p) => p.kind === "card")).toEqual(FICHA);
  });

  it("aguanta lista vacía, null y partes sin contenido", () => {
    expect(sinPreguntarLoQueYaVa([]).quitadas).toBe(0);
    expect(sinPreguntarLoQueYaVa(null).partes).toEqual([]);
    expect(sinPreguntarLoQueYaVa([{ kind: "text", content: "" }, FICHA]).quitadas).toBe(0);
  });

  it("no altera el orden de lo que queda", () => {
    const { partes } = sinPreguntarLoQueYaVa([
      { kind: "text", content: "Uno." },
      FICHA,
      { kind: "text", content: "Dos." },
    ]);
    expect(partes.map((p) => p.kind)).toEqual(["text", "card", "text"]);
  });

  it("sinPedirPermiso con un conjunto vacío devuelve el texto igual", () => {
    expect(sinPedirPermiso(PREAMBULO, new Set())).toBe(PREAMBULO);
  });
});
