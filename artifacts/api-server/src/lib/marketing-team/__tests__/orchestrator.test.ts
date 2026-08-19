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

  it("devuelve unknown para mensajes sin intención de marketing", () => {
    expect(detectIntent("hola buenas tardes")).toBe("unknown");
    expect(detectIntent("")).toBe("unknown");
  });
});
