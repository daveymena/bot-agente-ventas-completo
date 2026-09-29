import { describe, expect, it } from "vitest";
import { buildChatHistory } from "../conversation-engine";

const mem = (n: number, len: number) => ({
  history: Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "customer" : "assistant",
    content: `m${i}-` + "x".repeat(Math.max(0, len - 4)),
  })),
}) as any;

describe("buildChatHistory con tope de chars", () => {
  it("respeta maxMessages como antes", () => {
    const r = buildChatHistory(mem(30, 20), 12, 100000);
    expect(r).toHaveLength(12);
  });
  it("recorta por chars desde lo más viejo", () => {
    const r = buildChatHistory(mem(30, 500), 30, 2000);
    const total = r.reduce((a, m) => a + m.content.length, 0);
    expect(total).toBeLessThanOrEqual(2000 + 500);
    // lo más reciente siempre sobrevive
    expect(r[r.length - 1]!.content).toMatch(/^m29-/);
  });
  it("conserva mínimo 4 mensajes aunque excedan", () => {
    const r = buildChatHistory(mem(10, 5000), 10, 100);
    expect(r.length).toBeGreaterThanOrEqual(4);
  });
  it("mapea roles customer->user", () => {
    const r = buildChatHistory(mem(2, 10), 10, 100000);
    expect(r[0]!.role).toBe("user");
    expect(r[1]!.role).toBe("assistant");
  });
});
