import { describe, it, expect } from "vitest";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";

/**
 * Pedir una herramienta POR SU NOMBRE era la forma más segura de no recibirla.
 *
 * Los grupos de `opencode-mcp-tools.ts` matchean palabras en español
 * (facebook, anuncio, campaña) para decidir qué herramientas viajan en el
 * turno. Los nombres de las herramientas no están en ningún patrón, así que
 * nombrarlas no activaba nada.
 *
 * Visto en producción el 2026-08-29:
 *
 *   pedido:  "Ejecuta fb_status y pegame textual el summary"
 *   Atlas:   "no tengo acceso a esas herramientas en este turno"
 *
 * Y "revisá la conexión con facebook" --lo mismo, dicho peor-- sí funcionó.
 */
const nombres = (pedido: string) => new Set(buildMcpToolRegistry(pedido).map((t) => t.name));

describe("Nombrar una herramienta alcanza para recibirla", () => {
  it("el caso real: pedir fb_status por su nombre", () => {
    expect(nombres("Ejecuta fb_status y pegame textual el summary")).toContain("fb_status");
  });

  it("vale para cualquiera, no solo para las de Facebook", () => {
    expect(nombres("corré dashboard_summary y decime qué dio")).toContain("dashboard_summary");
    expect(nombres("necesito list_recent_conversations")).toContain("list_recent_conversations");
  });

  it("los grupos por palabra siguen funcionando igual", () => {
    // El arreglo agrega, no reemplaza: quien pide "revisá facebook" tiene que
    // seguir recibiendo el grupo entero, no solo lo que nombró.
    const t = nombres("revisá la conexión con facebook y la cuenta de anuncios");
    expect(t).toContain("fb_status");
    expect(t).toContain("fb_pixel_status");
  });

  it("no manda todas por nombrar una", () => {
    // El recorte existe porque el prompt no entra en el tope por minuto de
    // Groq. Nombrar una herramienta no puede volver a abrir la puerta entera.
    const t = nombres("corré dashboard_summary");
    expect(t.has("fb_campaign_metrics")).toBe(false);
    expect(t.size).toBeLessThan(20);
  });
});
