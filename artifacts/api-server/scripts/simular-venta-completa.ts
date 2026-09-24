/**
 * Una venta COMPLETA de un producto físico, con la IA real, contra la base
 * LOCAL (SQLite, nunca producción). Mide lo que el dueño pidió el 23-09-2026:
 * que el agente culmine la venta de principio a fin, y que al volver al otro
 * día con un "hola" no atosigue.
 *
 *   pnpm --filter @workspace/api-server exec tsx scripts/simular-venta-completa.ts [producto]
 */
import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq, and, like } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const TENANT = 1;
const BUSCAR = process.argv[2] || "corrector";

const [producto] = await db
  .select({ id: products.id, name: products.name, price: products.price, kind: products.kind })
  .from(products)
  .where(and(eq(products.tenantId, TENANT), like(products.name, `%${BUSCAR}%`)))
  .limit(1);
console.log(`producto: ${producto ? `${producto.name} · $${producto.price} · ${producto.kind}` : "(NO ESTÁ en la base local)"}\n`);

const GUION = [
  `hola, vi el anuncio del ${BUSCAR}`,
  "cuánto vale?",
  "y eso sí sirve para el dolor de espalda?",
  "listo, lo quiero",
  "Ana Pérez, cédula 1020304050, Bogotá, calle 45 # 12-30 apto 301, cel 3001234567",
  "cómo pago?",
  "ok, confirmo el pedido",
];

const telefono = `57300${Math.floor(Math.random() * 1e7)}`;
const [lead] = await db.insert(leads).values({ tenantId: TENANT, name: "Ana Simulación", phone: telefono, source: "whatsapp", status: "new" } as any).returning();
const [convo] = await db
  .insert(conversations)
  .values({ tenantId: TENANT, leadId: lead!.id, channel: "whatsapp", contactName: "Ana Simulación", contactPhone: telefono, currentStage: "greeting", status: "ai" } as any)
  .returning();

async function turno(texto: string, hace?: Date) {
  await db.insert(messages).values({ conversationId: convo!.id, role: "customer", content: texto, stage: "greeting", metadata: {}, ...(hace ? { createdAt: hace } : {}) } as any);
  console.log(`\n${"─".repeat(70)}\n👤 ${texto}`);
  const t0 = Date.now();
  try {
    const r: any = await runAgentReply(convo!.id);
    const partes: any[] = r?.parts || [];
    for (const p of partes) {
      if (p.kind === "text") console.log(`🤖 ${String(p.content).trim()}`);
      else console.log(`🧩 [${p.kind}${p.seccion ? `:${p.seccion}` : ""}${p.productId ? ` #${p.productId}` : ""}] ${String(p.content || p.caption || "").slice(0, 160).replace(/\n/g, " ⏎ ")}`);
    }
    if (!partes.length) console.log(`🤖 ${String(r?.content || "(VACÍO)").trim()}`);
    console.log(`   ⏱ ${((Date.now() - t0) / 1000).toFixed(1)}s · ${r?.aiProvider || "?"} · etapa ${r?.stage || "?"}`);
  } catch (e: any) {
    console.log(`💥 ${e?.message || e}`);
  }
}

for (const texto of GUION) await turno(texto);

// El cliente vuelve 30 horas después con un saludo. Se corre la marca de
// tiempo del estado hacia atrás, que es lo que el motor mira.
const [fila] = await db.select().from(conversations).where(eq(conversations.id, convo!.id)).limit(1);
const est = typeof (fila as any)?.estadoAgente === "string" ? JSON.parse((fila as any).estadoAgente) : (fila as any)?.estadoAgente;
if (est) {
  est.ultimoMensajeCliente = new Date(Date.now() - 30 * 3600_000).toISOString();
  await db.update(conversations).set({ estadoAgente: JSON.stringify(est) } as any).where(eq(conversations.id, convo!.id));
}
console.log(`\n${"═".repeat(70)}\n⏩ 30 horas después…`);
await turno("hola");

await db.delete(messages).where(eq(messages.conversationId, convo!.id));
await db.delete(conversations).where(eq(conversations.id, convo!.id));
await db.delete(leads).where(eq(leads.id, lead!.id));
console.log(`\n🧹 conversación de prueba borrada`);
process.exit(0);
