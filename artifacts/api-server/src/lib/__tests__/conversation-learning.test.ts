import { describe, it, expect } from "vitest";
import {
  analyzeExchange,
  jaccardSimilarity,
  buildRecommendation,
  formatLessonsForPrompt,
  type LessonRef,
} from "../conversation-learning";

describe("ConversationLearning — análisis de intercambios", () => {
  it("detecta repetición de pregunta como confusión", () => {
    const r = analyzeExchange(
      "¿cuánto cuesta el curso de piano?",
      "¿cuánto cuesta el curso de piano?",
      "El curso cuesta $60.000...",
    );
    expect(r.outcome).toBe("customer_confused");
  });

  it("detecta confusión explícita", () => {
    const r = analyzeExchange(
      "no entendí, ¿qué significa acceso de por vida?",
      "¿qué incluye el curso?",
      "Incluye acceso de por vida...",
    );
    expect(r.outcome).toBe("customer_confused");
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it("detecta frustración", () => {
    const r = analyzeExchange(
      "no me sirve, no respondes lo que pregunto, eres un robot",
      "¿tienen garantía?",
      "Sí, tenemos garantía...",
    );
    expect(r.outcome).toBe("customer_frustrated");
  });

  it("detecta avance hacia la compra", () => {
    const r = analyzeExchange(
      "listo, ¿cómo pago? quiero el link",
      "muéstrame el curso",
      "Te muestro el curso...",
    );
    expect(r.outcome).toBe("sale_progress");
  });

  it("detecta abandono sin comprar", () => {
    const r = analyzeExchange(
      "no me interesa, gracias igual, chao",
      "¿cuánto cuesta?",
      "Cuesta $60.000...",
    );
    expect(r.outcome).toBe("customer_left");
  });

  it("clasifica respuesta positiva", () => {
    const r = analyzeExchange(
      "perfecto, gracias!",
      "¿cuánto cuesta?",
      "Cuesta $60.000...",
    );
    expect(r.outcome).toBe("positive");
  });

  it("no inventa señales cuando no hay datos", () => {
    const r = analyzeExchange("veo y te confirmo en un rato", "¿cuánto cuesta?", "Cuesta $60.000...");
    expect(r.outcome).toBe("no_signal");
  });
});

describe("ConversationLearning — similitud de Jaccard", () => {
  it("da 1 para textos idénticos normalizados", () => {
    expect(jaccardSimilarity("Hola, ¿precio?", "hola precio")).toBe(1);
  });

  it("da 0 para textos sin palabras en común", () => {
    expect(jaccardSimilarity("curso de piano", "métodos de pago nequi")).toBe(0);
  });
});

describe("ConversationLearning — recomendaciones", () => {
  it("genera recomendación para confusión con producto", () => {
    const rec = buildRecommendation({
      outcome: "customer_confused",
      signals: [],
      customerMsg: "no entendí",
      agentReply: "...",
      productName: "Curso de Piano",
    });
    expect(rec).toContain("Curso de Piano");
    expect(rec.length).toBeGreaterThan(20);
  });

  it("genera recomendación para frustración", () => {
    const rec = buildRecommendation({
      outcome: "customer_frustrated",
      signals: [],
      customerMsg: "no me sirve",
      agentReply: "...",
    });
    expect(rec.toLowerCase()).toContain("disculpa");
  });

  it("devuelve vacío para no_signal", () => {
    const rec = buildRecommendation({
      outcome: "no_signal",
      signals: [],
      customerMsg: "ok",
      agentReply: "...",
    });
    expect(rec).toBe("");
  });
});

describe("ConversationLearning — formato para prompt", () => {
  it("devuelve string vacío sin lecciones", () => {
    expect(formatLessonsForPrompt([])).toBe("");
  });

  it("formatea lecciones con tipo legible", () => {
    const lessons: LessonRef[] = [
      { title: "Lección", content: "Fallo: x\nEl agente respondió: y\nRecomendación: Simplificar la respuesta", tags: ["lesson"], outcome: "customer_confused", productName: "piano" },
    ];
    const out = formatLessonsForPrompt(lessons);
    expect(out).toContain("confusión");
    expect(out).toContain("Simplificar");
  });

  it("recorta lecciones que exceden el límite", () => {
    const lessons: LessonRef[] = [
      { title: "Lección", content: "Recomendación: " + "x".repeat(3000), tags: ["lesson"], outcome: "customer_frustrated", productName: "piano" },
    ];
    const out = formatLessonsForPrompt(lessons, 500);
    expect(out.length).toBeLessThanOrEqual(501);
  });
});
