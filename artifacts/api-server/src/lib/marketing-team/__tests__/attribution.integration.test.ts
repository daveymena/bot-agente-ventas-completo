/**
 * Test de integración de la FASE 5 (GAP-1): atribución ad → lead → venta.
 * Usa la base SQLite real (USE_SQLITE=true) con datos insertados en el test:
 *   - un lead que llegó desde un anuncio (adContext con adId/adTitle)
 *   - un pago confirmado asociado a ese lead
 * y verifica que getAttributionSummary cruza ambas cosas correctamente.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

let dbMod: any;
let tenantId = 0;
let leadId = 0;

describe("Attribution (Fase 5 / GAP-1)", () => {
  beforeAll(async () => {
    dbMod = await import("@workspace/db");
    await dbMod.ensureDbReady();
    const db = dbMod.db;

    const email = `attr-test-${Date.now()}@test.local`;
    const [tenant] = await db.insert(dbMod.tenants).values({
      name: "Attr Test",
      email,
      slug: `attr-${Date.now()}`,
      brandName: "Attr Test",
    }).returning();
    tenantId = tenant.id;

    const [product] = await db.insert(dbMod.products).values({
      name: "Curso Test",
      description: "Descripción",
      price: 100,
      tenantId,
    }).returning();

    const [lead] = await db.insert(dbMod.leads).values({
      name: "Cliente Anuncio",
      phone: "573001234567",
      tenantId,
      source: "meta_ads",
      adContext: { adId: "ad_123", adTitle: "Aprende desde cero", capturedAt: new Date().toISOString() },
    }).returning();
    leadId = lead.id;

    await db.insert(dbMod.payments).values({
      tenantId,
      leadId,
      productId: product.id,
      amount: 100,
      method: "nequi",
      status: "confirmed",
      paymentStatus: "approved",
    });
  });

  afterAll(async () => {
    if (!dbMod) return;
    const db = dbMod.db;
    try { await db.delete(dbMod.payments); } catch { /* noop */ }
    try { await db.delete(dbMod.leads); } catch { /* noop */ }
    try { await db.delete(dbMod.products); } catch { /* noop */ }
    try { await db.delete(dbMod.tenants); } catch { /* noop */ }
  });

  it("cruza el lead del anuncio con el pago confirmado", async () => {
    const { getAttributionSummary } = await import("../attribution");
    const result = await getAttributionSummary(tenantId, 30);

    const row = result.rows.find((r: any) => r.adId === "ad_123");
    if (!row) throw new Error("No se encontró la fila de atribución");
    expect(row.leads).toBe(1);
    expect(row.paid).toBe(1);
    expect(row.revenue).toBe(100);
    expect(row.conversionRate).toBe(100);
  });

  it("reporta el embudo con ventas e ingresos", async () => {
    const { getFunnelSnapshot } = await import("../attribution");
    const funnel = await getFunnelSnapshot(tenantId, 30);
    expect(funnel.leads).toBeGreaterThanOrEqual(1);
    expect(funnel.paid).toBeGreaterThanOrEqual(1);
    expect(funnel.revenue).toBeGreaterThanOrEqual(100);
  });

  it("attachAdContextToLead actualiza el contexto del anuncio en el lead", async () => {
    const { attachAdContextToLead } = await import("../attribution");
    await attachAdContextToLead(leadId, { titulo: "Nuevo título", cuerpo: "c", url: "u", anuncioId: "ad_999" });

    const rows = await dbMod.db.select().from(dbMod.leads);
    const updated = rows.find((r: any) => r.id === leadId);
    expect(updated.adContext.adId).toBe("ad_999");
    expect(updated.source).toBe("meta_ads");
  });
});
