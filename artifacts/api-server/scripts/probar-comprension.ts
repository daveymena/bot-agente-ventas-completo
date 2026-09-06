/**
 * ¿La comprensión contextual manda de verdad, o la vuelve a pisar una capa?
 *
 * Corre `runAgentReply` entero contra la sqlite local. NO toca WhatsApp: no
 * hay `waInstance` en este camino, así que nadie recibe nada.
 *
 * Lo que mide es el ENRUTADO, que es lo que se cambió: si "y cuánto vale?"
 * conserva el producto, y si "¿a cuánto te hago la transferencia?" llega al
 * cierre en vez de caer en consulta de precio. El acabado de la prosa NO se
 * mide acá: local corre con el modelo gratis, no con el DeepSeek de producción.
 */
import { ensureDbReady, tenants, agents, products, conversations, messages, leads } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const SLUG = "prueba-comprension";
const creado: { tenant?: number; convo?: number; lead?: number; prods: number[] } = { prods: [] };

async function limpiar() {
  if (creado.convo) {
    await db.delete(messages).where(eq(messages.conversationId, creado.convo));
    await db.delete(conversations).where(eq(conversations.id, creado.convo));
  }
  if (creado.lead) await db.delete(leads).where(eq(leads.id, creado.lead));
  for (const p of creado.prods) await db.delete(products).where(eq(products.id, p));
  if (creado.tenant) {
    await db.delete(agents).where(eq(agents.tenantId, creado.tenant));
    await db.delete(tenants).where(eq(tenants.id, creado.tenant));
  }
  console.log("\n🧹 limpiado todo lo sembrado");
}

process.on("uncaughtException", async (e) => { console.log("💥", e?.message); await limpiar(); process.exit(1); });

// ── sembrar ────────────────────────────────────────────────────────────────
const [t] = await db.insert(tenants).values({
  name: "Prueba Comprension", email: `${SLUG}@local.test`, slug: SLUG,
  brandName: "TecnoPrueba", agentName: "Sofía", plan: "pro", status: "active",
} as any).returning();
creado.tenant = (t as any).id;

await db.insert(agents).values({
  tenantId: creado.tenant, name: "Sofía", role: "vendedor", tone: "cercano",
  model: "gpt-4o-mini", systemPrompt: "Sos Sofía, vendedora de TecnoPrueba. Vendés cursos digitales.",
  stages: [], isActive: true,
} as any);

for (const p of [
  { name: "Curso de Piano desde Cero", price: 89000, desc: "Curso completo de piano para principiantes, 40 clases en video." },
  { name: "Curso de Mantenimiento de PC", price: 65000, desc: "Reparación y mantenimiento de computadores, 30 clases." },
  { name: "Curso de Excel Avanzado", price: 45000, desc: "Tablas dinámicas, macros y automatización." },
]) {
  const [r] = await db.insert(products).values({
    tenantId: creado.tenant, name: p.name, description: p.desc, price: p.price,
    currency: "COP", kind: "digital", isActive: true,
    paymentLink: "https://pago.local.test/checkout", features: ["Acceso de por vida", "Certificado"],
  } as any).returning();
  creado.prods.push((r as any).id);
}

const telefono = "573009998877";
const [lead] = await db.insert(leads).values({
  tenantId: creado.tenant, name: "Cliente Prueba", phone: telefono, source: "whatsapp", status: "new",
} as any).returning();
creado.lead = (lead as any).id;
const [convo] = await db.insert(conversations).values({
  tenantId: creado.tenant, leadId: creado.lead, channel: "whatsapp", contactName: "Cliente Prueba",
  contactPhone: telefono, currentStage: "greeting", status: "active",
} as any).returning();
creado.convo = (convo as any).id;

console.log(`sembrado: tenant ${creado.tenant}, ${creado.prods.length} productos (${creado.prods.join(",")}), convo ${creado.convo}\n`);

// ── el guion ───────────────────────────────────────────────────────────────
const GUION = [
  "hola",
  "me interesa el curso de piano",
  "y cuánto vale?",                        // debe conservar el producto y dar precio
  "¿a cuánto te hago la transferencia?",   // debe ir al CIERRE, no a consulta de precio
  "te estoy preguntando por el precio",    // reformulación: no debe repetir el atajo
];

for (const texto of GUION) {
  await db.insert(messages).values({
    conversationId: creado.convo, role: "customer", content: texto, stage: "greeting", metadata: {},
  } as any);
  console.log("\n" + "═".repeat(70));
  console.log(`👤 ${texto}`);
  const t0 = Date.now();
  try {
    const r: any = await runAgentReply(creado.convo);
    console.log(`🤖 [${Date.now() - t0}ms] ${String(r?.content ?? "").trim() || "(VACÍO)"}`);
  } catch (e: any) {
    console.log(`💥 ${e?.message || e}`);
  }
}

await limpiar();
process.exit(0);
