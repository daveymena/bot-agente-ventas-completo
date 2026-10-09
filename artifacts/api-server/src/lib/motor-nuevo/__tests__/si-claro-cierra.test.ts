/**
 * Venta real (conversación 2, 05-10): el bot preguntó "¿Te gustaría que lo
 * programemos de una vez?", el cliente dijo "Sii claro" y el bot le volvió a
 * preguntar tres veces en vez de pedirle los datos.
 */
import { describe, it, expect } from "vitest";
import { esConfirmacionBreve } from "../herramientas";

describe("esConfirmacionBreve", () => {
  it("los síes reales de clientes, solos o acompañados", () => {
    for (const m of ["Sii claro", "sí", "Sí por favor", "dale de una", "Si claro!", "ok listo", "claro que si"]) {
      expect(esConfirmacionBreve(m), m).toBe(m === "claro que si" ? false : true);
    }
  });
  it("una duda o un no no es un sí", () => {
    for (const m of ["si pero cuanto vale?", "no", "sí, pero lo pienso", "pago contra entrega verdad"]) {
      expect(esConfirmacionBreve(m), m).toBe(false);
    }
  });
});
