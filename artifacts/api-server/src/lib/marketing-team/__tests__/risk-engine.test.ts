import { describe, it, expect } from "vitest";
import { classifyAction, canExecuteAutonomously, riskLevel } from "../risk-engine";

describe("RiskEngine (MASTER PLAN §30)", () => {
  it("clasifica acciones de lectura como LOW sin aprobación", () => {
    const c = classifyAction("read_insights");
    expect(c.risk).toBe("LOW");
    expect(c.approvalRequired).toBe(false);
  });

  it("clasifica cambios de presupuesto como HIGH con aprobación", () => {
    const c = classifyAction("change_budget");
    expect(c.risk).toBe("HIGH");
    expect(c.approvalRequired).toBe(true);
    expect(c.maxChangePercent).toBe(25);
  });

  it("clasifica facturación como CRITICAL", () => {
    expect(classifyAction("manage_billing").risk).toBe("CRITICAL");
    expect(classifyAction("change_admin_permissions").risk).toBe("CRITICAL");
  });

  it("trata acciones desconocidas como MEDIUM por defecto", () => {
    const c = classifyAction("accion_inventada_xyz");
    expect(c.risk).toBe("MEDIUM");
  });

  it("nunca permite ejecución autónoma de CRITICAL", () => {
    const r = canExecuteAutonomously("manage_billing", { autonomous: true });
    expect(r.allowed).toBe(false);
  });

  it("no ejecuta automáticamente acciones que requieren aprobación", () => {
    const r = canExecuteAutonomously("change_budget", { autonomous: true });
    expect(r.allowed).toBe(false);
  });

  it("permite ejecución autónoma de LOW cuando la política lo habilita", () => {
    const r = canExecuteAutonomously("generate_copy", { autonomous: true });
    expect(r.allowed).toBe(true);
  });

  it("no ejecuta autónomamente si el modo autónomo está apagado", () => {
    const r = canExecuteAutonomously("generate_copy", { autonomous: false });
    expect(r.allowed).toBe(false);
  });

  it("ordena riesgos LOW < MEDIUM < HIGH < CRITICAL", () => {
    expect(riskLevel("LOW")).toBeLessThan(riskLevel("MEDIUM"));
    expect(riskLevel("MEDIUM")).toBeLessThan(riskLevel("HIGH"));
    expect(riskLevel("HIGH")).toBeLessThan(riskLevel("CRITICAL"));
  });
});
