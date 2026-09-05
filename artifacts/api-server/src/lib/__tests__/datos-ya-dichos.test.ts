/**
 * §14 del playbook: no repetir lo que el cliente ya sabe.
 *
 * ⚠️ `no-repetir.ts` ya existía, pero compara MENSAJES: atrapa que el bot mande
 * dos veces el mismo texto. Deja pasar lo que de verdad molesta:
 *
 *     turno 1: "El curso cuesta $60.000 COP."
 *     turno 3: "Te comento que la inversión es de sesenta mil pesos."
 *
 * Textos distintos, misma información. Para el cliente es "ya me dijiste", y
 * esa sensación es la que hace que la conversación parezca un formulario.
 */
import { describe, it, expect } from "vitest";
import { datosQueTrae, datosYaDichos, bloqueDeLoYaDicho } from "../datos-ya-dichos";

const delAgente = (...textos: string[]) => textos.map((content) => ({ role: "agent", content }));

describe("reconoce el dato aunque cambie la redacción", () => {
  /** EL CASO que no-repetir.ts no ve. */
  it("el precio, dicho de cuatro formas distintas", () => {
    for (const t of [
      "El curso cuesta $60.000 COP.",
      "Te comento que la inversión es de sesenta mil pesos.",
      "Vale 60.000 COP",
      "El precio es accesible",
    ]) {
      expect(datosQueTrae(t), `no vio el precio en: ${t}`).toContain("precio");
    }
  });

  it.each([
    ["19 horas de contenido", "duracion"],
    ["dura tres semanas", "duracion"],
    ["incluye 3 cursos completos", "que-incluye"],
    ["vas a aprender a crear agentes", "que-incluye"],
    ["te llega por Google Drive", "como-se-entrega"],
    ["acceso de por vida", "como-se-entrega"],
    ["podés pagar por Nequi o Daviplata", "como-se-paga"],
    ["aceptamos tarjeta y PSE", "como-se-paga"],
    ["tiene garantía de satisfacción", "garantia"],
    ["el envío llega en 3 días", "envio"],
  ] as [string, string][])("reconoce %s", (texto, dato) => {
    expect(datosQueTrae(texto)).toContain(dato);
  });

  it("un saludo no trae ningún dato comercial", () => {
    expect(datosQueTrae("¡Hola! ¿En qué te ayudo?")).toEqual([]);
    expect(datosQueTrae("")).toEqual([]);
  });
});

describe("solo cuenta lo que dijo el AGENTE", () => {
  /**
   * ⚠️ Que el cliente pregunte "¿cuánto cuesta?" NO significa que se lo hayamos
   * dicho -- al contrario, es la señal de que falta. Contarlo haría que el bot
   * creyera haber respondido algo que nunca respondió, y eso es peor que
   * repetir: deja al cliente sin el dato.
   */
  it("una pregunta del cliente no cuenta como respondida", () => {
    const historial = [{ role: "customer", content: "¿cuánto cuesta el curso?" }];
    expect(datosYaDichos(historial).has("precio")).toBe(false);
  });

  it("pero la respuesta del agente sí", () => {
    const historial = [
      { role: "customer", content: "¿cuánto cuesta?" },
      { role: "agent", content: "Cuesta $60.000 COP." },
    ];
    expect(datosYaDichos(historial).has("precio")).toBe(true);
  });

  /** El agente guarda como "agent"; otros canales usaron "assistant". */
  it("acepta los dos roles con que se guarda al agente", () => {
    expect(datosYaDichos([{ role: "assistant", content: "vale $60.000" }]).has("precio")).toBe(true);
  });

  it("junta lo dicho en varios turnos", () => {
    const dichos = datosYaDichos(delAgente("Cuesta $60.000.", "Son 19 horas de video.", "Te llega por Drive."));
    expect([...dichos].sort()).toEqual(["como-se-entrega", "duracion", "precio"]);
  });

  it("no se rompe sin historial", () => {
    expect(datosYaDichos(null).size).toBe(0);
    expect(datosYaDichos([]).size).toBe(0);
  });
});

describe("el bloque que ve el modelo", () => {
  it("nombra los datos en español, no las claves internas", () => {
    const b = bloqueDeLoYaDicho(delAgente("Cuesta $60.000 y son 19 horas."));
    expect(b).toContain("el precio");
    expect(b).toContain("cuánto dura");
    expect(b).not.toContain("que-incluye");
    expect(b).not.toContain("como-se-paga");
  });

  /**
   * Una prohibición seca produce el error opuesto: el cliente pregunta "¿cuánto
   * era?" y el bot se niega a contestar por no repetirse. Por eso el bloque
   * dice CUÁNDO sí conviene.
   */
  it("explica cuándo sí se puede repetir", () => {
    const b = bloqueDeLoYaDicho(delAgente("Cuesta $60.000."));
    expect(b).toMatch(/pregunte de nuevo/i);
    expect(b).toMatch(/haya cambiado/i);
  });

  /** En el primer mensaje no hay nada dicho: un bloque vacío es peso muerto. */
  it("sin nada dicho, no ocupa lugar en el prompt", () => {
    expect(bloqueDeLoYaDicho([])).toBe("");
    expect(bloqueDeLoYaDicho(delAgente("¡Hola! ¿En qué te ayudo?"))).toBe("");
  });
});
