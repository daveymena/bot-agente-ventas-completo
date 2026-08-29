import { describe, it, expect } from "vitest";
import { markdownAWhatsapp, sanitizeResponse } from "../conversation-engine";
import { MODELO_DE_RAZONAMIENTO } from "../agent";

/**
 * WhatsApp NO entiende markdown.
 *
 * Usa `*negrita*` con UN asterisco, `_cursiva_` y `~tachado~`. Todo lo demás
 * se muestra literal, con sus asteriscos y sus corchetes a la vista.
 *
 * Los modelos escriben markdown por defecto y eso llegaba CRUDO al cliente.
 * Estos tres casos son textuales, de conversaciones reales con leads que se
 * pagaron por publicidad (2026-08-29):
 *
 *   "El **Pack Contabilidad** es justo lo que necesitás"
 *   "**[Curso de Piano Completo: De Cero a Nivel Avanzado](CARD: 123)**"
 *   "el precio del curso es fijo en **$60.000 COP**"
 *
 * El del medio es el peor: el cliente ve corchetes, paréntesis y la palabra
 * CARD. Parece un error de sistema, y alguien que está por pagar y ve un error
 * de sistema no paga.
 */

describe("Lo que el cliente ve de verdad en WhatsApp", () => {
  it("la negrita de markdown se convierte, no se muestra", () => {
    // Convertir y no borrar: resaltar el precio era la intención correcta;
    // lo que estaba mal era la sintaxis.
    expect(markdownAWhatsapp("el precio es **$60.000 COP**")).toBe("el precio es *$60.000 COP*");
    expect(markdownAWhatsapp("El **Pack Contabilidad** es justo")).toBe("El *Pack Contabilidad* es justo");
    expect(markdownAWhatsapp("__importante__")).toBe("*importante*");
    expect(markdownAWhatsapp("***muy***")).toBe("*muy*");
  });

  it("el enlace markdown deja el texto y se lleva los corchetes", () => {
    // El caso real, con el destino inventado por el modelo.
    expect(markdownAWhatsapp("**[Curso de Piano Completo](CARD: 123)**"))
      .toBe("*Curso de Piano Completo*");
    expect(markdownAWhatsapp("mirá [acá](https://x.com)")).toBe("mirá acá");
  });

  it("no rompe la negrita que WhatsApp SÍ entiende", () => {
    // Un asterisco simple ya es correcto: tocarlo sería empeorarlo.
    expect(markdownAWhatsapp("*Curso de Piano*")).toBe("*Curso de Piano*");
    expect(markdownAWhatsapp("Hola *Ana*, mirá esto")).toBe("Hola *Ana*, mirá esto");
  });

  it("los encabezados quedan como negrita, que es lo que el modelo quería", () => {
    expect(markdownAWhatsapp("## Qué incluye")).toBe("*Qué incluye*");
  });

  it("los bloques de código se abren: el cliente no lee backticks", () => {
    expect(markdownAWhatsapp("transferí a `3001234567`")).toBe("transferí a 3001234567");
  });

  it("un texto sin markdown sale igual", () => {
    const t = "¡Hola! 😊 El curso cuesta $60.000 COP y lo recibís al instante.";
    expect(markdownAWhatsapp(t)).toBe(t);
  });

  it("se limpia TAMBIÉN en los mensajes de pago", () => {
    // Antes esos dos intents salían sin tocar. Son justamente los mensajes
    // donde el cliente está por transferir plata, y donde un "**$60.000**"
    // mal formateado hace dudar.
    const r = sanitizeResponse("Transferí **$60.000 COP** y te confirmo", "payment_intent" as any);
    expect(r).toContain("*$60.000 COP*");
    expect(r).not.toContain("**");
  });

  it("y en los mensajes normales, junto con el resto de la limpieza", () => {
    const r = sanitizeResponse("Mirá el **Curso de Piano** acá: https://ejemplo.com/x", "details_query" as any);
    expect(r).toContain("*Curso de Piano*");
    expect(r).not.toContain("**");
    expect(r).not.toContain("http");
  });
});

/**
 * Ningún modelo de RAZONAMIENTO atiende a un cliente.
 *
 * Medido en producción el 2026-08-29, con DeepSeek recién habilitado: el bot
 * contestó con `deepseek/deepseek-reasoner` y tardó 26 y 30 SEGUNDOS. Las
 * respuestas eran buenas -- el problema es que nadie espera medio minuto en
 * WhatsApp. Para cuando llega, el cliente cerró el chat.
 *
 * `deepseek-chat`, el MISMO proveedor, responde en ~800ms. La diferencia no es
 * el proveedor: es que un modelo de razonamiento gasta el presupuesto pensando
 * antes de escribir.
 */
describe("Qué modelos pueden atender a un cliente", () => {
  // La misma expresión que filtra la cola en agent.ts.
  // Se usa la expresión REAL de agent.ts, no una copia. Una prueba que
  // reimplementa la regla sigue en verde aunque el código real se rompa -- es
  // el mismo error que ya se cometió en esta sesión con `formatPrice`.
  const pasa = (modelo: string) => !MODELO_DE_RAZONAMIENTO.test(modelo);

  it("los de razonamiento quedan afuera", () => {
    for (const m of ["deepseek-reasoner", "qwen-thinking", "deepseek-r1", "o1-reasoning"]) {
      expect(pasa(m), m).toBe(false);
    }
  });

  it("los de conversación pasan", () => {
    // Incluido `deepseek-chat`, que es el que SÍ hay que usar de ese proveedor.
    for (const m of ["deepseek-chat", "openai/gpt-oss-120b", "qwen/qwen3.8-27b", "big-pickle", "gpt-4o-mini"]) {
      expect(pasa(m), m).toBe(true);
    }
  });

  it("no confunde un nombre que solo CONTIENE letras parecidas", () => {
    // "r1" suelto dentro de otra palabra no debería descartar un modelo bueno.
    expect(pasa("mistral-large-latest")).toBe(true);
    expect(pasa("claude-sonnet-4")).toBe(true);
  });
});
