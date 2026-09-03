/**
 * LA MEMORIA DE ATLAS TIENE QUE SER LA DEL FINAL, NO LA DEL PRINCIPIO.
 *
 * Reportado el 2026-09-03: "Atlas perdió contexto". No se le olvidaba nada:
 * `loadArchitectHistory` pedía `orderBy(asc(createdAt)).limit(40)`, que es
 * "los cuarenta mensajes MÁS VIEJOS de la charla".
 *
 * Con menos de 40 mensajes daba igual --si hay 12, los primeros 40 son los
 * 12--, así que funcionó hasta que alguien pasó de 40. A partir de ahí Atlas
 * releía para siempre el arranque de la conversación y no volvía a ver nada
 * reciente: cada mensaje nuevo entraba a la base y nunca salía.
 *
 * Y el problema EMPEORA cuanto más se conversa, que es exactamente lo
 * contrario de lo que uno espera de una memoria.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let dbMod: any;
let tenantId = 0;

const SESION = "memoria-test";

describe("Memoria de Atlas (integración)", () => {
  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const [tenant] = await dbMod.db.insert(dbMod.tenants).values({
      name: "Memoria Test",
      email: `memoria-test-${Date.now()}@test.local`,
      slug: `memoria-${Date.now()}`,
      brandName: "Memoria Test",
    }).returning();
    tenantId = tenant.id;
  });

  afterAll(async () => {
    if (!dbMod) return;
    try {
      await dbMod.db.delete(dbMod.architectMemory);
      await dbMod.db.delete(dbMod.tenants);
    } catch { /* noop */ }
  });

  /**
   * LA REGRESIÓN. 45 mensajes guardados, tope de 40: lo que tiene que
   * sobrevivir es el final de la charla, no el arranque.
   */
  it("con más mensajes que el tope, recuerda los ÚLTIMOS", async () => {
    const { saveArchitectTurn, loadArchitectHistory } = await import("../architect-store");

    for (let i = 1; i <= 45; i++) {
      await saveArchitectTurn(tenantId, SESION, i % 2 === 1 ? "user" : "assistant", `mensaje ${i}`);
    }

    const historia = await loadArchitectHistory(tenantId, SESION);
    const textos = historia.map((h) => h.content);

    // Lo último dicho tiene que estar. Es el pedido que el admin acaba de
    // escribir: sin esto Atlas contesta sobre otra cosa.
    expect(textos).toContain("mensaje 45");
    // Y lo del arranque ya no, porque no entra en el tope.
    expect(textos).not.toContain("mensaje 1");
  });

  /**
   * El orden importa tanto como el contenido: se piden por fecha descendente
   * y se dan vuelta, porque el modelo tiene que leerlos como pasaron. Si se
   * devolvieran al revés, la conversación se lee de atrás para adelante.
   */
  it("los devuelve en el orden en que se dijeron", async () => {
    const { loadArchitectHistory } = await import("../architect-store");
    const historia = await loadArchitectHistory(tenantId, SESION);

    const numero = (c: string) => Number(c.replace("mensaje ", ""));
    const nums = historia.map((h) => numero(h.content));

    expect(nums).toEqual([...nums].sort((a, b) => a - b));
    expect(nums[nums.length - 1]).toBe(45);
  });

  it("no se mezcla con otra charla del mismo negocio", async () => {
    const { saveArchitectTurn, loadArchitectHistory } = await import("../architect-store");
    await saveArchitectTurn(tenantId, "otra-charla", "user", "esto es de otra charla");

    const historia = await loadArchitectHistory(tenantId, SESION);
    expect(historia.map((h) => h.content)).not.toContain("esto es de otra charla");
  });
});
