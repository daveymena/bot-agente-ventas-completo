/**
 * La FUENTE del "¿Confirmás que actualice la landing 1…?" escrito como texto
 * (07-10-2026): dos textos nuestros le enseñaban al modelo a cerrar pidiendo
 * confirmación por su cuenta.
 *
 *   · La plantilla B del prompt: "…y cerrá pidiendo confirmación. Ej: …¿Lo genero?"
 *   · El resultado de propose_action: "…decile qué preparaste y pedile que lo confirme."
 *
 * Con plan, eso salía como dos preguntas seguidas (la del modelo y la del
 * servidor). Sin plan, como una pregunta que el "sí" no podía ejecutar.
 */
import { describe, it, expect } from "vitest";
import { ATLAS_NUCLEO } from "../app-operator";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";

describe("el prompt no enseña a pedir confirmación en texto", () => {
  it("la plantilla de un cambio termina en propose_action, no en una pregunta", () => {
    expect(ATLAS_NUCLEO).not.toMatch(/cerrá pidiendo confirmación/);
    expect(ATLAS_NUCLEO).not.toMatch(/\\n\\n¿Lo genero\?"/);
    expect(ATLAS_NUCLEO).toMatch(/NUNCA cierres con "¿Confirmás\?"/);
  });

  it("ya no se contradice con la negrita (6.f la pide, 8 la prohibía)", () => {
    expect(ATLAS_NUCLEO).not.toMatch(/nunca uses \*negrita\*/);
    expect(ATLAS_NUCLEO).toMatch(/\*\*negrita\*\*/);
  });

  it("no anuncia lo que va a hacer antes de hacerlo", () => {
    expect(ATLAS_NUCLEO).toMatch(/No repitas el pedido ni anuncies lo que vas a hacer/);
    expect(ATLAS_NUCLEO).not.toMatch(/Ej: "Entendido\.\\n\\nVoy a preparar/);
  });
});

describe("el resultado de propose_action no le pide al modelo que pregunte", () => {
  it("le dice que NO cierre preguntando", async () => {
    const propose = buildMcpToolRegistry("publicá la landing").find((t) => t.name === "propose_action")!;
    const r = await propose.handler({ tool: "landing_publicar", args: { id: 7 } }, { tenantId: 1, sessionId: "s-prueba", turnId: `t-${Date.now()}` } as any);
    expect(r.ok).toBe(true);
    expect(r.summary).toMatch(/TODAVÍA NO SE EJECUTÓ NADA/);
    expect(r.summary).not.toMatch(/pedile que lo confirme/);
    expect(r.summary).toMatch(/NO cierres preguntando/);
  });
});
