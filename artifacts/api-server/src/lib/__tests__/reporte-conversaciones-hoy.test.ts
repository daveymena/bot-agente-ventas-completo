import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { clasificarOportunidadHoy, revisarConversacionesDeHoy } from "../reporte-conversaciones-hoy";

describe("interpretación de oportunidad en el reporte diario", () => {
  it("un lead caliente que ya recibió la pregunta de cierre queda esperando al cliente", () => {
    expect(clasificarOportunidadHoy("hot", "agent", false)).toBe("espera_cliente");
  });

  it("si hay follow-up programado, se reporta como seguimiento, no como venta perdida", () => {
    expect(clasificarOportunidadHoy("qualified", "agent", true)).toBe("seguimiento_programado");
  });

  it("si el cliente habló al final, marca que el equipo debe responder", () => {
    expect(clasificarOportunidadHoy("closing", "customer", true)).toBe("respuesta_pendiente");
  });

  it("solo la etapa lost se reporta como marcada perdida", () => {
    expect(clasificarOportunidadHoy("lost", "agent", false)).toBe("marcada_perdida");
  });
});

describe("revisarConversacionesDeHoy usa evidencia y no cuenta chats de prueba", () => {
  let dbm: any;
  let tenantId = 0;
  let convId = 0;
  let evalIds: number[] = [];
  let leadId = 0;
  let productId = 0;

  beforeAll(async () => {
    dbm = await import("@workspace/db");
    await dbm.ensureDbReady();
    const sufijo = Date.now();
    const [tenant] = await dbm.db.insert(dbm.tenants).values({
      name: "Reporte hoy test", email: `reporte-hoy-${sufijo}@test.local`, slug: `reporte-hoy-${sufijo}`, brandName: "Reporte hoy test",
    }).returning();
    tenantId = tenant.id;
    const [producto] = await dbm.db.insert(dbm.products).values({
      tenantId, name: "Corrector Zxf test", description: "Talla única y neopreno", price: 55000, currency: "COP", kind: "physical",
    }).returning();
    productId = producto.id;
    await dbm.db.insert(dbm.facebookDrafts).values({
      tenantId, productId, productName: "Corrector Zxf test", adId: "ad-zxf-test", status: "active",
    });
    const [lead] = await dbm.db.insert(dbm.leads).values({
      tenantId, name: "Lead Zxf", phone: "573000000001", source: "meta_ads",
      adContext: { adId: "ad-zxf-test", adTitle: "Corrector Zxf test", adBody: "Anuncio exacto" },
    }).returning();
    leadId = lead.id;
    const ahora = new Date().toISOString();
    const [conv] = await dbm.db.insert(dbm.conversations).values({
      tenantId, leadId, contactName: "Cliente real test", contactPhone: "573000000001", status: "ai", currentStage: "hot",
      lastMessage: "¿Te gustaría llevarlo?", lastMessageAt: ahora, createdAt: ahora,
    }).returning();
    convId = conv.id;
    await dbm.db.insert(dbm.messages).values([
      { conversationId: convId, role: "customer", content: "¿Cuánto vale el Corrector Zxf test?", createdAt: ahora },
      { conversationId: convId, role: "agent", content: "El valor es $55.000. ¿Te gustaría llevarlo?", metadata: { productId, cardProductIds: [productId] }, createdAt: ahora },
    ] as any);
    await dbm.db.insert(dbm.followUps).values({
      conversationId: convId, leadId, contactName: "Cliente real test", contactPhone: "573000000001",
      scheduledFor: new Date(Date.now() + 12 * 3600000).toISOString(), followUpType: "decision_support",
      message: "¿Quieres que te ayude a pedirlo?", priority: "medium", stage: "hot", completed: false,
    } as any);
    await dbm.db.insert(dbm.payments).values({
      tenantId, conversationId: convId, leadId, productId, amount: 0, currency: "COP", method: "transferencia", status: "pending",
    } as any);
    const evalConvos = await dbm.db.insert(dbm.conversations).values([
      { tenantId, contactName: "Evaluación", contactPhone: `573009${String(sufijo).slice(-6)}`, status: "evaluation", currentStage: "lost", lastMessage: "prueba nueva", lastMessageAt: ahora, createdAt: ahora },
      { tenantId, contactName: "Evaluación", contactPhone: "573009111222", status: "ai", currentStage: "lost", lastMessage: "prueba histórica", lastMessageAt: ahora, createdAt: ahora },
    ]).returning();
    evalIds = evalConvos.map((c: any) => c.id);
    await dbm.db.insert(dbm.messages).values(evalIds.map((id) => ({ conversationId: id, role: "customer", content: "mensaje sintético", createdAt: ahora })));
    await dbm.db.insert(dbm.followUps).values(evalIds.map((id) => ({
      conversationId: id, contactName: "Evaluación", contactPhone: "573009000000",
      scheduledFor: "2020-01-01 00:00:00", followUpType: "checkout_recovery", message: "No enviar, prueba", priority: "urgent", stage: "closing", completed: false,
    })) as any);
  });

  afterAll(async () => {
    if (!dbm || !tenantId) return;
    try {
      const ids = [convId, ...evalIds].filter(Boolean);
      if (ids.length) {
        await dbm.db.delete(dbm.followUps).where(inArray(dbm.followUps.conversationId, ids));
        await dbm.db.delete(dbm.messages).where(inArray(dbm.messages.conversationId, ids));
        await dbm.db.delete(dbm.conversations).where(inArray(dbm.conversations.id, ids));
      }
      await dbm.db.delete(dbm.payments).where(eq(dbm.payments.tenantId, tenantId));
      await dbm.db.delete(dbm.facebookDrafts).where(eq(dbm.facebookDrafts.tenantId, tenantId));
      await dbm.db.delete(dbm.products).where(eq(dbm.products.tenantId, tenantId));
      await dbm.db.delete(dbm.leads).where(eq(dbm.leads.tenantId, tenantId));
      await dbm.db.delete(dbm.tenants).where(eq(dbm.tenants.id, tenantId));
    } catch { /* conserva el resultado de la prueba */ }
  });

  it("incluye transcripción, anuncio/producto atribuido y seguimiento, excluye evaluación", async () => {
    const r = await revisarConversacionesDeHoy(tenantId, { limite: 20 });
    expect(r.conversaciones).toBe(1);
    expect(r.mensajes).toBe(2);
    expect(r.chats[0].id).toBe(convId);
    expect(r.chats[0].transcripcion.map((m) => m.rol)).toEqual(["cliente", "vendedor"]);
    expect(r.chats[0].anuncio).toMatchObject({ fuente: "meta_ads", productoAnuncio: "Corrector Zxf test", atribucionProducto: "borrador-meta-por-adId" });
    expect(r.chats[0].fichasQueSalieron).toContain("Corrector Zxf test");
    expect(r.chats[0].oportunidad).toBe("seguimiento_programado");
    expect(r.chats[0].seguimiento?.mensaje).toMatch(/ayude a pedirlo/);
  });

  it("el follow-up due nunca entrega trabajos de conversaciones de evaluación", async () => {
    const { getDueFollowUps } = await import("../followUpScheduler");
    const due = await getDueFollowUps(tenantId);
    expect(due.map((f: any) => f.conversationId)).not.toContain(evalIds[0]);
    expect(due.map((f: any) => f.conversationId)).not.toContain(evalIds[1]);
  });
});
