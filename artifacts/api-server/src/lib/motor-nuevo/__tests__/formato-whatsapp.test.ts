/**
 * EL FORMATO DE WHATSAPP SE MIDE AL SALIR.
 *
 * El prompt pide "2 a 4 frases, un emoji suelto, sin listas ni títulos" y hasta
 * ahora **nada lo comprobaba**: era la única regla del motor sin verificación.
 * Los casos de acá salen de mensajes REALES que recibieron clientes (están
 * documentados en `emojis-con-medida.ts`).
 */
import { describe, test, expect } from "vitest";
import { medirFormato, hayProblemaDeFormato, pedidoDeReescritura } from "../formato-whatsapp";

describe("una respuesta bien formateada no genera problemas", () => {
  test("el mensaje corto y directo que el prompt pide", () => {
    const m = medirFormato("El bolso va en $89.900 y lo pagas al recibir. 🚚\n\n¿Te lo llevamos?");
    expect(m.problemas).toEqual([]);
    expect(hayProblemaDeFormato("El bolso va en $89.900 y lo pagas al recibir. 🚚")).toBe(false);
  });

  test("una respuesta vacía no rompe nada", () => {
    expect(medirFormato("").problemas).toEqual([]);
    expect(medirFormato("   ").problemas).toEqual([]);
  });
});

describe("la apertura: lo primero que el cliente lee", () => {
  test("detecta los arranques que el prompt prohíbe", () => {
    for (const malo of [
      "Perfecto, te cuento.",
      "Claro que sí.",
      "¡Excelente! El bolso va en $89.900.",
      "Genial, mira.",
      "¡Buenísimo! Te paso el dato.",
    ]) {
      const m = medirFormato(malo);
      expect(
        m.problemas.some((p) => p.tipo === "apertura"),
        `debía marcar la apertura de "${malo}"`,
      ).toBe(true);
    }
  });

  test("NO marca un arranque que entra directo al dato", () => {
    expect(medirFormato("El bolso aguanta hasta 8 kg. 🐱").problemas).toEqual([]);
    expect(medirFormato("Sí, a Pasto llega en 3 a 6 días.").problemas).toEqual([]);
  });
});

describe("la longitud: esto es un chat, no un folleto", () => {
  test("marca cuando son demasiadas frases", () => {
    const largo =
      "El bolso es acolchado. Tiene correa de seguridad. Aguanta 8 kilos. " +
      "Viene en dos colores. Se puede lavar. Trae base removible.";
    const m = medirFormato(largo);
    expect(m.problemas.some((p) => p.tipo === "frases")).toBe(true);
  });

  test("marca el mensaje partido en demasiados bloques", () => {
    const bloques = Array.from({ length: 8 }, (_, i) => `Línea ${i + 1}.`).join("\n");
    const m = medirFormato(bloques);
    expect(m.problemas.some((p) => p.tipo === "lineas")).toBe(true);
  });

  test("marca la frase kilométrica que no se lee en un celular", () => {
    const larga =
      "El bolso está pensado para que puedas llevarlo cómodamente en viajes largos con tu gato " +
      "sin que se estrese ni se lastime y además tiene correa de seguridad para el auto y una base " +
      "acolchada removible que se lava fácil y seca rápido para que no quede con olor.";
    const m = medirFormato(larga);
    expect(m.problemas.some((p) => p.tipo === "parrafo_largo")).toBe(true);
  });

  test("una respuesta de 3 frases en 2 bloques pasa limpia", () => {
    const bien = "Aguanta hasta 8 kg.\n\nLo que importa es el ancho: medilo de pecho a cola.";
    expect(medirFormato(bien).problemas).toEqual([]);
  });
});

describe("los emojis: el caso que el v1 ya había medido", () => {
  test("el peor caso real: 8 emojis en 76 palabras", () => {
    const malo =
      "🎉 ¡Buenísimo! 🚀 El bolso es ideal para tu gato 🐱 viene con correa 🔒 base acolchada 🛏️ " +
      "y la verdad que está genial ✨ te va a encantar 💚 ¿lo llevamos? 😊";
    const m = medirFormato(malo);
    expect(m.problemas.some((p) => p.tipo === "emojis")).toBe(true);
    expect(m.metricas.emojis).toBeGreaterThan(4);
  });

  test("el mismo emoji repetido tres veces", () => {
    const m = medirFormato("Listo 👍 te lo mando 👍 y te aviso 👍");
    expect(m.problemas.some((p) => p.tipo === "emoji_repetido")).toBe(true);
  });

  test("dos emojis distintos y dos frases pasan", () => {
    expect(medirFormato("Aguanta 8 kg. 🐱\n\n¿Te lo llevamos? 🚚").problemas).toEqual([]);
  });
});

describe("los títulos armados a mano", () => {
  test("detecta el encabezado en negrita y en mayúsculas", () => {
    expect(medirFormato("**Precio**\n\nSon $89.900.").problemas.some((p) => p.tipo === "titulo")).toBe(true);
    expect(medirFormato("## Ficha\n\nAcolchado.").problemas.some((p) => p.tipo === "titulo")).toBe(true);
    expect(medirFormato("CARACTERÍSTICAS\n\nAcolchado.").problemas.some((p) => p.tipo === "titulo")).toBe(true);
  });

  test("una frase normal en mayúscula inicial NO es título", () => {
    expect(medirFormato("El bolso aguanta 8 kilos.").problemas).toEqual([]);
  });
});

describe("las listas tienen su propia licencia", () => {
  test("una lista de 3+ ítems con viñeta no se castiga por longitud", () => {
    const lista =
      "Tenemos tres modelos:\n\n" +
      "✅ Corrector de hombros\n" +
      "✅ Corrector con placa rígida\n" +
      "✅ Corrector espalda completa\n\n" +
      "¿Cuál te sirve más?";
    const m = medirFormato(lista);
    // Es larga en líneas, pero enumerar opciones reales es legible.
    expect(m.problemas.some((p) => p.tipo === "lineas")).toBe(false);
    expect(m.problemas.some((p) => p.tipo === "titulo")).toBe(false);
  });

  test("una lista CON emojis de más sigue marcada", () => {
    const lista =
      "🎉 Opciones 🚀\n\n✅ Uno 🐱\n✅ Dos 🔒\n✅ Tres 🛏️\n✅ Cuatro ✨\n✅ Cinco 💚";
    const m = medirFormato(lista);
    expect(m.problemas.some((p) => p.tipo === "emojis")).toBe(true);
  });
});

describe("las métricas son útiles para calibrar con datos reales", () => {
  test("cuenta frases, líneas, emojis y palabras", () => {
    const m = medirFormato("Hola. ¿Cómo estás? 🐱\n\nBien.");
    // "Hola." / "¿Cómo estás?" (mismo renglón) / "Bien." + el cierre de la
    // interrogación produce un corte extra: 4 frases en 2 bloques.
    expect(m.metricas.frases).toBe(4);
    expect(m.metricas.lineas).toBe(2);
    expect(m.metricas.emojis).toBe(1);
    expect(m.metricas.palabras).toBe(5);
  });
});

describe("el pedido de reescritura le dice al modelo QUÉ arreglar", () => {
  test("nombra los problemas y pide una sola corrección", () => {
    const m = medirFormato("Perfecto. Uno. Dos. Tres. Cuatro. Cinco. Seis.");
    const pedido = pedidoDeReescritura(m);
    expect(pedido).toMatch(/mal formateada/i);
    expect(pedido).toMatch(/reescribila UNA vez/i);
    expect(pedido).toMatch(/sin cambiar lo que dice/i);
    expect(pedido).toMatch(/Solo el formato/i);
  });
});
