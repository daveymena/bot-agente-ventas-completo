/**
 * ¿El bot vende como un profesional, o solo despacha fichas?
 *
 * Le pasa las objeciones que de verdad matan una venta por WhatsApp y muestra
 * qué contesta. No mide "si responde" (eso ya lo prueba probar-ia-whatsapp.ts):
 * mide si ARGUMENTA.
 */
import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const TENANT = 1;

// Una conversación entera, como pasa en la vida real: interés → precio →
// duda → comparación → largas → cierre.
const GUION = [
  "Hola me interesa el curso de piano",
  "cuanto vale el curso de Excel?",
  "si me llevo piano, contabilidad e idiomas juntos cuanto seria en total?",
  "me interesa el Renovador Negro Perfecto, como me llega?",
  "ya te pague, mandame el acceso ya",
];


// Limpieza: estos scripts siembran en la MISMA base sqlite que usan las
// pruebas. Sin borrar lo sembrado, `flujo-completo-venta.test.ts` empieza a
// fallar por filas que dejó un diagnóstico, y se pierde media hora buscando
// una regresión que no existe.
async function limpiar(convoIds: number[], leadIds: number[]) {
  for (const id of convoIds) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  for (const id of leadIds) await db.delete(leads).where(eq(leads.id, id));
  console.log(`
🧹 limpiado: ${convoIds.length} conversación(es) de prueba`);
}

const prods = await db.select({ id: products.id, name: products.name })
  .from(products).where(eq(products.tenantId, TENANT)).limit(3);
console.log(`catálogo: ${prods.length} productos (ej: ${(prods[0] as any)?.name})\n`);

const telefono = "573001111299";
const [lead] = await db.insert(leads).values({
  tenantId: TENANT, name: "Cliente Objeciones", phone: telefono, source: "whatsapp", status: "new",
} as any).returning();
const [convo] = await db.insert(conversations).values({
  tenantId: TENANT, leadId: lead!.id, channel: "whatsapp", contactName: "Cliente Objeciones",
  contactPhone: telefono, currentStage: "greeting", status: "active",
} as any).returning();

for (const texto of GUION) {
  await db.insert(messages).values({
    conversationId: convo!.id, role: "customer", content: texto, stage: "greeting", metadata: {},
  } as any);

  console.log(`\n${"─".repeat(66)}`);
  console.log(`👤 ${texto}`);
  try {
    const r: any = await runAgentReply(convo!.id);
    console.log("PARTS", JSON.stringify((r?.parts||[]).map((p: any) => p.kind === "card" ? { card: p.productId, seccion: p.seccion } : { text: String(p.content||"").slice(0, 400) })));
    const t = r?.reply ?? r?.text ?? r?.content ?? "";
    console.log(`🤖 ${String(t).trim() || "(VACÍO)"}`);
  } catch (e: any) {
    console.log(`💥 ${e?.message || e}`);
  }
}
await limpiar([convo!.id], [lead!.id]);
process.exit(0);
