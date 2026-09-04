import { describe, it, expect } from "vitest";
import { supervisarRespuesta } from "../supervisor";
import { elSiContestaLaOferta } from "../ficha-parcial";

/**
 * "No está teniendo uso de razón a la hora de enviar la información, no
 * analiza si lo que está enviando está bien, y no tiene memoria de lo que
 * pasa." — el admin, 2026-08-30.
 *
 * La conversación que lo destapó:
 *
 *   bot:     [ficha con las 4 características del curso]
 *   bot:     "💰 $60.000 COP — ¿Te cuento qué incluye? 👀"
 *   cliente: "Sí"
 *   bot:     [los tres medios de pago, con el número de Nequi]
 *
 * Dos fallos encadenados y los dos son de memoria:
 *
 *   1. Ofreció contarle lo que acababa de contarle.
 *   2. Leyó ese "Sí" como "sí, quiero pagar" — cuando contestaba a la
 *      pregunta anterior.
 *
 * Pedirle plata a quien todavía está averiguando es de las pocas formas de
 * perder una venta que venía encaminada.
 */
const PIANO = { id: 123, name: "Curso de Piano", price: 60000, currency: "COP" } as any;

const FICHA_YA_ENVIADA = `INTELIGENCIA ARTIFICIAL 2026

🤖 3 cursos: Agentes IA, Claude AI completo y Gemini
⚙️ n8n sin código: agente IA, APIs, webhooks y RAG
🎨 Claude Code y Claude Design
🚀 Agentes con OpenClaw`;

describe("No ofrecer lo que ya se envió", () => {
  it("quita el ofrecimiento cuando la ficha ya listó el contenido", () => {
    const r = supervisarRespuesta({
      respuesta: "💰 $60.000 COP\n\n¿Te cuento qué incluye? 👀",
      mensajeCliente: "me interesa",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
      yaEnviado: [FICHA_YA_ENVIADA],
    });
    expect(r.hallazgos.map((h) => h.regla)).toContain("ofrece-lo-ya-enviado");
    expect(r.texto).not.toMatch(/Te cuento qué incluye/i);
    // Lo que el mensaje SÍ decía se conserva: sobraba el cierre, no el precio.
    expect(r.texto).toContain("60.000");
  });

  it("si NO se le envió el contenido, el ofrecimiento se respeta", () => {
    // La regla tiene que seguir dejando trabajar al bot: ofrecer el contenido
    // a quien no lo vio es exactamente lo correcto.
    const r = supervisarRespuesta({
      respuesta: "💰 $60.000 COP\n\n¿Te cuento qué incluye? 👀",
      mensajeCliente: "cuánto vale",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
      yaEnviado: ["¡Hola! ¿En qué te ayudo?"],
    });
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("ofrece-lo-ya-enviado");
    expect(r.texto).toMatch(/Te cuento qué incluye/i);
  });

  it("sin historial no se mete", () => {
    const r = supervisarRespuesta({
      respuesta: "¿Te cuento qué incluye? 👀",
      mensajeCliente: "hola",
      productos: [PIANO],
      idsEnContexto: [123],
      llevaCard: false,
    });
    expect(r.hallazgos.map((h) => h.regla)).not.toContain("ofrece-lo-ya-enviado");
  });
});

describe("Un 'sí' contesta la pregunta anterior, no pide el checkout", () => {
  it("el caso real: 'Sí' después de ofrecerle el contenido", () => {
    expect(elSiContestaLaOferta({ mensaje: "Sí", ofrecimosContenido: true })).toBe(true);
    expect(elSiContestaLaOferta({ mensaje: "dale", ofrecimosVideo: true })).toBe(true);
    expect(elSiContestaLaOferta({ mensaje: "listo 👍", ofrecimosContenido: true })).toBe(true);
  });

  it("si el bot NO ofreció nada, un 'sí' sigue siendo confirmación", () => {
    // No se puede romper el cierre: quien dice que sí a "¿lo llevás?" quiere
    // pagar, y ahí la ficha de pago es lo correcto.
    expect(elSiContestaLaOferta({ mensaje: "Sí" })).toBe(false);
  });

  it("un 'sí' con intención de compra explícita NO se desvía", () => {
    // "sí, lo compro" trae más palabras: no es una afirmación suelta.
    expect(elSiContestaLaOferta({ mensaje: "si lo compro", ofrecimosContenido: true })).toBe(false);
    expect(elSiContestaLaOferta({ mensaje: "dale mandame el link de pago", ofrecimosContenido: true })).toBe(false);
  });
});
