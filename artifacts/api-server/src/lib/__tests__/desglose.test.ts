import { describe, expect, it } from "vitest";
import { bloqueDeDesglose, frasesDeFormatoInventado, garantiaInventada, limpiarLineasVacias, puntoQueQuiereEntender, sinElFormatoInventado, sinLaGarantiaInventada } from "../desglose";

/**
 * Medido el 19-09-2026 con el pipeline entero sobre el curso de mecánica de
 * bicicletas (ficha de 343 caracteres + 6 viñetas), después de enviada la
 * ficha:
 *
 *   "explícame mejor cómo funciona eso en la práctica, paso a paso"
 *     → "📂 Accedes al portal con tu usuario… 🎥 videos cortos… 📄 guía PDF…"
 *   "y de lo que dice de la garantía, cuéntame más"
 *     → "✅ Garantía de 7 días, te devolvemos el 100 %…"
 *
 * Nada de eso existe. Estas pruebas fijan las dos piezas: el bloque que le
 * dice al modelo qué puede explicar y qué no, y el guardián que saca la
 * garantía que nadie definió.
 */

const curso = {
  id: 1,
  name: "CURSO MECÁNICA DE BICICLETAS DESDE CERO",
  kind: "digital",
  description: "Aprendé a dejarla como nueva con tus propias manos, paso a paso y sin experiencia previa. Diagnóstico de fallas, frenos, cambios, ruedas, cadena, pinchazos y puesta a punto completa.",
  features: ["🔎 Diagnóstico de fallas, sin adivinar", "🛠️ Frenos: ajuste y cambio", "⚙️ Cambios y desviadores bien afinados"],
};

const entendido = (extra: Partial<Parameters<typeof puntoQueQuiereEntender>[0]["entendimiento"] & object> = {}) => ({
  sobreElFoco: true, productoId: 1, pide: [] as any[], subintencion: null as any, preguntas: [] as string[], pideAlgoQueNoHay: false, ...extra,
});

describe("cuándo es un desglose", () => {
  it("'explícame mejor cómo funciona en la práctica' con la ficha enviada", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "ok ya vi todo. pero explícame mejor cómo funciona eso en la práctica, paso a paso",
      entendimiento: entendido({ subintencion: "content_question" }),
      productoConFichaEnviada: curso, negocio: null,
    })).toBe("contenido");
  });

  it("'cuéntame más de la garantía' → garantia, aunque el modelo no clasificara la subintención", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "y de lo que dice de la garantía, cuéntame más, cómo es exactamente",
      entendimiento: entendido({ pide: ["garantia"] }),
      productoConFichaEnviada: curso, negocio: null,
    })).toBe("garantia");
  });

  it("sin ficha enviada no es desglose (ahí va la presentación normal)", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "explícame cómo funciona",
      entendimiento: entendido({ subintencion: "content_question" }),
      productoConFichaEnviada: null, negocio: null,
    })).toBeNull();
  });

  it("'cuánto vale' no es desglose", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "y cuánto vale?",
      entendimiento: entendido({ subintencion: "price_question", pide: ["precio"] }),
      productoConFichaEnviada: curso, negocio: null,
    })).toBeNull();
  });

  it("si pregunta por otro producto que no hay, no es desglose del foco", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "explícame el de soldadura",
      entendimiento: entendido({ pideAlgoQueNoHay: true, subintencion: "content_question" }),
      productoConFichaEnviada: curso, negocio: null,
    })).toBeNull();
  });
});

describe("qué le dice el bloque al modelo", () => {
  it("contenido: explicar los puntos de la ficha, y NO afirmar formato/PDF/garantía", () => {
    const b = bloqueDeDesglose({
      mensaje: "explícame mejor cómo funciona en la práctica",
      entendimiento: entendido({ subintencion: "content_question" }),
      productoConFichaEnviada: curso, negocio: null,
    });
    expect(b).toContain("Frenos: ajuste y cambio");
    expect(b).toMatch(/PDFs/);
    expect(b).toMatch(/no lo afirmes/i);
    expect(b).toMatch(/3 a 6 líneas/);
  });

  it("garantía sin definir: se lo dice, y prohíbe inventar días o porcentajes", () => {
    const b = bloqueDeDesglose({
      mensaje: "cuéntame más de la garantía",
      entendimiento: entendido({ pide: ["garantia"] }),
      productoConFichaEnviada: curso, negocio: { garantia: null },
    });
    expect(b).toMatch(/NADIE lo cargó/);
    expect(b).toMatch(/NO inventes días, porcentajes/);
  });

  it("garantía definida: el dato real, y solo ese", () => {
    const b = bloqueDeDesglose({
      mensaje: "cuéntame más de la garantía",
      entendimiento: entendido({ pide: ["garantia"] }),
      productoConFichaEnviada: curso, negocio: { garantia: { descripcion: "Devolución dentro de los 3 días si el material no abre" } },
    });
    expect(b).toContain("Devolución dentro de los 3 días si el material no abre");
    expect(b).toMatch(/solo este/);
  });

  it("entrega definida por el negocio: se explica ese dato", () => {
    const b = bloqueDeDesglose({
      mensaje: "no entendí lo de la entrega, explícamelo",
      entendimiento: entendido({ subintencion: "delivery_question" }),
      productoConFichaEnviada: curso, negocio: { entrega: { metodo: "enlace por WhatsApp", plazo: "inmediato" } },
    });
    expect(b).toContain("enlace por WhatsApp — inmediato");
  });
});

describe("guardián de garantías inventadas", () => {
  const texto = "✅ Garantía de 7 días, te devolvemos el 100 % si no te convence.\n📩 Avísanos dentro del plazo y gestionamos el reembolso sin complicaciones.\n¿Te queda alguna duda?";

  it("la garantía medida el 19-09 se detecta cuando nadie la definió", () => {
    expect(garantiaInventada(texto, curso, null)).toBe(true);
    expect(garantiaInventada(texto, curso, { garantia: null })).toBe(true);
  });

  it("si el negocio o el producto la definen, no se toca", () => {
    expect(garantiaInventada(texto, curso, { garantia: { descripcion: "7 días" } })).toBe(false);
    expect(garantiaInventada(texto, { ...curso, description: curso.description + " Garantía de satisfacción." }, null)).toBe(false);
  });

  it("se quitan las frases de la garantía y queda el resto", () => {
    const limpio = sinLaGarantiaInventada(texto);
    expect(limpio).not.toMatch(/7 días|100 %|reembolso sin complicaciones/);
    expect(limpio).toContain("¿Te queda alguna duda?");
  });

  it("una mención sin condiciones concretas no dispara el guardián", () => {
    expect(garantiaInventada("Sobre la garantía te confirmo con el equipo 🙌", curso, null)).toBe(false);
  });
});

describe("sin entendimiento (el lector falló), deciden los patrones", () => {
  it("'explícame mejor cómo funciona' con ficha enviada sigue siendo desglose", () => {
    expect(puntoQueQuiereEntender({
      mensaje: "ok ya vi todo. pero explícame mejor cómo funciona eso en la práctica, paso a paso",
      entendimiento: null,
      productoConFichaEnviada: curso, negocio: null,
    })).toBe("general");
  });
  it("un mensaje que no pide explicar, sin entendimiento, no dispara nada", () => {
    expect(puntoQueQuiereEntender({ mensaje: "dale, lo quiero", entendimiento: null, productoConFichaEnviada: curso, negocio: null })).toBeNull();
  });
});

describe("guardián de formato inventado", () => {
  const medido = "📚 Así funciona en la práctica\n\n🔹 Accedes al portal con tu usuario y ves la lista de módulos.\n🔹 Cada módulo tiene videos cortos; reproduces y sigues el tutorial paso a paso.\n🔹 Practicas con tu bici mientras ves; pausa, repite y aplicas lo aprendido.\n🔧 Diagnosticarás fallas y ajustarás frenos y cambios.";

  it("portal/usuario/módulos/videos se detectan cuando la ficha no los menciona", () => {
    const malas = frasesDeFormatoInventado(medido, curso, null);
    expect(malas.some((f) => /portal/.test(f))).toBe(true);
    expect(malas.some((f) => /videos cortos/.test(f))).toBe(true);
    expect(malas.some((f) => /Diagnosticarás/.test(f))).toBe(false);
  });

  it("se quitan esas frases y queda la explicación respaldada, sin líneas de solo emoji", () => {
    const limpio = sinElFormatoInventado(medido, curso, null);
    expect(limpio).not.toMatch(/portal|videos cortos|módulo/);
    expect(limpio).toContain("Diagnosticarás fallas");
    expect(limpio).toContain("Practicas con tu bici");
    expect(limpio.split("\n").some((l) => /^[\s🔹💰🔄✅]+$/u.test(l) && l.trim())).toBe(false);
  });

  it("si la ficha SÍ habla de videos y módulos, no se toca", () => {
    const conVideos = { ...curso, description: curso.description + " Incluye 12 módulos en video." };
    expect(frasesDeFormatoInventado(medido, conVideos, null).some((f) => /videos cortos/.test(f))).toBe(false);
  });

  it("si el negocio define la entrega por plataforma, se respeta", () => {
    expect(frasesDeFormatoInventado("Accedes al portal con tu usuario.", curso, { entrega: { metodo: "portal con usuario y contraseña", plazo: "inmediato" } })).toEqual([]);
  });

  it("limpiarLineasVacias saca las líneas que quedaron solo con un emoji", () => {
    expect(limpiarLineasVacias("Entiendo. ✅\n\n💰\n\n🔄\n\nTe confirmo 🙌")).toBe("Entiendo. ✅\n\nTe confirmo 🙌");
  });
});

describe("garantía: también cae la que promete sin números", () => {
  it("'el proceso de reembolso es sencillo' sin garantía definida se quita", () => {
    const t = "🔄 El proceso de reembolso es sencillo y lo gestionamos rápidamente.\n\nSobre la garantía puntual te confirmo con el equipo y te escribo 🙌";
    expect(garantiaInventada(t, curso, null)).toBe(true);
    const limpio = sinLaGarantiaInventada(t);
    expect(limpio).not.toMatch(/reembolso/);
    expect(limpio).toContain("te confirmo con el equipo");
  });
  it("decir que NO hay devoluciones no es inventar una", () => {
    expect(garantiaInventada("No manejamos devoluciones en productos digitales.", curso, null)).toBe(false);
  });
});
