import { describe, expect, it, afterEach } from "vitest";
import { mintTurnToken, verifyTurnToken } from "../opencode-turn-token";

const originalSecret = process.env.ATLAS_MCP_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.ATLAS_MCP_SECRET;
  else process.env.ATLAS_MCP_SECRET = originalSecret;
});

describe("Atlas MCP turn token", () => {
  it("firma y conserva el alcance de herramientas del turno", () => {
    process.env.ATLAS_MCP_SECRET = "test-secret";
    const token = mintTurnToken({
      tenantId: 7,
      sessionId: "session",
      turnId: "turn",
      allowedTools: ["list_products", "propose_action"],
    });

    expect(verifyTurnToken(token)).toMatchObject({
      tenantId: 7,
      sessionId: "session",
      turnId: "turn",
      allowedTools: ["list_products", "propose_action"],
    });
  });

  it("falla cerrado si no existe el secreto dedicado", () => {
    delete process.env.ATLAS_MCP_SECRET;

    expect(() => mintTurnToken({
      tenantId: 7,
      sessionId: "session",
      turnId: "turn",
      allowedTools: [],
    })).toThrow("ATLAS_MCP_SECRET");
    expect(verifyTurnToken("eyJmb28iOiJiYXIifQ.fake")).toBeNull();
  });
});
