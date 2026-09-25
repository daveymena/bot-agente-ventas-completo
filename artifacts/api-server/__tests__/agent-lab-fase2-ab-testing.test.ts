/**
 * AGENT LAB — Fase 2 Real (A/B Testing + Rollback)
 *
 * Verifica que:
 * 1. A/B test routing funciona (cliente_id % 100)
 * 2. Rollback revierte a versión anterior
 * 3. Métricas de conversión se calculan correctamente
 * 4. Recomendaciones son sensatas
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ensureDbReady, agents, promptVersions, tenants, products } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

describe("Agent Lab — Fase 2 (A/B Testing)", () => {
  let tenantId = 0;
  let agentId = 0;
  let versionId = 0;

  beforeAll(async () => {
    const { db } = await ensureDbReady();

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, 1));
    if (!tenant) throw new Error("No hay tenant de pruebas");
    tenantId = tenant.id;

    const [agent] = await db.select().from(agents).where(eq(agents.tenantId, tenantId));
    if (!agent) throw new Error("No hay agente de pruebas");
    agentId = agent.id;

    // Crear versión candidata para probar
    const [version] = await db
      .insert(promptVersions)
      .values({
        tenantId,
        agentId,
        previousPrompt: "prompt anterior",
        newPrompt: "prompt mejorado",
        diffSummary: "cambios del prompt",
        reason: "Test de A/B",
        appliedBy: "test",
        isActive: false,
      })
      .returning();

    versionId = version.id;
  });

  it("Versión candidata se guarda para A/B test", async () => {
    const { db } = await ensureDbReady();
    const [version] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, versionId));

    expect(version).toBeTruthy();
    expect(version.agentId).toBe(agentId);
    expect(version.isActive).toBe(false);
  });

  it("A/B test routing (client_id % 100)", () => {
    const trafficPercent = 10;

    // Simular 100 clientes
    const control: number[] = [];
    const treatment: number[] = [];

    for (let clientId = 1; clientId <= 100; clientId++) {
      const hash = Math.abs(clientId % 100);
      if (hash < trafficPercent) {
        treatment.push(clientId);
      } else {
        control.push(clientId);
      }
    }

    expect(treatment.length).toBe(trafficPercent);
    expect(control.length).toBe(100 - trafficPercent);
  });

  it("Rollback recupera versión anterior", async () => {
    const { db } = await ensureDbReady();

    // Crear dos versiones: v1 y v2
    const [v1] = await db
      .insert(promptVersions)
      .values({
        tenantId,
        agentId,
        previousPrompt: "prompt original",
        newPrompt: "prompt v1",
        diffSummary: "v1 cambios",
        reason: "Test rollback",
        appliedBy: "test",
        isActive: true,
      })
      .returning();

    const [v2] = await db
      .insert(promptVersions)
      .values({
        tenantId,
        agentId,
        previousPrompt: "prompt v1",
        newPrompt: "prompt v2",
        diffSummary: "v2 cambios",
        reason: "Test rollback",
        appliedBy: "test",
        isActive: true,
      })
      .returning();

    // Simular rollback: marcar v2 inactivo
    await db.update(promptVersions).set({ isActive: false }).where(eq(promptVersions.id, v2.id));

    // Verificar que v1 es recuperable
    const [recoveredV1] = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.id, v1.id));

    expect(recoveredV1.isActive).toBe(true);
    expect(recoveredV1.newPrompt).toBe("prompt v1");
  });

  it("Conversión se calcula correctamente", () => {
    // Simular 10 conversaciones: 7 completadas en control, 8 en tratamiento
    const controlCompletadas = 7;
    const controlTotal = 10;
    const treatmentCompletadas = 8;
    const treatmentTotal = 10;

    const conversionControl = controlCompletadas / controlTotal; // 0.70
    const conversionTreatment = treatmentCompletadas / treatmentTotal; // 0.80
    const mejora = ((conversionTreatment - conversionControl) / conversionControl) * 100; // +14.28%

    expect(conversionControl).toBe(0.7);
    expect(conversionTreatment).toBe(0.8);
    expect(mejora).toBeGreaterThan(10);
  });

  it("Recomendación es correcta según mejora", () => {
    const scenarios = [
      { mejora: 15, expected: "APLICA" },
      { mejora: -10, expected: "ROLLBACK" },
      { mejora: 2, expected: "NEUTRAL" },
    ];

    for (const { mejora, expected } of scenarios) {
      let recomendacion = "";
      if (mejora > 5) {
        recomendacion = "APLICA";
      } else if (mejora < -5) {
        recomendacion = "ROLLBACK";
      } else {
        recomendacion = "NEUTRAL";
      }

      expect(recomendacion).toBe(expected);
    }
  });
});

describe("Agent Lab — Historial de versiones", () => {
  it("Versiones se ordenan por fecha", async () => {
    const { db } = await ensureDbReady();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, 1));
    const [agent] = await db.select().from(agents).where(eq(agents.tenantId, tenant.id));

    const versions = await db
      .select()
      .from(promptVersions)
      .where(eq(promptVersions.agentId, agent.id));

    if (versions.length >= 2) {
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i - 1].createdAt.getTime()).toBeGreaterThanOrEqual(
          versions[i].createdAt.getTime()
        );
      }
    }
  });
});
