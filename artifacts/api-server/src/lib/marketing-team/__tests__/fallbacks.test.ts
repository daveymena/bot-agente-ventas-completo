import { describe, it, expect } from "vitest";
import { tryParseJson } from "../ai";
import { buildResearchFallback } from "../agents/market-researcher";
import { buildCopyFallback } from "../agents/copywriter";
import { buildOfferFallback } from "../agents/offer-strategist";

describe("MarketingAI.tryParseJson", () => {
  it("parsea JSON plano", () => {
    expect(tryParseJson('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parsea JSON envuelto en bloque de código", () => {
    const r = tryParseJson('```json\n{"a": 2}\n```');
    expect(r).toEqual({ a: 2 });
  });

  it("extrae JSON con texto alrededor", () => {
    const r = tryParseJson('Aquí está: {"a": 3} fin.');
    expect(r).toEqual({ a: 3 });
  });

  it("devuelve null para texto sin JSON", () => {
    expect(tryParseJson("no hay json")).toBeNull();
  });
});

describe("MarketResearcher fallback (MASTER PLAN §7)", () => {
  it("genera investigación estructurada a partir del producto real", () => {
    const r = buildResearchFallback({
      name: "Curso de Piano",
      description: "Aprende piano desde cero con clases prácticas.",
      price: 60000,
      currency: "COP",
      category: "courses",
    });
    expect(r.problemaPrincipal.toLowerCase()).toContain("curso de piano");
    expect(r.angulos.length).toBeGreaterThanOrEqual(3);
    expect(r.objeciones.length).toBeGreaterThan(0);
    expect(r.hipotesis.length).toBeGreaterThan(0);
  });

  it("no inventa ángulos vacíos", () => {
    const r = buildResearchFallback({ name: "X", description: "" });
    expect(r.angulos.every((a) => a.trim().length > 0)).toBe(true);
  });
});

describe("OfferStrategist fallback (MASTER PLAN §9)", () => {
  it("identifica fortalezas y debilidades sin inventar características", () => {
    const r = buildOfferFallback({
      name: "Plantilla de CV",
      description: "Plantilla profesional.",
      price: 15000,
      features: ["Editable", "ATS"],
    });
    expect(r.fortalezas.length).toBeGreaterThan(0);
    expect(r.recomendaciones.length).toBeGreaterThan(0);
  });
});

describe("Copywriter fallback (MASTER PLAN §11)", () => {
  it("produce variantes con ángulos distintos y CTA clara", () => {
    const r = buildCopyFallback({ name: "Curso de Piano", description: "Clases prácticas", price: 60000, currency: "COP" });
    expect(r.variants.length).toBeGreaterThanOrEqual(1);
    expect(r.variants[0]!.cta.length).toBeGreaterThan(0);
    expect(r.whatsappFollowUp).toContain("Curso de Piano");
  });

  it("no repite el mismo ángulo cuando recibe un brief con 3 conceptos", () => {
    const r = buildCopyFallback(
      { name: "Curso", description: "Contenido", price: 100 },
      {
        concepts: [
          { nombre: "A", angulo: "Ángulo uno", hook: "Hook uno", formato: "video", ideaVisual: "v", porQuePuedeFuncionar: "p" },
          { nombre: "B", angulo: "Ángulo dos", hook: "Hook dos", formato: "imagen", ideaVisual: "v", porQuePuedeFuncionar: "p" },
          { nombre: "C", angulo: "Ángulo tres", hook: "Hook tres", formato: "carrusel", ideaVisual: "v", porQuePuedeFuncionar: "p" },
        ],
        recomendaciones: [],
        senalesDeFatiga: [],
      },
    );
    const angulos = new Set(r.variants.map((v) => v.angle));
    expect(angulos.size).toBe(3);
  });
});
