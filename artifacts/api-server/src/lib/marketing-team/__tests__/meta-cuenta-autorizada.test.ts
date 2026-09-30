/**
 * CUENTA PUBLICITARIA AUTORIZADA (P0 §3.2 del doc de faltantes de Meta Ads)
 *
 * Antes de publicar o activar, la cuenta en uso tiene que ser la COP
 * autorizada del negocio y estar activa en Meta. Si no, se bloquea con el
 * motivo exacto: nunca se elige otra cuenta sola.
 */
import { describe, it, expect } from "vitest";
import { veredictoDeCuenta } from "../../meta-cuenta-autorizada";

const COP_ACTIVA = { id: "123", nombre: "Negocio COP", moneda: "COP", estado: 1 };
const AUTORIZADA = { id: "123", moneda: "COP", fijadaEn: "2026-09-30T00:00:00.000Z", fijadaPor: "auto:test" };

describe("veredictoDeCuenta", () => {
  it("sin cuenta de Meta no se publica a ciegas", () => {
    expect(veredictoDeCuenta(null, null).ok).toBe(false);
    expect(veredictoDeCuenta({ id: "" }, null).ok).toBe(false);
  });

  it("cuenta en USD: bloquea y pide la COP", () => {
    const v = veredictoDeCuenta({ ...COP_ACTIVA, moneda: "USD" }, null);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/USD/);
    expect(v.motivo).toMatch(/COP/);
  });

  it("sin moneda informada también bloquea (no se asume COP)", () => {
    expect(veredictoDeCuenta({ id: "123", estado: 1 }, null).ok).toBe(false);
  });

  it("cuenta deshabilitada: bloquea con el estado", () => {
    const v = veredictoDeCuenta({ ...COP_ACTIVA, estado: 2 }, AUTORIZADA);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/deshabilitada/);
  });

  it("cuenta distinta a la autorizada: bloquea y no cambia sola", () => {
    const v = veredictoDeCuenta({ ...COP_ACTIVA, id: "999" }, AUTORIZADA);
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/999/);
    expect(v.motivo).toMatch(/123/);
  });

  it("COP + activa + autorizada: pasa", () => {
    const v = veredictoDeCuenta(COP_ACTIVA, AUTORIZADA);
    expect(v.ok).toBe(true);
  });

  it("COP + activa sin nada fijado: pasa (el vivo la fija y audita)", () => {
    expect(veredictoDeCuenta(COP_ACTIVA, null).ok).toBe(true);
  });
});
