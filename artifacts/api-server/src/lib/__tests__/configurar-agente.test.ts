/**
 * LO QUE ATLAS CONFIGURA TIENE QUE CAER DONDE EL VENDEDOR LEE (25-09-2026)
 *
 * `agente_configurar` guardaba el prompt libre en `tenants.agentPrompt` y
 * respondía "ya está activo", pero el motor v2 (el que atiende desde el 22-09)
 * lee las instrucciones de `agents.metadata.indicaciones`. El cambio nunca
 * llegaba al cliente.
 */
import { describe, test, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenants, agents } from "@workspace/db";
import { configurarAgente } from "../configurar-agente";
import { cargarVozDelNegocio } from "../motor-nuevo/adaptador";
import { getBusinessContext } from "../business-context";

async function negocio(motor: "v1" | "v2", conAgentes = 1) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db
    .insert(tenants)
    .values({ name: "Cfg", email: `cfg-${s}@test.local`, slug: `cfg-${s}`, brandName: "Cfg", metadata: { motorVendedor: motor } } as any)
    .returning();
  const creados: any[] = [];
  for (let i = 0; i < conAgentes; i++) {
    const [a] = await db
      .insert(agents)
      .values({ tenantId: t.id, name: i === 0 ? "Sofía" : "Max", role: "asesora", tone: "cálido", systemPrompt: "x", isActive: true, metadata: { indicaciones: `propias de ${i}` } } as any)
      .returning();
    creados.push(a);
  }
  return { t, agentes: creados };
}

function meta(v: any) {
  return typeof v === "string" ? JSON.parse(v) : v || {};
}

describe("motor v2", () => {
  test("el prompt libre llega a las INDICACIONES que lee el vendedor, no a agentPrompt", async () => {
    const { t } = await negocio("v2");
    const r = await configurarAgente(t.id, { prompt: "Tuteá siempre y nunca prometas envío el mismo día." });

    expect(r.ok).toBe(true);
    expect(r.motor).toBe("v2");
    expect(r.anterior.prompt).toBe("propias de 0");

    const voz = await cargarVozDelNegocio(t.id);
    expect(voz.instruccionesExtra).toMatch(/nunca prometas envío el mismo día/);

    const [fila] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(fila.agentPrompt ?? null).toBeNull();
  });

  test("lo que el v2 no lee NO se guarda y se dice por qué", async () => {
    const { t } = await negocio("v2");
    const r = await configurarAgente(t.id, {
      tono: "cercano, frases cortas",
      agentPersonality: "casual",
      estiloDeVenta: { calificacion: "nunca" },
    });

    expect(r.ok).toBe(true);
    expect(r.aplicados.map((a) => a.campo)).toEqual(["tono"]);
    expect(r.ignorados.map((i) => i.campo).sort()).toEqual(["agentPersonality", "estiloDeVenta"]);
    expect(r.summary).toMatch(/NO aplicado/);

    const [fila] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(meta(fila.metadata).businessProfile.estiloDeVenta).toBeUndefined();
    // Y el tono sí se ve de inmediato: la caché se vació al guardar.
    expect((await getBusinessContext(t.id)).tono).toBe("cercano, frases cortas");
  });

  test("si solo mandó lo que no se lee, no se cambia nada ni se dice que quedó activo", async () => {
    const { t } = await negocio("v2");
    const r = await configurarAgente(t.id, { agentPersonality: "enthusiastic" });
    expect(r.ok).toBe(false);
    expect(r.summary).not.toMatch(/activo|Aplicado/);
  });

  test("con varios agentes avisa que los demás conservan sus indicaciones", async () => {
    const { t, agentes } = await negocio("v2", 2);
    const r = await configurarAgente(t.id, { prompt: "nueva regla" });
    expect(r.summary).toMatch(/Max/);
    const [max] = await db.select().from(agents).where(eq(agents.id, agentes[1].id));
    expect(meta(max.metadata).indicaciones).toBe("propias de 1");
  });

  test("con agentId escribe en ESE agente, y uno de otro negocio no se toca", async () => {
    const { t, agentes } = await negocio("v2", 2);
    const r = await configurarAgente(t.id, { prompt: "solo para Max", agentId: agentes[1].id });
    expect(r.ok).toBe(true);
    const [max] = await db.select().from(agents).where(eq(agents.id, agentes[1].id));
    expect(meta(max.metadata).indicaciones).toBe("solo para Max");

    const otro = await negocio("v2");
    const ajeno = await configurarAgente(otro.t.id, { prompt: "intruso", agentId: agentes[0].id });
    expect(ajeno.ok).toBe(false);
  });
});

describe("motor v1", () => {
  test("el prompt libre sigue yendo a agentPrompt y el estilo se guarda", async () => {
    const { t, agentes } = await negocio("v1");
    const r = await configurarAgente(t.id, { prompt: "regla v1", estiloDeVenta: { calificacion: "nunca" } });

    expect(r.ok).toBe(true);
    const [fila] = await db.select().from(tenants).where(eq(tenants.id, t.id));
    expect(fila.agentPrompt).toBe("regla v1");
    expect(meta(fila.metadata).businessProfile.estiloDeVenta.calificacion).toBe("nunca");
    const [a] = await db.select().from(agents).where(eq(agents.id, agentes[0].id));
    expect(meta(a.metadata).indicaciones).toBe("propias de 0");
  });
});
