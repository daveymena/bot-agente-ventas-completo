/**
 * Meta #1815159 "El contenido y el objetivo no coinciden" (25-09-2026): la
 * campaña de tráfico a la landing copiaba la optimización CONVERSATIONS de la
 * plantilla (campaña de mensajes a WhatsApp).
 */
import { describe, test, expect } from "vitest";
import { optimizacionCompatible } from "../facebook";

describe("optimización de la plantilla vs objetivo de la campaña", () => {
  test("tráfico a la landing no acepta CONVERSATIONS (WhatsApp)", () => {
    expect(optimizacionCompatible("OUTCOME_TRAFFIC", "CONVERSATIONS")).toBe(false);
    expect(optimizacionCompatible("OUTCOME_TRAFFIC", "LANDING_PAGE_VIEWS")).toBe(true);
  });
  test("mensajes sí acepta CONVERSATIONS", () => {
    expect(optimizacionCompatible("OUTCOME_ENGAGEMENT", "CONVERSATIONS")).toBe(true);
  });
  test("objetivo desconocido: no se copia nada de la plantilla", () => {
    expect(optimizacionCompatible("OUTCOME_APP_PROMOTION", "LINK_CLICKS")).toBe(false);
  });
});
