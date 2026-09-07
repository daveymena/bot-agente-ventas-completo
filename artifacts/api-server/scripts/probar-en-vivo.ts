/**
 * Qué recibiría el cliente DE VERDAD, sin tocar WhatsApp.
 *
 * `probar-comprension.ts` corre el agente pero imprime lo que devuelve
 * `runAgentReply`, que es el texto CRUDO. El cliente nunca ve eso: entre medio
 * está `prepararSalidaFinal` (en whatsapp-factory), que saca placeholders,
 * promesas que el envío no cumple y burbujas vacías.
 *
 * O sea que una prueba podía verse mal estando bien --o al revés-- porque
 * miraba el paso equivocado. Este script aplica el MISMO gate que el envío
 * real y muestra las dos versiones, para poder distinguir si un problema es
 * del modelo o del filtro.
 *
 * Corre contra la sqlite local y siembra su propio negocio. No hay
 * `waInstance` en este camino: nadie recibe nada.
 *
 * Uso:
 *   DEEPSEEK_API_KEY=... USE_SQLITE=true npx tsx scripts/probar-en-vivo.ts
 */
import { ensureDbReady, tenants, agents, products, conversations, messages, leads } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");
const { prepararSalidaFinal } = await import("../src/lib/salida-segura-whatsapp");

const SLUG = "prueba-en-vivo";
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
}
process.on("uncaughtException", async (e: any) => { console.log("💥", e?.message); await limpiar(); process.exit(1); });

const [t] = await db.insert(tenants).values({
  name: "Prueba En Vivo", email: `${SLUG}@local.test`, slug: SLUG,
  brandName: "TecnoPrueba", agentName: "Sofía", plan: "pro", status: "active",
} as any).returning();
creado.tenant = (t as any).id;

await db.insert(agents).values({
  tenantId: creado.tenant, name: "Sofía", role: "vendedor", tone: "cercano",
  model: "gpt-4o-mini", systemPrompt: "Sos Sofía, vendedora de TecnoPrueba. Vendés cursos digitales.",
  stages: [], isActive: true,
} as any);

// La descripción imita a las reales: título, un renglón suelto y viñetas bajo
// un encabezado. Es la forma que destapó el bug del rótulo que se comía un
// beneficio.
const [p1] = await db.insert(products).values({
  tenantId: creado.tenant,
  name: "DISEÑO GRÁFICO",
  description: [
    "🎨 DISEÑO GRÁFICO",
    "",
    "Formación práctica para crear piezas profesionales desde cero.",
    "",
    "✨ Beneficios:",
    "🎨 Herramientas de diseño",
    "🎨 Proyectos prácticos",
    "🎨 Portafolio profesional",
  ].join("\n"),
  price: 60000, currency: "COP", kind: "digital", isActive: true,
  features: ["Clases en video HD", "De cero a avanzado", "Acceso de por vida"],
} as any).returning();
creado.prods.push((p1 as any).id);

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

/** Los mensajes que fallaron en producción, en el orden en que fallaron. */
const GUION = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "Hola",
      "Me interesa el curso de diseño grafico",
      "Si que vale ?",
      "quiero inscribirme",
    ];

console.log(`\nnegocio sembrado (tenant ${creado.tenant}, producto ${creado.prods[0]})\n`);

for (const texto of GUION) {
  await db.insert(messages).values({
    conversationId: creado.convo, role: "customer", content: texto, stage: "greeting", metadata: {},
  } as any);

  console.log("═".repeat(72));
  console.log(`👤 ${texto}`);
  const t0 = Date.now();
  try {
    const r: any = await runAgentReply(creado.convo);
    const ms = Date.now() - t0;
    const crudo = String(r?.content ?? "").trim();

    // Exactamente lo que hace whatsapp-factory antes de mandar.
    const partes = Array.isArray(r?.parts) && r.parts.length
      ? r.parts
      : [{ kind: "text", content: crudo }];
    const final = prepararSalidaFinal(partes as any);

    const loQueLlega = final.parts
      .map((p: any) => (p.kind === "card" ? `[ficha del producto ${p.productId}]` : String(p.content || "")))
      .filter(Boolean);

    console.log(`\n  🤖 CRUDO (${ms}ms):`);
    console.log("     " + (crudo || "(vacío)").replace(/\n/g, "\n     "));
    console.log(`\n  📱 LO QUE RECIBE EL CLIENTE:`);
    if (loQueLlega.length === 0) console.log("     ⚠️  NADA — el filtro se llevó todo");
    else for (const m of loQueLlega) console.log("     " + m.replace(/\n/g, "\n     "));
    if (final.removedClaims.length) {
      console.log(`\n  ✂️  quitado: ${final.removedClaims.map((c) => `"${c.slice(0, 60)}"`).join(", ")}`);
    }
    console.log("");
  } catch (e: any) {
    console.log(`  💥 ${e?.message || e}\n`);
  }
}

await limpiar();
console.log("🧹 limpiado\n");
process.exit(0);
