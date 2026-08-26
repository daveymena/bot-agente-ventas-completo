import { describe, expect, it } from "vitest";
import {
  applySofiaSentState,
  detectSofiaIntent,
  planSofiaResponse,
  validateSofiaOutput,
  type SofiaConversationState,
  type SofiaProductFacts,
} from "../sofia-conversational-engine";

const piano: SofiaProductFacts = {
  id: 123,
  name: "Curso de Piano Completo",
  description: "Curso de piano de cero a avanzado.",
  price: 60000,
  currency: "COP",
  features: ["Formación desde cero hasta avanzado", "Clases en video", "Material de apoyo"],
  imageUrl: "/images/products/123.jpg",
  introVideoUrl: "https://example.com/piano-intro.mp4",
  paymentLinks: {
    card: "https://ventasproia.com/p/5OJVjO",
    paypal: "https://ventasproia.com/p/3JaJmu",
  },
  kind: "digital",
};

const baseState = (): SofiaConversationState => ({
  stage: "discovery",
  lastIntent: "greeting",
  factsAlreadyShared: [],
  assetsSent: [],
  paymentMethodsShown: [],
  priceShown: false,
  productImageSent: false,
  introVideoSent: false,
});

describe("Sofía Conversational Engine", () => {
  it("detecta preguntas cortas de precio sin convertirlas en compra", () => {
    expect(detectSofiaIntent("Precio ?")).toBe("price");
    const decision = planSofiaResponse({ text: "Precio ?", state: baseState(), product: piano });
    expect(decision.intent).toBe("price");
    expect(decision.answerScope).toBe("minimal");
    expect(decision.suggestedFollowUp).toContain("esperar");
  });

  it("detecta la pregunta de enlace como intención de pago específica", () => {
    const decision = planSofiaResponse({ text: "Cuál enlace?", state: baseState(), product: piano });
    expect(decision.intent).toBe("payment_link");
    expect(decision.stage).toBe("payment");
  });

  it("permite el video real solo si existe y aún no fue enviado", () => {
    const decision = planSofiaResponse({ text: "Tienes video?", state: baseState(), product: piano });
    expect(decision.shouldSendAsset).toBe(true);
    expect(decision.assetKind).toBe("video");
    expect(decision.assetUrl).toBe(piano.introVideoUrl);
  });

  it("no vuelve a pedir el mismo video después de enviarlo", () => {
    const state = { ...baseState(), introVideoSent: true };
    const decision = planSofiaResponse({ text: "Tienes video?", state, product: piano });
    expect(decision.shouldSendAsset).toBe(false);
  });

  it("rechaza invenciones conocidas del caso real", () => {
    const decision = planSofiaResponse({ text: "Qué incluye?", state: baseState(), product: piano });
    const result = validateSofiaOutput(
      "Incluye 24 lecciones de lectura y ritmo y un grupo privado de Discord donde compartes tus progresos.",
      decision,
      piano,
    );
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("Discord"))).toBe(true);
    expect(result.violations.some((v) => v.includes("24 lecciones"))).toBe(true);
  });

  it("rechaza voseo argentino", () => {
    const decision = planSofiaResponse({ text: "Qué incluye?", state: baseState(), product: piano });
    const result = validateSofiaOutput("Así la podés revisar con calma.", decision, piano);
    expect(result.ok).toBe(false);
  });

  it("rechaza una respuesta de precio que se transforma en ficha/venta", () => {
    const decision = planSofiaResponse({ text: "Precio?", state: baseState(), product: piano });
    const result = validateSofiaOutput(
      "💰 $60.000 COP\nTe dejo el link de pago abajo y además tienes acceso de por vida.",
      decision,
      piano,
    );
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("price_answer_scope_exceeded");
  });

  it("registra activos solo cuando realmente se envían", () => {
    const decision = planSofiaResponse({ text: "Muestra el video", state: baseState(), product: piano });
    const next = applySofiaSentState(baseState(), decision, { kind: "video", id: piano.introVideoUrl! });
    expect(next.introVideoSent).toBe(true);
    expect(next.assetsSent).toContain(piano.introVideoUrl);
  });

  it("no contamina la memoria con texto bloqueado", () => {
    const state = baseState();
    const decision = planSofiaResponse({ text: "Qué incluye?", state, product: piano });
    const blocked = validateSofiaOutput("Incluye Discord privado.", decision, piano);
    expect(blocked.ok).toBe(false);
    // El caller solo debe aplicar applySofiaSentState después de un envío real.
    expect(state.factsAlreadyShared).toEqual([]);
  });
});
