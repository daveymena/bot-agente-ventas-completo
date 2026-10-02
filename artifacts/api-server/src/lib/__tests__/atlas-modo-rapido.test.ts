import { describe, it, expect } from "vitest";
import { executeAction, buildToolsDoc, herramientasDeLaFamilia, DISABLED_TOOLS, ATLAS_SYSTEM_PROMPT_V2 } from "../app-operator";

/**
 * Modo rápido de Atlas (30-09-2026): deep_research bloqueaba el turno entero
 * y Atlas investigaba internet para pedidos que se resolvían con datos
 * internos. Queda bloqueado como llamada directa; las investigaciones largas
 * van por research_start / research_check.
 */
describe("Atlas en modo rápido", () => {
  it("deep_research no se ejecuta como llamada directa", async () => {
    expect(DISABLED_TOOLS.has("deep_research")).toBe(true);
    const r = await executeAction("deep_research", { query: "tendencias" }, { tenantId: 1 } as any);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/segundo plano|datos internos/i);
  });

  it("deep_research no aparece en la documentación de herramientas, research_start sí", () => {
    expect(buildToolsDoc("")).not.toMatch(/- deep_research:/);
    expect(buildToolsDoc("")).toMatch(/- research_start:/);
    const familia = herramientasDeLaFamilia("investigá la competencia de mi producto");
    if (familia) expect(familia.has("deep_research")).toBe(false);
  });

  it("el prompt lleva el contrato operativo (modo rápido, investigación solo si se pide, alcance por negocio)", () => {
    expect(ATLAS_SYSTEM_PROMPT_V2).toMatch(/MODO RÁPIDO POR DEFECTO/);
    expect(ATLAS_SYSTEM_PROMPT_V2).toMatch(/MODO INVESTIGACIÓN/);
    expect(ATLAS_SYSTEM_PROMPT_V2).toMatch(/ALCANCE: toda lectura y escritura se limita al negocio/);
    expect(ATLAS_SYSTEM_PROMPT_V2).not.toMatch(/SIEMPRE basá el copy en lo que investigaste/);
  });
});
