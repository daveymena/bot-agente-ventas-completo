/**
 * Test de integración del CICLO DE APRENDIZAJE (evaluar → guardar → recuperar):
 *   - learnFromLastExchange detecta un fallo (cliente repite la pregunta)
 *   - recordLesson guarda la lección en architect_memory
 *   - retrieveLessons la recupera con prioridad para el mismo producto
 *   - formatLessonsForPrompt la convierte en contexto para el prompt
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let dbMod: any;
let tenantId = 0;

describe("Ciclo de aprendizaje del agente (integración)", () => {
  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const db = dbMod.db;
    const email = `learn-test-${Date.now()}@test.local`;
    const [tenant] = await db.insert(dbMod.tenants).values({
      name: "Learn Test",
      email,
      slug: `learn-${Date.now()}`,
      brandName: "Learn Test",
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

  it("aprende de un fallo: cliente repite la pregunta", async () => {
    const { learnFromLastExchange } = await import("../conversation-learning");
    const evaluation = await learnFromLastExchange({
      tenantId,
      customerMsg: "¿cuánto cuesta el curso de piano?",
      prevCustomerMsg: "¿cuánto cuesta el curso de piano?",
      agentReply: "El curso cuesta $60.000 con acceso de por vida.",
      productName: "Curso de Piano",
      intent: "details_query",
    });

    expect(evaluation).not.toBeNull();
    expect(evaluation!.outcome).toBe("customer_confused");
  });

  it("recupera la lección con prioridad para el mismo producto", async () => {
    const { retrieveLessons } = await import("../conversation-learning");
    const lessons = await retrieveLessons(tenantId, {
      productName: "Curso de Piano",
      limit: 3,
    });
    expect(lessons.length).toBeGreaterThanOrEqual(1);
    const primera = lessons[0]!;
    expect(primera.outcome).toBe("customer_confused");
    expect(primera.productName).toContain("curso de piano");
  });

  it("formatea las lecciones para inyectarlas en el prompt", async () => {
    const { retrieveLessons, formatLessonsForPrompt } = await import("../conversation-learning");
    const lessons = await retrieveLessons(tenantId, { productName: "Curso de Piano" });
    const block = formatLessonsForPrompt(lessons);
    expect(block).toContain("APRENDIZAJE");
    expect(block.toLowerCase()).toContain("confusión");
  });

  it("el aprendizaje no bloquea cuando no hay fallo (no_signal)", async () => {
    const { learnFromLastExchange } = await import("../conversation-learning");
    const evaluation = await learnFromLastExchange({
      tenantId,
      customerMsg: "veo y te confirmo en un rato",
      prevCustomerMsg: "¿cuánto cuesta?",
      agentReply: "Cuesta $60.000.",
      productName: "Curso de Piano",
    });
    expect(evaluation).toBeNull();
  });
});
