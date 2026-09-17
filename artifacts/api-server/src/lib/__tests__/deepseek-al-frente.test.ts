/**
 * DeepSeek es el tronco, siempre.
 *
 * Orden del admin del 2026-09-03. Existía un camino donde NO lo era: si había
 * un proveedor elegido en la pantalla de Configuración, `agent.ts` armaba la
 * cola con ese solo y DeepSeek recién entraba en la fase 2 -- después de que
 * el elegido fallara y se comiera su tiempo, con un cliente escribiendo.
 */
import { describe, it, expect } from "vitest";
import { deepseekVaPrimero } from "../deepseek-al-frente";

const base = { hayClave: true, sano: true, enCooldown: false, proveedorElegido: "none" };

describe("DeepSeek al frente de la cola", () => {
  it("va primero cuando no hay nada elegido", () => {
    expect(deepseekVaPrimero(base)).toBe(true);
  });

  /**
   * LA REGRESIÓN. Con un proveedor elegido en el panel, la cola era
   * exclusivamente ese. Ahora DeepSeek encabeza igual y lo elegido queda
   * detrás -- que se sigue intentando, no se borra.
   */
  it("va primero AUNQUE el admin haya elegido otro proveedor", () => {
    expect(deepseekVaPrimero({ ...base, proveedorElegido: "github" })).toBe(true);
    expect(deepseekVaPrimero({ ...base, proveedorElegido: "nvidia" })).toBe(true);
    expect(deepseekVaPrimero({ ...base, proveedorElegido: "opencode" })).toBe(true);
  });

  /**
   * Si el admin YA eligió DeepSeek, no se agrega otra vez: intentar el mismo
   * modelo dos veces seguidas es tiempo del cliente tirado.
   */
  it("no se duplica si el elegido ya es DeepSeek", () => {
    expect(deepseekVaPrimero({ ...base, proveedorElegido: "deepseek" })).toBe(false);
  });

  /** Sin clave no hay nada que encolar: encabezar con una puerta que no abre
   *  es empezar cada turno perdiendo un intento. */
  it("sin clave no encabeza nada", () => {
    expect(deepseekVaPrimero({ ...base, hayClave: false })).toBe(false);
  });

  /** Un proveedor apartado por el monitor de salud no encabeza: si se acaba de
   *  quitar sin saldo, ponerlo primero es gastar el turno en el mismo 402. */
  it("apartado por salud, no encabeza", () => {
    expect(deepseekVaPrimero({ ...base, sano: false })).toBe(false);
  });

  /** DeepSeek en cooldown del rotador (sin_credito = 6h) no encabeza:
   *  cada modelo cuesta 12s, y el turno entero se pierde. */
  it("en cooldown del rotador, no encabeza", () => {
    expect(deepseekVaPrimero({ ...base, enCooldown: true })).toBe(false);
  });

  it("sin clave manda sobre todo lo demás", () => {
    expect(deepseekVaPrimero({ hayClave: false, sano: true, proveedorElegido: "github" })).toBe(false);
  });
});
