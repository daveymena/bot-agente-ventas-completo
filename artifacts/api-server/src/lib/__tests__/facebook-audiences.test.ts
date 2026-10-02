import { describe, expect, it } from "vitest";
import { normalizarTelefonoParaMeta, hashMeta } from "../facebook-audiences";

describe("facebook-audiences (puro, sin red)", () => {
  it("normaliza celulares CO a 12 dígitos", () => {
    expect(normalizarTelefonoParaMeta("3001234567")).toBe("573001234567");
    expect(normalizarTelefonoParaMeta("+57 300 123 4567")).toBe("573001234567");
    expect(normalizarTelefonoParaMeta("573001234567")).toBe("573001234567");
  });
  it("rechaza basura", () => {
    expect(normalizarTelefonoParaMeta("")).toBeNull();
    expect(normalizarTelefonoParaMeta("abc")).toBeNull();
    expect(normalizarTelefonoParaMeta("123")).toBeNull();
    expect(normalizarTelefonoParaMeta("1".repeat(20))).toBeNull();
  });
  it("hash SHA-256 hex minúsculas de 64 chars", () => {
    const h = hashMeta("573001234567");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashMeta(" 573001234567 ")).toBe(h);
  });
});
