import { describe, it, expect } from "vitest";
import { detectIntent } from "../orchestrator";

describe("MarketingOrchestrator.detectIntent (MASTER PLAN §4)", () => {
  it("detecta intención de plan de crecimiento", () => {
    expect(detectIntent("Quiero vender más el curso de piano")).toBe("growth_plan");
    expect(detectIntent("hacer crecer la venta")).toBe("growth_plan");
    expect(detectIntent("necesito un plan de marketing")).toBe("growth_plan");
  });

  it("detecta intención de diagnóstico", () => {
    expect(detectIntent("¿qué está fallando?")).toBe("diagnostic");
    expect(detectIntent("por qué bajaron las ventas")).toBe("diagnostic");
    expect(detectIntent("el negocio no crece")).toBe("diagnostic");
  });

  it("detecta intención de performance", () => {
    expect(detectIntent("¿cómo vamos?")).toBe("performance");
    expect(detectIntent("¿qué está funcionando?")).toBe("performance");
  });

  it("detecta intención de crear campaña", () => {
    expect(detectIntent("crea una campaña")).toBe("create_campaign");
    expect(detectIntent("prepara nuevos anuncios")).toBe("create_campaign");
  });

  it("un saludo cae en 'help', NO en unknown", () => {
    // Decisión deliberada del código (orchestrator.ts:45): "hola" y "buenas"
    // están en la lista de `help` porque antes un saludo devolvía el 400 "no
    // identifiqué intención". El test esperaba `unknown`, que era el
    // comportamiento viejo. Lo que se fija acá es que el admin reciba la ayuda
    // en vez de un error.
    expect(detectIntent("hola buenas tardes")).toBe("help");
    expect(detectIntent("hola")).toBe("help");
    expect(detectIntent("ayuda")).toBe("help");
  });

  it("devuelve unknown para mensajes sin intención de marketing", () => {
    expect(detectIntent("")).toBe("unknown");
    expect(detectIntent("el clima de mañana")).toBe("unknown");
    expect(detectIntent("asdf qwerty")).toBe("unknown");
  });
});
