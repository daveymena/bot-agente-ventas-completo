import { describe, it, expect } from "vitest";
// replica de num() del renderer-estilo (no exportada)
function num(v: unknown): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const mDec = s.match(/^(\d{1,7}(?:[.\s]\d{3})*),(\d{2})$/) || s.match(/^(\d+)\.(\d{2})$/);
  if (mDec) return Math.round(Number(`${mDec[1].replace(/[.\s]/g, "")}.${mDec[2]}`));
  const mMiles = s.match(/^(\d{1,3}(?:[.,]\d{3})+)$/);
  if (mMiles) return Number(mMiles[1].replace(/[.,]/g, ""));
  const d = s.replace(/[^\d]/g, "");
  return d ? Number(d) : 0;
}
describe("num() con el bug real de precios", () => {
  it("55000.00 (drizzle decimal) -> 55000", () => expect(num("55000.00")).toBe(55000));
  it("22200.00 -> 22200", () => expect(num("22200.00")).toBe(22200));
  it("55.000 (miles es-CO) -> 55000", () => expect(num("55.000")).toBe(55000));
  it("55,000 -> 55000", () => expect(num("55,000")).toBe(55000));
  it("55000 plain -> 55000", () => expect(num("55000")).toBe(55000));
  it("849900.00 decimal -> 849900", () => expect(num("849900.00")).toBe(849900));
  it("vacío -> 0", () => expect(num("")).toBe(0));
  it("null -> 0", () => expect(num(null)).toBe(0));
  it("1.050.000 (miles) -> 1050000", () => expect(num("1.050.000")).toBe(1050000));
});
