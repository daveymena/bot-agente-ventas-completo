import { describe, it, expect } from "vitest";
import { describePlannedAction } from "../opencode-mcp-tools";

// 09-10-2026: "hazme un A/B del corrector" salía como dos crear_anuncio
// iguales, sin objetivo ni formato y "sin tocar Meta". Ahora es ab:true y el
// plan que aprueba el dueño dice exactamente qué se va a crear.
describe("A/B de anuncios en una llamada", () => {
  it("el plan dice: dos campañas, en Meta, en pausa, web y WhatsApp, carrusel", () => {
    const t = describePlannedAction({ tool: "crear_anuncio", args: { producto: "Corrector de Postura Zxf 25 Eh", dailyBudget: 20000, ab: true } });
    expect(t).toMatch(/DOS campañas en Meta EN PAUSA/);
    expect(t).toMatch(/ventas → la web/);
    expect(t).toMatch(/mensajes → WhatsApp/);
    expect(t).toMatch(/Carrusel/);
    expect(t).toContain("$20.000/día cada una");
    expect(t).toContain("$40.000/día al activar las dos");
  });

  it("sin público pedido lo dice (Advantage+), no lo esconde", () => {
    const t = describePlannedAction({ tool: "crear_anuncio", args: { producto: "X", dailyBudget: 10000, ab: true } });
    expect(t).toMatch(/Advantage\+/);
  });

  it("con público pedido lo muestra", () => {
    const t = describePlannedAction({ tool: "crear_anuncio", args: { producto: "X", dailyBudget: 10000, ab: true, edadMin: 25, edadMax: 55, ciudades: ["Cali"] } });
    expect(t).toContain("25–55 años");
    expect(t).toContain("en Cali");
  });

  it("un crear_anuncio normal sigue describiéndose como antes", () => {
    const t = describePlannedAction({ tool: "crear_anuncio", args: { producto: "X", dailyBudget: 10000 } });
    expect(t).not.toMatch(/DOS campañas/);
    expect(t).toMatch(/no toca Meta/);
  });
});
