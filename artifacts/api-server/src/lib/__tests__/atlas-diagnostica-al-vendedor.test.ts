/**
 * ATLAS DIAGNOSTICA AL VENDEDOR
 * =============================
 *
 * El pedido del dueño fue literal: "que Atlas diagnostique y repare al
 * vendedor". Hasta acá, saber si el bot vendía bien costaba leer chats a mano:
 * el 12 y 13-09 se corrigieron nueve causas y TODAS se descubrieron porque
 * alguien leyó una captura.
 *
 * Lo que se prueba acá es que ese diagnóstico ocurre SOLITO y sobre hechos:
 *   · reconstruye los turnos de una conversación real,
 *   · califica lo que el bot dijo contra el catálogo,
 *   · y devuelve el hallazgo con el número de conversación, qué significa y
 *     con qué se arregla.
 *
 * Nada de esto llama a un modelo ni le escribe a un cliente.
 */

import { test, describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db, tenants, products, conversations, messages } from "@workspace/db";

const assert = {
  equal: (a: any, b: any, m?: string) => expect(a, m).toBe(b),
  ok: (a: any, m?: string) => expect(!!a, m).toBe(true),
  match: (a: string, re: RegExp, m?: string) => expect(a, m).toMatch(re),
};

import { turnosDeMensajes, diagnosticarVendedor } from "../diagnostico-vendedor";

describe("reconstruir los turnos de una conversación", () => {
  const filas = [
    { role: "customer", content: "hola, tienen curso de piano?", metadata: {} },
    { role: "agent", content: "Sí, acá está la info", metadata: { cardSent: true, productId: 7, seccion: "completa" } },
    { role: "agent", content: "y el precio", metadata: {} },
    { role: "customer", content: "cuánto vale?", metadata: {} },
    { role: "agent", content: "Vale 60.000", metadata: {} },
  ];

  test("cada mensaje del cliente se empareja con TODO lo que contestó después", () => {
    const turnos = turnosDeMensajes(filas);
    assert.equal(turnos.length, 2);
    assert.equal(turnos[0].mensaje, "hola, tienen curso de piano?");
    assert.match(turnos[0].texto, /Sí, acá está la info/);
    assert.match(turnos[0].texto, /y el precio/);
  });

  test("las fichas salen del metadata del mensaje, no del texto", () => {
    const turnos = turnosDeMensajes(filas);
    assert.equal(turnos[0].tarjetas.length, 1);
    assert.equal(turnos[0].tarjetas[0].productId, 7);
    assert.equal(turnos[0].tarjetas[0].seccion, "completa");
    assert.equal(turnos[1].tarjetas.length, 0);
  });

  test("un mensaje del cliente sin respuesta no se pierde", () => {
    const turnos = turnosDeMensajes([{ role: "customer", content: "hola?", metadata: {} }]);
    assert.equal(turnos.length, 1);
    assert.equal(turnos[0].texto, "");
  });
});

describe("el diagnóstico sobre conversaciones reales", () => {
  async function sembrar() {
    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Diag", email: `diag-${sufijo}@test.local`, slug: `diag-${sufijo}`, brandName: "Diag" } as any)
      .returning();

    const [piano] = await db
      .insert(products)
      .values({
        tenantId: tenant.id,
        name: "Curso de piano",
        description: "Piano desde cero",
        price: "60000",
        currency: "COP",
        kind: "digital",
        isActive: true,
      } as any)
      .returning();

    return { tenant, piano };
  }

  test("encuentra al vendedor negando un producto que sí existe", async () => {
    const { tenant, piano } = await sembrar();

    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: tenant.id,
        contactName: "Cliente",
        contactPhone: `573001${Math.floor(Math.random() * 1e6)}`,
        status: "ai",
        lastMessageAt: new Date().toISOString(),
      } as any)
      .returning();

    await db.insert(messages).values([
      { conversationId: convo.id, role: "customer", content: "hola, tienen el curso de piano?" } as any,
      // El bot niega algo que está en el catálogo: es la venta que se pierde
      // sin que ningún log diga nada.
      { conversationId: convo.id, role: "agent", content: "No, ese curso no lo tenemos" } as any,
    ] as any);

    const d = await diagnosticarVendedor(tenant.id, { limite: 10, dias: 30 });

    assert.ok(d.revisadas >= 1);
    assert.equal(d.limpio, false);
    const reglas = d.hallazgos.map((h) => h.regla);
    assert.ok(reglas.includes("niega-lo-que-existe"), `reglas halladas: ${reglas.join(", ")}`);

    const niega = d.hallazgos.find((h) => h.regla === "niega-lo-que-existe")!;
    assert.ok(niega.conversaciones.includes(convo.id), "dice en qué conversación pasó");
    assert.match(niega.seArregla, /./);
    assert.match(d.resumen, /Revisé/);
    // Y le dice a Atlas con qué se arregla, no solo que está roto.
    assert.ok(niega.herramienta || niega.seArregla.length > 20);
    void piano;
  });

  test("una conversación sana no produce hallazgos", async () => {
    const { tenant } = await sembrar();

    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: tenant.id,
        contactName: "Cliente sano",
        contactPhone: `573002${Math.floor(Math.random() * 1e6)}`,
        status: "ai",
        lastMessageAt: new Date().toISOString(),
      } as any)
      .returning();

    await db.insert(messages).values([
      { conversationId: convo.id, role: "customer", content: "hola, buenas tardes" } as any,
      { conversationId: convo.id, role: "agent", content: "¡Hola! Contame qué andás buscando 😊" } as any,
    ] as any);

    const d = await diagnosticarVendedor(tenant.id, { limite: 10, dias: 30 });
    assert.equal(d.hallazgos.length, 0, d.resumen);
    assert.match(d.resumen, /no encontré problemas/);
  });

  test("diagnosticar no ensucia: no escribe ningún mensaje nuevo", async () => {
    const { tenant } = await sembrar();
    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: tenant.id,
        contactName: "Cliente",
        contactPhone: `573003${Math.floor(Math.random() * 1e6)}`,
        status: "ai",
        lastMessageAt: new Date().toISOString(),
      } as any)
      .returning();

    await db.insert(messages).values([
      { conversationId: convo.id, role: "customer", content: "hola" } as any,
      { conversationId: convo.id, role: "agent", content: "Hola, ¿qué buscás?" } as any,
    ] as any);

    const antes = await db.select().from(messages).where(eq(messages.conversationId, convo.id));
    await diagnosticarVendedor(tenant.id, { limite: 5, dias: 7 });
    const despues = await db.select().from(messages).where(eq(messages.conversationId, convo.id));

    assert.equal(despues.length, antes.length, "diagnosticar es de solo lectura");
  });
});
