import { describe, it, expect } from "vitest";
import { todayKey, canSpendToday, canChangeBudget, canScale } from "../budget-guard";
import type { BudgetGuardrails } from "../types";

const GUARDRAILS: BudgetGuardrails = {
  maxDailySpend: 50000,
  maxBudgetChangePercent: 25,
  maxScalePercent: 30,
  approvalRequired: true,
  currency: "COP",
};

describe("BudgetGuard (MASTER PLAN §17, §31)", () => {
  it("genera la clave de hoy en formato YYYY-MM-DD", () => {
    expect(todayKey(new Date(2026, 7, 18))).toBe("2026-08-18");
  });

  it("permite gasto dentro del tope diario", () => {
    const r = canSpendToday(GUARDRAILS, 10000, 5000);
    expect(r.allowed).toBe(true);
  });

  it("bloquea gasto que supera el tope diario", () => {
    const r = canSpendToday(GUARDRAILS, 45000, 10000);
    expect(r.allowed).toBe(false);
  });

  it("permite cambios de presupuesto dentro del límite por operación", () => {
    const r = canChangeBudget(GUARDRAILS, 1000, 1200);
    expect(r.allowed).toBe(true);
    expect(r.deltaPercent).toBeCloseTo(20);
  });

  it("bloquea cambios que superan maxBudgetChangePercent", () => {
    const r = canChangeBudget(GUARDRAILS, 1000, 1500); // +50% > 25%
    expect(r.allowed).toBe(false);
  });

  it("permite fijar presupuesto inicial cuando el actual es 0", () => {
    const r = canChangeBudget(GUARDRAILS, 0, 20000);
    expect(r.allowed).toBe(true);
  });

  it("permite escalar dentro de maxScalePercent (escalado gradual §18)", () => {
    const r = canScale(GUARDRAILS, 2000, 2500); // +25% ≤ 30%
    expect(r.allowed).toBe(true);
  });

  it("bloquea escaladas agresivas que superan maxScalePercent", () => {
    const r = canScale(GUARDRAILS, 2000, 4000); // +100% > 30%
    expect(r.allowed).toBe(false);
  });

  it("no considera una bajada como escalada", () => {
    const r = canScale(GUARDRAILS, 2000, 1500);
    expect(r.allowed).toBe(true);
  });
});
