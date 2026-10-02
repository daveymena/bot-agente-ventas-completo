/**
 * PRUEBA REAL, reproducible: la "copia truncada" de la Pañalera (2026-10-02).
 *
 * El caso real que reportó el dueño: un producto de Dropi con description en
 * PÁRRAFOS corridos (sin bullets ni emojis), y el anuncio que salía con el
 * bloque de beneficios vacío. `puntosReales()` solo leía líneas que empiezan
 * con bullet — o sea, cero beneficios — y el anuncio quedaba:
 *
 *   gancho → (bloque vacío) → precio/envío/pago → CTA
 *
 * Esta suite lo fija con texto REAL de producto Dropi (cortesía de la ficha
 * que se puede leer en la landing del producto).
 */
import { describe, it, expect } from "vitest";
import { planDeAnuncio, puntosReales } from "../anuncio-por-modelo";

/** Descripción tipo Dropi: párrafos corridos, sin bullets. La primera línea es la que ya va como gancho. */
const PAÑALERA = `Pañalera Mochila Multifuncional 2 En 1
Todo lo que tu bebé necesita, organizado en un solo lugar.
Diseñada para llevar todo lo del bebé: pañales, toallitas hámedas, biberones y ropa de muda.
Espacios separados para encontrar cada cosa rápido sin vaciar la mochila.
Se puede usar como mochila de maternidad y como bolso para pasear.`;

const producto = {
  name: "Pañalera Mochila Multifuncional 2 En 1",
  description: PAÑALERA,
  price: 110990,
  currency: "COP",
  kind: "physical",
  // Sin features: el caso real importado de Dropi que fallaba.
  features: null,
};

describe("planDeAnuncio: físico importado de Dropi (párrafos, sin bullets)", () => {
  it("saca los beneficios de las frases corridas, no de bullets", () => {
    const plan = planDeAnuncio(producto as any, { envio: { costo: "incluido", pago: "contraentrega", plazo: "3 a 5 días hábiles" } } as any);
    const t = plan.primaryText;

    // Los beneficios del producto, de la ficha: nada inventado.
    expect(t).toMatch(/pañales, toallitas/i);
    expect(t).toMatch(/Espacios separados| encontrar cada cosa/i);

    // NO queda un encabezado interno del modelo sin contenido detrás.
    expect(t).not.toMatch(/BENEFICIOS PRINCIPALES/);

    // La oferta y el CTA siguen: gancho → beneficios → oferta → acción.
    expect(t).toMatch(/110\.990/);
    expect(t).toMatch(/WhatsApp/);
  });

  it("no deja líneas vacías seguidas por el bloque que se cayó", () => {
    const plan = planDeAnuncio(producto as any, null, {});
    // Doble salto de línea en medio del cuerpo: un bloque vacío que se lee como
    // texto cortado.
    expect(plan.primaryText).not.toMatch(/\n\n\n/);
  });

  it("sin NADA usable (ficha de una línea), sale gancho + oferta + CTA: sin bloque vacío", () => {
    const pobre = { name: "Pañalera Mochila 2 En 1", description: "Una mochila para el bebé.", price: 110990, currency: "COP", kind: "physical" };
    const plan = planDeAnuncio(pobre as any, { envio: { costo: "incluido", pago: "contraentrega", plazo: "3 a 5 días" } } as any);
    expect(plan.primaryText).not.toMatch(/BENEFICIOS PRINCIPALES/);
    expect(plan.primaryText).not.toMatch(/\n\n\n/);
    expect(plan.primaryText).toMatch(/110\.990/);
  });

  it("ganch del producto: la primera frase del dueño, no un rótulo", () => {
    const plan = planDeAnuncio(producto as any, null, {});
    // "Todo lo que tu bebé necesita..." es la primera frase REAL que escribió
    // el proveedor: eso es el gancho, no "Pañalera Mochila Multifuncional".
    const primera = plan.primaryText.split("\n")[0]!;
    expect(primera).toMatch(/bebé necesita/);
  });
});

describe("planDeAnuncio: los otros modelos también deben quedar coherentes", () => {
  it("digital sin bullets: los módulos salen de las frases corridas", () => {
    const curso = {
      name: "Curso de Excel",
      description:
        "Curso de Excel desde cero\n" +
        "Fórmulas, tablas dinámicas y gráficos que se usan en el trabajo.\n" +
        "Ejercicios prácticos con archivos para descargar.\n" +
        "Certificado al terminar el curso.",
      price: 60000,
      currency: "COP",
      kind: "digital",
    };
    const plan = planDeAnuncio(curso as any, null, {});
    expect(plan.primaryText).toMatch(/Fórmulas, tablas dinámicas/i);
    expect(plan.primaryText).not.toMatch(/BENEFICIOS PRINCIPALES/);
  });

  it("servicio: los casos quedan con su CTA de agenda, sin bloque vacío", () => {
    const s = {
      name: "Reparación de computadores",
      description:
        "Diagnóstico de fallas en portátiles y de escritorio.\n" +
        "Reparación a domicilio con cita previa.\n" +
        "Garantía real de 30 días por escrito.",
      price: 40000,
      currency: "COP",
      kind: "service",
    };
    const plan = planDeAnuncio(s as any, null, {});
    expect(plan.primaryText).toMatch(/a domicilio|Diagn[óo]stico/i);
    expect(plan.primaryText).not.toMatch(/BENEFICIOS PRINCIPALES/);
  });
});