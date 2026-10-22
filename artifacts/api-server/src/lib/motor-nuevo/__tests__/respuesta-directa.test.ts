import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regresión (2026-10-22): el vendedor hacía preguntas de calificación antes de
 * responder lo que el cliente preguntaba. La regla ahora es responder primero.
 */
const motor = readFileSync(join(__dirname, "..", "motor.ts"), "utf8");
const herramientas = readFileSync(join(__dirname, "..", "herramientas.ts"), "utf8");

describe("respuesta directa", () => {
  it("el prompt ya no obliga a una pregunta antes del pitch", () => {
    expect(motor).not.toMatch(/1 PREGUNTA ANTES DEL PITCH/);
  });

  it("el prompt manda responder primero y limita a una pregunta", () => {
    expect(motor).toMatch(/Responde PRIMERO lo que el cliente acaba de preguntar/);
    expect(motor).toMatch(/Nunca hagas más de 1 pregunta por mensaje/);
  });

  it("que_falta_para_cerrar solo se usa cuando el cliente quiere comprar", () => {
    expect(herramientas).toMatch(/Úsalo SOLO si el cliente ya quiere comprar/);
  });
});
