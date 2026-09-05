/**
 * Un "hola" no necesita el catálogo entero.
 *
 * ⚠️ Medido el 2026-09-05: un saludo viajaba con 14 herramientas y ~2.688
 * tokens de esquemas --el catálogo, el estado de Facebook, el de WhatsApp, el
 * buscador web-- para poder contestar "¡hola! ¿en qué te ayudo?".
 *
 * Pasaba porque cuando ningún grupo matchea se asume "no sé qué quiere, le
 * mando de todo por si acaso". Para una pregunta rara eso está bien; para un
 * saludo es puro peso, y el peso es tiempo: el modelo lee todo eso antes de
 * poder responder.
 *
 * Los criterios son ESTRECHOS a propósito. Quedarse sin una herramienta que
 * hacía falta cuesta mucho más que unos tokens de más, así que ante la menor
 * duda se manda todo, como siempre.
 */
import { describe, it, expect } from "vitest";
import { esCharlaPura, buildMcpToolRegistry } from "../opencode-mcp-tools";

describe("qué cuenta como charla pura", () => {
  it.each([
    "hola", "Hola!", "buenas", "buenos días", "gracias", "mil gracias",
    "dale", "ok", "listo", "perfecto", "jajaja", "chau",
  ])("sí: %s", (t) => {
    expect(esCharlaPura(t)).toBe(true);
  });

  /**
   * Todo lo que traiga una pregunta o un pedido recibe las herramientas
   * completas. "Hola" entra; "hola, ¿cuántos productos tengo?" no.
   */
  it.each([
    "hola, cuantos productos tengo?",
    "buenas, necesito un anuncio",
    "dale, crea el anuncio",
    "gracias, ahora mostrame las ventas",
    "como va mi campaña",
    "por que no responde el bot",
  ])("no: %s", (t) => {
    expect(esCharlaPura(t)).toBe(false);
  });

  it("un signo de pregunta lo descarta siempre", () => {
    expect(esCharlaPura("hola?")).toBe(false);
    expect(esCharlaPura("¿buenas?")).toBe(false);
  });

  /** Un mensaje largo no es un saludo aunque empiece con uno. */
  it("algo largo no es charla aunque arranque saludando", () => {
    expect(esCharlaPura("hola necesito que me armes una campaña completa")).toBe(false);
  });

  it("no se rompe con vacío ni con basura", () => {
    expect(esCharlaPura("")).toBe(false);
    expect(esCharlaPura(undefined)).toBe(false);
    expect(esCharlaPura("!@#$%")).toBe(false);
  });
});

describe("y eso se traduce en menos peso", () => {
  const cuantas = (p: string) => (buildMcpToolRegistry(p) as any[]).length;

  it("un saludo viaja con lo mínimo", () => {
    expect(cuantas("hola")).toBeLessThanOrEqual(3);
  });

  /** LA COMPROBACIÓN QUE IMPORTA: el ahorro no puede costar capacidad. */
  it("pero un pedido de verdad sigue trayendo todo", () => {
    expect(cuantas("crea un anuncio del curso de piano")).toBeGreaterThan(10);
    expect(cuantas("cuantos productos tengo")).toBeGreaterThan(10);
  });

  it("y propose_action nunca falta, ni siquiera saludando", () => {
    const nombres = (buildMcpToolRegistry("hola") as any[]).map((t) => t.name);
    expect(nombres).toContain("propose_action");
  });
});
