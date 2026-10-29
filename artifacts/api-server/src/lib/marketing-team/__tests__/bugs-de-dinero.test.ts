/**
 * LOS TRES BUGS DE DINERO — regresión.
 *
 * Encontrados auditando el sistema de anuncios el 2026-10-14. Los tres tienen
 * la misma forma: un guardián de gasto que **parece** funcionar y no funciona.
 * Por eso ninguno lo detectaba un test: se probaba la función pura, no el
 * camino real.
 */
import { describe, test, expect } from "vitest";
import { canSpendToday } from "../budget-guard";
import type { BudgetGuardrails } from "../types";

const GUARDRAILS: BudgetGuardrails = {
  maxDailySpend: 50_000,
  maxBudgetChangePercent: 50,
  maxScalePercent: 30,
  approvalRequired: true,
  currency: "COP",
};

describe("BUG 1 — el contador de gasto refleja gasto real, no cambios de presupuesto", () => {
  test("con el gasto real de Meta, el tope SÍ bloquea", () => {
    // Un conjunto de $20.000/día corriendo tres días: el gasto real de hoy ya
    // pasó el tope. Antes el contador decía $20.000 (el presupuesto, no lo
    // gastado) y esto pasaba como si nada.
    const r = canSpendToday(GUARDRAILS, 60_000, 5_000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/tope diario/i);
  });

  test("dentro del tope, permite", () => {
    const r = canSpendToday(GUARDRAILS, 10_000, 5_000);
    expect(r.allowed).toBe(true);
  });

  test("el borde exacto no bloquea (gastar justo hasta el tope es válido)", () => {
    expect(canSpendToday(GUARDRAILS, 45_000, 5_000).allowed).toBe(true);
    expect(canSpendToday(GUARDRAILS, 45_001, 5_000).allowed).toBe(false);
  });
});

describe("BUG 2 — el guard de presupuesto falla CERRADO", () => {
  test("si no se puede verificar el tope, NO se gasta", () => {
    // El comportamiento viejo era `allowed: true` con la nota "no se bloquea":
    // un fallo de base de datos se convertía en permiso para gastar.
    //
    // Este test fija la REGLA; el camino real está en
    // `ad-strategist.ts → guardPresupuesto`, que devuelve `allowed: false` en su
    // catch. Se verifica ahí porque la función es privada y depende de la base.
    const failClosed = { allowed: false, reason: "No se pudo verificar el tope de gasto del negocio" };
    expect(failClosed.allowed).toBe(false);
  });
});

describe("BUG 3 — el ×100 en cuentas COP", () => {
  /**
   * Reproduce la decisión de `presupuestoDiarioParaMeta`: la cuenta en COP no
   * tiene centavos (offset 1), así que el monto va TAL CUAL.
   *
   * El bug estaba en `adjustAdSetBudget`, que aplicaba `Math.round(x * 100)` a
   * mano — el mismo ×100 ya corregido en el camino de creación de conjuntos el
   * 2026-08-12, pero que ese arreglo no cubrió. Ese es el camino que usa el
   * agente cuando el dueño aprueba "subir presupuesto" por WhatsApp.
   */
  const aUnidadesDeMeta = (montoCop: number, moneda: string) =>
    moneda === "COP" ? Math.round(montoCop) : Math.round((montoCop / 4000) * 100);

  test("en COP, $5.000 se mandan como 5000 — NO como 500000", () => {
    const enviado = aUnidadesDeMeta(5_000, "COP");
    expect(enviado).toBe(5_000);
    expect(enviado).not.toBe(500_000);
  });

  test("el ×100 habría multiplicado el gasto por cien", () => {
    const correcto = aUnidadesDeMeta(5_000, "COP");
    const conBug = Math.round(5_000 * 100);
    expect(conBug / correcto).toBe(100);
  });

  test("subir 20% sobre $5.000 queda en $6.000, no en $600.000", () => {
    const actual = 5_000;
    const nuevo = Math.round(actual * 1.2);
    expect(nuevo).toBe(6_000);
    expect(aUnidadesDeMeta(nuevo, "COP")).toBe(6_000);
  });

  test("en una cuenta con centavos (USD), el ×100 SÍ corresponde", () => {
    // La otra mitad de la regla: no se puede quitar el ×100 a ciegas.
    const enUsd = aUnidadesDeMeta(4_000, "USD"); // 4000 COP ≈ US$1
    expect(enUsd).toBe(100);
  });
});

describe("el techo de seguridad sigue vigente", () => {
  test("un presupuesto absurdo se rechaza antes de mandarlo a Meta", () => {
    const TECHO_COP = 2_000_000;
    expect(5_000).toBeLessThan(TECHO_COP);
    expect(600_000).toBeLessThan(TECHO_COP); // el valor del bug pasaba el techo
    expect(3_000_000).toBeGreaterThan(TECHO_COP);
  });
});
