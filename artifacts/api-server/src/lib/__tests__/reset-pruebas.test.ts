import { describe, it, expect, beforeEach } from "vitest";
import { count, eq } from "drizzle-orm";
import {
  db,
  conversations,
  leads,
  payments,
  architectMemory,
  marketingCampaigns,
  products,
  agents,
  activityEvents,
} from "@workspace/db";
import { resetearPruebas } from "../reset-pruebas";

/**
 * El reset de pruebas tiene que borrar LO QUE HAY QUE BORRAR y nada más.
 *
 * Es el reset que el admin pide para dejar su panel limpio antes de probar:
 * se van las conversaciones, los leads, los pagos, la memoria de Atlas y los
 * anuncios. Se quedan los productos, los agentes y -- sobre todo -- la sesión
 * de WhatsApp, porque si se va la sesión hay que volver a escanear el QR.
 */

const T = 1;

const n = async (tabla: any, tenantId = T) => {
  const r = await db.select({ c: count() }).from(tabla).where(eq(tabla.tenantId, tenantId));
  return Number(r?.[0]?.c ?? 0);
};

beforeEach(async () => {
  // Limpiar cualquier resto de una corrida anterior.
  await resetearPruebas(T);
});

describe("el reset borra solo los datos de prueba", () => {
  it("borra conversaciones, leads, pagos, memoria y anuncios", async () => {
    await db.insert(conversations).values({ tenantId: T, contactName: "C", contactPhone: "57", agentId: null } as any);
    await db.insert(leads).values({ tenantId: T, name: "L", phone: "57" } as any);
    await db.insert(payments).values({ tenantId: T, amount: 100, currency: "COP", method: "nequi", status: "pending" } as any);
    await db.insert(architectMemory).values({ tenantId: T, memoryType: "nota", title: "x", content: "y" } as any);
    await db.insert(marketingCampaigns).values({ tenantId: T, name: "campaña", objective: "ventas" } as any);

    expect(await n(conversations)).toBe(1);
    expect(await n(leads)).toBe(1);
    expect(await n(payments)).toBe(1);
    expect(await n(architectMemory)).toBe(1);
    expect(await n(marketingCampaigns)).toBe(1);

    const r = await resetearPruebas(T);
    expect(r.ok).toBe(true);

    expect(await n(conversations)).toBe(0);
    expect(await n(leads)).toBe(0);
    expect(await n(payments)).toBe(0);
    expect(await n(architectMemory)).toBe(0);
    expect(await n(marketingCampaigns)).toBe(0);
  });

  it("conserva productos y agentes", async () => {
    await db.insert(products).values({ tenantId: T, name: "Curso", description: "x", kind: "digital" } as any);
    await db.insert(agents).values({ tenantId: T, name: "Agente", role: "r", tone: "t", systemPrompt: "p", especialidad: "digital" } as any);
    await db.insert(leads).values({ tenantId: T, name: "L", phone: "57" } as any);

    const r = await resetearPruebas(T);
    expect(r.ok).toBe(true);

    expect(await n(products)).toBe(1);
    expect(await n(agents)).toBe(1);
    expect(await n(leads)).toBe(0);
  });

  it("crea un backup antes de borrar", async () => {
    await db.insert(leads).values({ tenantId: T, name: "L", phone: "57" } as any);
    const r = await resetearPruebas(T);
    expect(r.ok).toBe(true);
    // El backup es un JSON con lo que se borró, restaurable en emergencia.
    expect(r.backup).toBeTruthy();
    expect(r.backup).toContain(".json");
  });

  it("limpia los eventos de actividad (sin tenant)", async () => {
    await db.insert(activityEvents).values({ type: "test", title: "x" } as any);
    const r = await resetearPruebas(T);
    expect(r.ok).toBe(true);
    const total = await db.select({ c: count() }).from(activityEvents);
    expect(Number(total?.[0]?.c ?? 0)).toBe(0);
  });
});
