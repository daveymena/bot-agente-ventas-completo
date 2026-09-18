/**
 * El mismo guion que el dueño le corrió al agente de Meta (16-09-2026),
 * pasado por NUESTRO vendedor, y mostrando lo que el cliente RECIBIRÍA:
 * texto del modelo + la ficha ya renderizada (no solo "card 123").
 *
 * Sirve para comparar lado a lado y no discutir de memoria.
 */
import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");
const { construirSeccion } = await import("../src/lib/whatsapp");
const { unirTextosSeguidos, unirElRestoDeLaFicha } = await import("../src/lib/una-sola-burbuja");
const { PaymentGateway } = await import("../src/lib/payments");
const { tenantManager } = await import("../src/lib/tenantManager");
const { presentarParaWhatsApp } = await import("../src/lib/presentacion");

const TENANT = 1;
const GUION = process.argv.slice(2).length ? process.argv.slice(2) : [
  "Hola me interesa el cirso de piano",
  "Si",
  "Si",
  "Como lo recibo",
  "Que garantía tengo ?",
  "Ti pero que contiene cuantas clases horas todo eso ?",
  "Por nequi",
];

async function limpiar(convoIds: number[], leadIds: number[]) {
  for (const id of convoIds) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  for (const id of leadIds) await db.delete(leads).where(eq(leads.id, id));
}

const telefono = "573001111333";
const [lead] = await db.insert(leads).values({
  tenantId: TENANT, name: "Cliente Meta", phone: telefono, source: "whatsapp", status: "new",
} as any).returning();
const [convo] = await db.insert(conversations).values({
  tenantId: TENANT, leadId: lead!.id, channel: "whatsapp", contactName: "Cliente Meta",
  contactPhone: telefono, currentStage: "greeting", status: "active",
} as any).returning();

const tenant = (await tenantManager.getTenantById(TENANT)) || tenantManager.getDefaultTenant();
const pg = new PaymentGateway(tenant as any);

const logOriginal = console.log;
for (const [i, texto] of GUION.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, Number(process.env.PAUSA_MS || 25000)));
  await db.insert(messages).values({
    conversationId: convo!.id, role: "customer", content: texto, stage: "greeting", metadata: {},
  } as any);
  const log: string[] = [];
  console.log = (...a: any[]) => { try { log.push(a.map((x) => String(x)).join(" ")); } catch {} };
  let r: any = null;
  try { r = await runAgentReply(convo!.id); } catch (e: any) { log.push(`💥 ${e?.message}`); }
  console.log = logOriginal;
  if (process.env.VER_RAW) console.log("   ↩", JSON.stringify(r)?.slice(0, 600));
  if (process.env.VER_LOG) for (const l of log) console.log("   │ " + l.slice(0, 300));
  if (!r?.parts?.length) for (const l of log.filter((x) => /error|💥|❌/i.test(x))) console.log("   ‼ " + l.slice(0, 400));

  console.log(`\n${"═".repeat(70)}\n👤 ${texto}`);
  const crudo = log.find((l) => l.includes("[AI-CRUDO]"))?.replace(/^.*\[AI-CRUDO\] /, "");
  if (crudo) console.log(`   (modelo crudo: ${crudo.slice(0, 200)})`);
  const parts = unirTextosSeguidos((r?.parts || []) as any) as any[];
  for (const part of parts) {
    if (part.kind === "text") {
      console.log(`\n🤖 ${presentarParaWhatsApp(String(part.content || ""))}`);
      continue;
    }
    const [product] = await db.select().from(products).where(eq(products.id, part.productId));
    if (!product) { console.log(`\n🤖 [card ${part.productId} NO EXISTE]`); continue; }
    const links = await pg.getAllLinks(product, { phone: telefono, name: "Cliente Meta" }).catch(() => ({ transfer: { options: [] } }));
    const seccion = part.seccion ?? "completa";
    const { conFoto, mensajes } = await construirSeccion(
      product as any, seccion, links, telefono,
      !!part.yaVioContenido, !!part.sesionNueva, !!part.videoYaEnviado,
      String(part.mensajeDelCliente || ""), !!part.yaSabeElPrecio,
    );
    const juntos = unirElRestoDeLaFicha(mensajes);
    console.log(`\n🤖 [ficha "${seccion}"${conFoto ? " + FOTO" : ""}]`);
    for (const m of juntos) console.log(`${presentarParaWhatsApp(m)}\n   ──`);
  }
}
await limpiar([convo!.id], [lead!.id]);
process.exit(0);
