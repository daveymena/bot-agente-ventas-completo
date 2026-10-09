/**
 * 09-10-2026, pedido del dueño: "que reentrene". No el reseteo de
 * `reentrenar-agente` (borrar todo), sino mejora continua: lo que se repite
 * como fallo se vuelve regla permanente y lo viejo se poda.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { normalizarRecomendacion, recomendacionDe, decidirMejora } from "../mejora-continua";

vi.mock("../correcciones-del-dueno", () => ({
  loQueSabeElVendedor: async () => ({ indicaciones: [] }),
  corregirForma: async (_t: number, indicacion: string) => ({ ok: true, mensaje: `Listo: ${indicacion}` }),
}));

const REC = "No prometas tiempos de entrega exactos; confirma con la guía.";
const ahora = new Date("2026-10-09T12:00:00Z");

function leccion(id: number, recomendacion: string, outcome = "customer_confused", dias = 1) {
  return { id, outcome, recomendacion, creadaEn: new Date(ahora.getTime() - dias * 24 * 3600 * 1000) };
}

describe("partes puras", () => {
  it("normaliza tildes y signos para agrupar", () => {
    expect(normalizarRecomendacion("Evitar presión, ¡dejar el precio!")).toBe(normalizarRecomendacion("evitar presion dejar el precio"));
  });

  it("saca la recomendación del contenido de la lección", () => {
    expect(recomendacionDe("Fallo detectado: x\nEl agente respondió: y\nRecomendación: no presiones")).toBe("no presiones");
    expect(recomendacionDe("sin recomendación")).toBe("");
  });

  it("3 fallos iguales → regla; 2 no alcanzan", () => {
    const tres = decidirMejora([leccion(1, REC), leccion(2, REC), leccion(3, REC)], [], ahora);
    expect(tres.promociones).toHaveLength(1);
    expect(tres.promociones[0].veces).toBe(3);
    const dos = decidirMejora([leccion(1, REC), leccion(2, REC)], [], ahora);
    expect(dos.promociones).toHaveLength(0);
  });

  it("lo que ya es indicación no se duplica", () => {
    const p = decidirMejora([leccion(1, REC), leccion(2, REC), leccion(3, REC)], [REC], ahora);
    expect(p.promociones).toHaveLength(0);
  });

  it("lo de más de 30 días se poda aunque no se promueva", () => {
    const p = decidirMejora([leccion(9, "algo único viejo", "positive", 40)], [], ahora);
    expect(p.promociones).toHaveLength(0);
    expect(p.podarIds).toContain(9);
  });
});

describe("integración con la base", () => {
  let dbMod: any;
  let tenantId = 0;

  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const email = `mejora-test-${Date.now()}@test.local`;
    const [tenant] = await dbMod.db.insert(dbMod.tenants).values({
      name: "Mejora Test", email, slug: `mejora-${Date.now()}`, brandName: "Mejora Test",
    }).returning();
    tenantId = tenant.id;
    const contenido = (r: string) => `Fallo detectado: el cliente repitió la pregunta\nEl agente respondió: algo\nRecomendación: ${r}`;
    for (let i = 0; i < 3; i++) {
      await dbMod.db.insert(dbMod.architectMemory).values({
        tenantId, sessionId: "default", memoryType: "reflection",
        title: "Lección: customer_confused", content: contenido(REC),
        tags: ["lesson", "outcome:customer_confused"], metadata: { source: "conversation_learning", outcome: "customer_confused" },
      });
    }
  });

  afterAll(async () => {
    if (!dbMod) return;
    try {
      await dbMod.db.delete(dbMod.architectMemory);
      await dbMod.db.delete(dbMod.tenants);
    } catch { /* noop */ }
  });

  it("el plan propone la regla repetida", async () => {
    const { planDeMejora } = await import("../mejora-continua");
    const plan = await planDeMejora(tenantId);
    expect(plan.lecciones).toBe(3);
    expect(plan.promociones).toHaveLength(1);
    expect(plan.promociones[0].recomendacion).toBe(REC);
  });

  it("aplicar promueve la regla y poda las lecciones", async () => {
    const { aplicarMejora, leerLecciones } = await import("../mejora-continua");
    const rep = await aplicarMejora(tenantId);
    expect(rep.aplicadas).toHaveLength(1);
    expect(rep.podadas).toBe(3);
    expect(await leerLecciones(tenantId)).toHaveLength(0);
  });
});
