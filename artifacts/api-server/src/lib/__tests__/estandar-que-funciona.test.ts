import { describe, it, expect } from "vitest";
import { dondeSePierde, revisarMensaje, comoVa, CLIC_A_CONVERSACION_PORCENTAJE, REGLAS_DE_CONVERSACION } from "../estandar-que-funciona";

/**
 * El estándar que separa una cuenta que gana plata de una que la quema.
 *
 * El admin lo pidió así: "necesitamos saber lo que realmente funciona en
 * WhatsApp, en anuncios, en copy y en todo, para que los que usen la app
 * tengan rendimientos verdaderos".
 *
 * Lo que se prueba acá no son los números —esos son de mercado— sino que el
 * diagnóstico DIGA DÓNDE está el problema. "Tu CPA es alto" no le sirve a
 * nadie; "el anuncio funciona pero la gente no escribe al abrir el chat" dice
 * qué tocar.
 */
describe("Decir DÓNDE se pierde la plata, no dar un puntaje", () => {
  it("el caso real de esta cuenta: mucho clic, poca conversación", () => {
    // Medido en producción el 2026-08-29: 57 resultados de Meta y solo 10
    // conversaciones atribuidas. El 82% se perdía entre el clic y el chat.
    const r = dondeSePierde({ clics: 57, conversaciones: 10, ventas: 0, gasto: 20104 });
    expect(r.etapa).toBe("entre el clic y el chat");
    expect(r.veredicto).toBe("malo");
    expect(r.diagnostico).toMatch(/al abrir WhatsApp/);
  });

  it("distingue 'el anuncio no atrae' de 'el chat no vende'", () => {
    // Son dos problemas distintos y se arreglan en lugares distintos.
    const anuncio = dondeSePierde({ clics: 0, conversaciones: 0, ventas: 0, gasto: 5000 });
    expect(anuncio.etapa).toBe("el anuncio");

    const chat = dondeSePierde({ clics: 100, conversaciones: 75, ventas: 0, gasto: 5000 });
    expect(chat.etapa).toBe("la conversación");
    expect(chat.diagnostico).toMatch(/cómo vende el agente/);
  });

  it("un embudo sano no se marca como problema", () => {
    // La regla tiene que servir para saber cuándo NO tocar nada.
    const r = dondeSePierde({ clics: 100, conversaciones: 80, ventas: 15, gasto: 5000 });
    expect(r.veredicto).toBe("excelente");
  });

  it("los umbrales se leen en la dirección correcta", () => {
    // Más conversaciones por clic es mejor; más costo por conversación es peor.
    expect(comoVa(85, CLIC_A_CONVERSACION_PORCENTAJE, true)).toBe("excelente");
    expect(comoVa(30, CLIC_A_CONVERSACION_PORCENTAJE, true)).toBe("malo");
  });
});

describe("Revisar el mensaje contra lo que funciona", () => {
  it("marca el muro de texto", () => {
    const r = revisarMensaje({ texto: "a".repeat(700) });
    expect(r.join(" ")).toMatch(/pantalla de celular/);
  });

  it("marca las dos preguntas que compiten", () => {
    const r = revisarMensaje({ texto: "¿Querés el curso? ¿O preferís que te llame?" });
    expect(r.join(" ")).toMatch(/2 preguntas/);
  });

  it("marca repetir textual un bloque ya enviado", () => {
    // Un saludo repetido es normal; un párrafo repetido dice que nadie está
    // leyendo del otro lado.
    const bloque = "El curso incluye 40 lecciones en video, acceso de por vida y material descargable para practicar en casa cuando quieras.";
    const r = revisarMensaje({ texto: `Mirá: ${bloque}`, yaEnviado: [bloque] });
    expect(r.join(" ")).toMatch(/Repite textual/);
  });

  it("un mensaje bueno no genera ruido", () => {
    // Si marcara mensajes correctos, nadie le haría caso.
    const r = revisarMensaje({
      texto: "El curso de piano cuesta $60.000 COP y te queda de por vida.\n\n¿Te muestro cómo son las clases? 🎬",
      yaEnviado: ["¡Hola! ¿En qué te ayudo?"],
    });
    expect(r).toEqual([]);
  });
});

describe("Las reglas de conversación están completas y explicadas", () => {
  it("cada regla dice POR QUÉ, no solo qué hacer", () => {
    // Una regla sin motivo no se respeta cuando aprieta el caso raro.
    for (const r of REGLAS_DE_CONVERSACION) {
      expect(r.porque.length, r.id).toBeGreaterThan(30);
    }
  });

  it("incluye las que este proyecto aprendió a los golpes", () => {
    const ids = REGLAS_DE_CONVERSACION.map((r) => r.id);
    expect(ids).toContain("dar-antes-de-pedir");
    expect(ids).toContain("no-repetir");
    expect(ids).toContain("no-afirmar-sin-dato");
  });
});
