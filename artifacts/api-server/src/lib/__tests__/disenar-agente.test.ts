/**
 * CREAR UN AGENTE COMO LO HARÍA UN PROFESIONAL (25-09-2026)
 *
 * Antes: el modelo inventaba las indicaciones (con precios y plazos), el
 * agente nacía ACTIVO atendiendo clientes reales sin una prueba, y al agente
 * que ya existía le sacaba productos sin que nadie se enterara.
 */
import { describe, test, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenants, agents, products } from "@workspace/db";
import { validarIndicaciones, disenarAgente, probarAgente } from "../disenar-agente";
import { clienteFalso } from "../motor-nuevo/cliente-llm";
import { TOOLS } from "../app-operator";

async function negocio(opts: { fisicos?: number; digitales?: number; agentes?: { name: string; especialidad: string }[] } = {}) {
  const s = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db
    .insert(tenants)
    .values({ name: "Dis", email: `dis-${s}@test.local`, slug: `dis-${s}`, brandName: "Dis", plan: "enterprise", metadata: { motorVendedor: "v2" } } as any)
    .returning();
  for (let i = 0; i < (opts.digitales ?? 0); i++) {
    await db.insert(products).values({ tenantId: t.id, name: `Curso de piano ${i}`, description: "x", price: "60000", currency: "COP", kind: "digital", isActive: true, features: [] } as any);
  }
  for (let i = 0; i < (opts.fisicos ?? 0); i++) {
    await db.insert(products).values({ tenantId: t.id, name: `Corrector de postura ${i}`, description: "x", price: "59900", currency: "COP", kind: "physical", isActive: true, features: [] } as any);
  }
  const creados: any[] = [];
  for (const a of opts.agentes ?? []) {
    const [row] = await db
      .insert(agents)
      .values({ tenantId: t.id, name: a.name, role: "asesora", tone: "cálido", systemPrompt: "x", especialidad: a.especialidad, isActive: true } as any)
      .returning();
    creados.push(row);
  }
  return { t, agentes: creados };
}

const herramienta = (n: string) => TOOLS.find((x) => x.name === n)!;

describe("las indicaciones son para CÓMO atiende, no para datos", () => {
  test("unas indicaciones de verdad pasan", () => {
    const r = validarIndicaciones("Hablale de vos a vos. Antes de recomendar, preguntá para quién es. Nunca presiones con urgencia falsa.");
    expect(r.ok).toBe(true);
  });

  test("un precio, un descuento o un plazo inventado se rechaza y dice dónde va", () => {
    expect(validarIndicaciones("El curso cuesta $60.000").errores.join()).toMatch(/precio.*update_product/);
    expect(validarIndicaciones("Ofrecé 20% de descuento si duda").errores.join()).toMatch(/porcentaje/);
    expect(validarIndicaciones("Decí que llega en 3 días hábiles").errores.join()).toMatch(/plazo.*agente_perfil_negocio/);
    expect(validarIndicaciones("Garantía de 30 días").ok).toBe(false);
  });

  test("el público no es un plazo: 'niños de 5 años' pasa", () => {
    expect(validarIndicaciones("Le vendés a papás con niños de 5 años").ok).toBe(true);
  });

  test("restos de la plantilla vieja y textos kilométricos se rechazan", () => {
    expect(validarIndicaciones("Mandá [CARD: 12] y el link de Google Drive").ok).toBe(false);
    expect(validarIndicaciones("a".repeat(1300)).ok).toBe(false);
  });
});

describe("diseñar con los datos reales", () => {
  test("avisa que el agente que ya estaba pierde los productos físicos", async () => {
    const { t } = await negocio({ digitales: 3, fisicos: 2, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const d = await disenarAgente(t.id, { especialidad: "dropshipping", name: "Max" });
    expect(d.bloqueos).toEqual([]);
    expect(d.catalogo.cuantos).toBe(2);
    expect(d.avisos.join(" ")).toMatch(/Sofía.*5 a 3 productos/);
    expect(d.pruebas[0]).toMatch(/corrector de postura/);
  });

  test("dropshipping sin un solo producto físico no se puede crear", async () => {
    const { t } = await negocio({ digitales: 2 });
    const d = await disenarAgente(t.id, { especialidad: "dropshipping", name: "Max" });
    expect(d.bloqueos.join()).toMatch(/FÍSICO/);
  });

  test("un nombre repetido no se puede crear", async () => {
    const { t } = await negocio({ digitales: 1, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const d = await disenarAgente(t.id, { especialidad: "digital", name: "sofía" });
    expect(d.bloqueos.join()).toMatch(/Ya existe/);
  });

  test("dice qué dato falta para vender completo, en vez de dejar que lo invente", async () => {
    const { t } = await negocio({ fisicos: 1 });
    const d = await disenarAgente(t.id, { especialidad: "dropshipping", name: "Max" });
    expect(d.faltan.length).toBeGreaterThan(0);
    expect(d.avisos.join(" ")).toMatch(/agente_perfil_negocio/);
  });

  test("la prueba de un agente digital pregunta por un producto digital, aunque vea todo", async () => {
    const { t } = await negocio({ fisicos: 1, digitales: 1 });
    const d = await disenarAgente(t.id, { especialidad: "digital", name: "Ana" });
    expect(d.pruebas[0]).toMatch(/curso de piano/);
  });
});

describe("agente_crear", () => {
  test("nace en BORRADOR: no atiende a nadie hasta probarlo", async () => {
    const { t } = await negocio({ digitales: 1, fisicos: 1, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const r = await herramienta("agente_crear").run({ name: "Max", especialidad: "dropshipping", indicaciones: "Confirmá la ciudad antes de cerrar." }, { tenantId: t.id } as any);
    expect(r.ok, r.summary).toBe(true);
    const [max] = await db.select().from(agents).where(eq(agents.id, (r.data as any).id));
    expect(max.isActive).toBe(false);
    expect(r.summary).toMatch(/BORRADOR.*agente_probar_borrador/s);
  });

  test("con un precio en las indicaciones no se crea", async () => {
    const { t } = await negocio({ fisicos: 1 });
    const r = await herramienta("agente_crear").run({ name: "Max", especialidad: "dropshipping", indicaciones: "El envío cuesta 10 mil pesos" }, { tenantId: t.id } as any);
    expect(r.ok).toBe(false);
    const filas = await db.select().from(agents).where(eq(agents.tenantId, t.id));
    expect(filas).toHaveLength(0);
  });

  test("update_agent aplica la misma regla a las indicaciones", async () => {
    const { t, agentes } = await negocio({ digitales: 1, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const r = await herramienta("update_agent").run({ agentId: agentes[0].id, indicaciones: "Ofrecé 15% si duda" }, { tenantId: t.id } as any);
    expect(r.ok).toBe(false);
  });
});

describe("probar el borrador", () => {
  test("se prueba con su voz y SUS productos aunque esté inactivo, sin escribirle a nadie", async () => {
    const { t } = await negocio({ digitales: 1, fisicos: 1, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const [max] = await db
      .insert(agents)
      .values({ tenantId: t.id, name: "Max", role: "especialista", tone: "directo", systemPrompt: "x", especialidad: "dropshipping", isActive: false, metadata: { indicaciones: "Confirmá la ciudad." } } as any)
      .returning();

    const llm = clienteFalso([{ content: "¡Hola! Soy Max, te cuento del corrector 😊" }]);
    const r = await probarAgente(t.id, max.id, llm, ["hola"]);

    expect(r.ok).toBe(true);
    expect(r.turnos[0].texto).toMatch(/Max/);
    const sistema = JSON.stringify(llm.llamadas[0].messages[0]);
    expect(sistema).toMatch(/Confirmá la ciudad/);
    expect(sistema).toMatch(/Corrector de postura/);
    expect(sistema).not.toMatch(/Curso de piano/);
    expect(r.resumen).toMatch(/BORRADOR/);
  });

  test("un agente de otro negocio no se prueba", async () => {
    const a = await negocio({ digitales: 1, agentes: [{ name: "Sofía", especialidad: "digital" }] });
    const b = await negocio({ digitales: 1 });
    const r = await probarAgente(b.t.id, a.agentes[0].id, clienteFalso([{ content: "x" }]));
    expect(r.ok).toBe(false);
  });
});

describe("el evaluador marca la pregunta repetida", () => {
  test("la misma pregunta en dos turnos es un hallazgo (visto con un borrador el 25-09)", async () => {
    const { evaluarChat } = await import("../evaluador-de-chats");
    const h = evaluarChat(
      [
        { mensaje: "¿cuánto cuesta?", texto: "¿Es para vos o para otra persona?", tarjetas: [] },
        { mensaje: "¿hacen envíos?", texto: "Lo confirmo. Mientras tanto, ¿es para vos o para otra persona?", tarjetas: [] },
      ],
      [],
    );
    expect(h.map((x) => x.regla)).toContain("pregunta-repetida");
  });
});
