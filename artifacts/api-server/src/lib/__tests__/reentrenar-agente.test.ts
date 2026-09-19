import { describe, it, expect, beforeAll } from "vitest";
import { eq, and, like } from "drizzle-orm";
import { db, agents, tenants, productKnowledge, architectMemory, products } from "@workspace/db";
import { planDeReentrenamiento, aplicarReentrenamiento, PROMPT_BASE } from "../reentrenar-agente";

/**
 * Reentrenar desde cero (18-09-2026): borra SOLO las lecciones automáticas,
 * pone el prompt base en los agentes activos, y siembra/reemplaza las filas
 * "[base]" sin tocar lo que el dueño cargó a mano.
 */
describe("reentrenar al vendedor", () => {
  const T = 1;
  let manual: number;
  beforeAll(async () => {
    await db.insert(tenants).values({ id: T, name: "t", email: "t@t.t", slug: "t", brandName: "T", agentPrompt: "viejo acumulado" } as any).onConflictDoNothing();
    await db.update(tenants).set({ agentPrompt: "viejo acumulado" } as any).where(eq(tenants.id, T));
    await db.insert(agents).values({ tenantId: T, name: "Sofía", role: "asesora", tone: "calido", systemPrompt: "prompt viejo lleno de reglas", isActive: true } as any);
    await db.insert(products).values({ tenantId: T, name: "CURSO DE PIANO COMPLETO", description: "x", price: "60000", currency: "COP", kind: "digital", isActive: true, features: [] } as any);
    await db.insert(architectMemory).values({ tenantId: T, sessionId: "s", memoryType: "reflection", title: "Lección: sale_progress", content: "…", tags: ["lesson", "outcome:sale_progress"], metadata: { source: "conversation_learning" } } as any);
    await db.insert(architectMemory).values({ tenantId: T, sessionId: "s", memoryType: "research_result", title: "Investigación real", content: "…", tags: [], metadata: { estado: "listo" } } as any);
    const [m] = await db.insert(productKnowledge).values({ tenantId: T, productId: null, pregunta: "horario", disparadores: "horario, a que hora", respuesta: "24/7" } as any).returning();
    manual = m.id;
    await db.insert(productKnowledge).values({ tenantId: T, productId: null, pregunta: "[base] vieja", disparadores: "xyz", respuesta: "vieja" } as any);
  });

  it("el plan cuenta solo las lecciones y las filas [base]", async () => {
    const plan = await planDeReentrenamiento(T);
    expect(plan.lecciones).toHaveLength(1);
    expect(plan.baseVieja).toHaveLength(1);
    expect(plan.agentes.map((a) => a.name)).toContain("Sofía");
    expect(plan.conocimiento.some((c) => /piano/i.test(c.pregunta) && c.productId)).toBe(true);
    // IA 2026 no está en este catálogo: se omite y se dice.
    expect(plan.omitidas.join(" ")).toMatch(/INTELIGENCIA ARTIFICIAL/);
    expect(plan.resumen).toMatch(/1 lecciones/);
  });

  it("aplicar borra lo automático, conserva lo manual y deja el prompt base", async () => {
    await aplicarReentrenamiento(T);
    const memorias = await db.select().from(architectMemory).where(eq(architectMemory.tenantId, T));
    expect(memorias.map((m: any) => m.title)).toEqual(["Investigación real"]);
    const [ag] = await db.select().from(agents).where(and(eq(agents.tenantId, T), eq(agents.name, "Sofía")));
    expect(ag.systemPrompt).toBe(PROMPT_BASE);
    const [t] = await db.select().from(tenants).where(eq(tenants.id, T));
    expect(t.agentPrompt ?? null).toBeNull();
    const [man] = await db.select().from(productKnowledge).where(eq(productKnowledge.id, manual));
    expect(man).toBeTruthy();
    const base = await db.select().from(productKnowledge).where(and(eq(productKnowledge.tenantId, T), like(productKnowledge.pregunta, "[base]%")));
    expect(base.some((b: any) => b.pregunta === "[base] vieja")).toBe(false);
    expect(base.length).toBeGreaterThanOrEqual(4);
    // Y correrlo dos veces no duplica.
    await aplicarReentrenamiento(T);
    const base2 = await db.select().from(productKnowledge).where(and(eq(productKnowledge.tenantId, T), like(productKnowledge.pregunta, "[base]%")));
    expect(base2.length).toBe(base.length);
  });
});
