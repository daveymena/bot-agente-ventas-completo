/**
 * LAS HERRAMIENTAS DE ATLAS PARA EL VENDEDOR
 * ==========================================
 *
 * Pedido del dueño: "que Atlas diagnostique y repare al vendedor". Acá se
 * prueba el cableado completo, no la función suelta: que las herramientas
 * existan para Atlas, que las de lectura se puedan llamar sin permiso (si
 * hubiera que aprobar un diagnóstico, nadie diagnosticaría) y que las de
 * escritura pasen por la aprobación del admin.
 */

import { test, describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenants, conversations, messages } from "@workspace/db";

const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
};

import { executeAction, isReadOnlyTool, isDestructiveTool } from "../app-operator";
import { motorDelTenant } from "../motor-nuevo/activacion";

async function negocio() {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db
    .insert(tenants)
    .values({ name: "Atlas Repara", email: `repara-${sufijo}@test.local`, slug: `repara-${sufijo}`, brandName: "Atlas Repara" } as any)
    .returning();
  return t;
}

const ctxDe = (tenantId: number) => ({ tenantId, sessionId: "test", role: "admin" } as any);

describe("las herramientas están registradas con el permiso correcto", () => {
  test("diagnosticar y ver el motor se pueden llamar sin permiso", () => {
    assert.equal(isReadOnlyTool("vendedor_diagnosticar"), true);
    assert.equal(isReadOnlyTool("vendedor_motor_ver"), true);
    assert.equal(isReadOnlyTool("vendedor_probar"), true);
  });

  test("cambiar el motor y borrar la memoria piden aprobación", () => {
    assert.equal(isReadOnlyTool("vendedor_motor"), false);
    assert.equal(isReadOnlyTool("vendedor_olvidar"), false);
    // Y la del motor, además, con confirmación reforzada.
    assert.equal(isDestructiveTool("vendedor_motor"), true);
  });
});

describe("Atlas ejecuta el diagnóstico", () => {
  test("encuentra el problema y lo explica en palabras del negocio", async () => {
    const t = await negocio();
    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: t.id,
        contactName: "Cliente",
        contactPhone: `573004${Math.floor(Math.random() * 1e6)}`,
        status: "ai",
        lastMessageAt: new Date().toISOString(),
      } as any)
      .returning();

    await db.insert(messages).values([
      { conversationId: convo.id, role: "customer", content: "hola" } as any,
      { conversationId: convo.id, role: "agent", content: "¿Qué te gustaría saber puntualmente?" } as any,
      { conversationId: convo.id, role: "customer", content: "quiero el curso de piano" } as any,
      { conversationId: convo.id, role: "agent", content: "¿Qué te gustaría saber puntualmente?" } as any,
    ] as any);

    const r = await executeAction("vendedor_diagnosticar", { limite: 5, dias: 7 }, ctxDe(t.id));

    assert.equal(r.ok, true);
    assert.match(r.summary, /Revisé/);
    assert.ok((r.data as any).revisadas >= 1);
  });

  test("ver el motor dice en cuál está y de dónde salió la decisión", async () => {
    const t = await negocio();
    const r = await executeAction("vendedor_motor_ver", {}, ctxDe(t.id));
    assert.equal(r.ok, true);
    assert.match(r.summary, /motor v1|motor v2/);
    assert.match(r.summary, /Valor por defecto de la plataforma/);
  });
});

describe("Atlas repara", () => {
  test("puede prender y apagar el motor nuevo para un negocio", async () => {
    const t = await negocio();
    assert.equal(await motorDelTenant(t.id), "v1");

    // La herramienta cambia el motor; acá se prueba la función que la
    // herramienta llama, porque el cambio pasa por la aprobación del admin
    // (y por el plan de control, que en modo local no está disponible).
    const { fijarMotorDelTenant } = await import("../motor-nuevo/activacion");
    assert.equal((await fijarMotorDelTenant(t.id, "v2")).motor, "v2");
    assert.equal(await motorDelTenant(t.id), "v2");

    assert.equal((await fijarMotorDelTenant(t.id, "v1")).motor, "v1");
    assert.equal(await motorDelTenant(t.id), "v1", "volver atrás es inmediato");
  });

  test("un valor inválido no cambia nada", async () => {
    const t = await negocio();
    const { fijarMotorDelTenant } = await import("../motor-nuevo/activacion");
    // @ts-expect-error se prueba el valor que el modelo podría mandar
    const r = await fijarMotorDelTenant(t.id, "v3");
    assert.equal(r.ok, false);
    assert.match(String(r.motivo), /v1 o v2/);
    assert.equal(await motorDelTenant(t.id), "v1", "no se aplicó");
  });

  test("borra la memoria de una conversación trabada", async () => {
    const t = await negocio();
    const { olvidarMemoria } = await import("../motor-nuevo/activacion");

    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: t.id,
        contactName: "Trabado",
        contactPhone: `573005${Math.floor(Math.random() * 1e6)}`,
        status: "ai",
        estadoAgente: JSON.stringify({ conversationId: 0, productoEnFoco: 5, turnos: 9 }) as any,
      } as any)
      .returning();

    assert.equal((await olvidarMemoria(t.id, convo.id)).ok, true);

    const [fila] = await db.select().from(conversations).where(eq(conversations.id, convo.id)).limit(1);
    assert.ok(!(fila as any).estadoAgente, "la memoria quedó limpia");
  });

  test("no puede tocar la conversación de OTRO negocio", async () => {
    const a = await negocio();
    const b = await negocio();
    const { olvidarMemoria } = await import("../motor-nuevo/activacion");

    const [convoB] = await db
      .insert(conversations)
      .values({ tenantId: b.id, contactName: "Ajeno", contactPhone: `573006${Math.floor(Math.random() * 1e6)}`, status: "ai" } as any)
      .returning();

    const cruzado = await olvidarMemoria(a.id, convoB.id);
    assert.equal(cruzado.ok, false);
    assert.match(String(cruzado.motivo), /otro negocio/);

    // Y el dueño sí puede.
    assert.equal((await olvidarMemoria(b.id, convoB.id)).ok, true);
    assert.equal((await olvidarMemoria(b.id, 0)).ok, false, "un id inválido no pasa");
  });

  test("las mutaciones NO se aplican en silencio sin auditoría disponible", async () => {
    // En modo local no hay plan de control (es Postgres), así que una llamada
    // de cambio tiene que fracasar con un mensaje claro y sin tocar la base.
    // Es la garantía de que "Atlas propuso" nunca se convierte en "Atlas
    // ejecutó" por un camino lateral.
    const t = await negocio();
    const r = await executeAction("vendedor_motor", { motor: "v2" }, ctxDe(t.id));
    assert.equal(r.ok, false);
    assert.equal(await motorDelTenant(t.id), "v1", "no cambió nada");
  });
});
