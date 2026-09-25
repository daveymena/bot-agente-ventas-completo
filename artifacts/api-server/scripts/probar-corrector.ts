import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq, like } from "drizzle-orm";

process.env.MOTOR_VENDEDOR = "v2"; // FORCE V2

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const TENANT = 1;

const prods = await db.select()
  .from(products)
  .where(like(products.name, "%Corrector%"));

console.log("Productos encontrados:", prods.map(p => ({id: p.id, name: p.name, opciones: p.opciones})));

let prodName = "Corrector de Postura";
if (prods.length > 0) prodName = prods[0].name;

const GUION = [
  `hola, me interesa el ${prodName}`,
  "tienen colores o tallas?",
  "quiero el L en color negro",
  "cómo pago?",
];

const telefono = "573005556666";
const [lead] = await db.insert(leads).values({
  tenantId: TENANT, name: "Test Postura", phone: telefono, source: "whatsapp", status: "new",
} as any).returning();

const [convo] = await db.insert(conversations).values({
  tenantId: TENANT, leadId: lead!.id, channel: "whatsapp", contactName: "Test Postura",
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
    console.log(`🤖 Respuesta cruda:`, JSON.stringify(r, null, 2));
  } catch (e: any) {
    console.log(`💥 Error: ${e?.message || e}`);
  }
}

await db.delete(messages).where(eq(messages.conversationId, convo!.id));
await db.delete(conversations).where(eq(conversations.id, convo!.id));
await db.delete(leads).where(eq(leads.id, lead!.id));

process.exit(0);
