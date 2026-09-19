/**
 * ¿Sabe profundizar, o solo despacha la ficha?
 *
 * Pedido del dueño (19-09-2026): cuando el cliente ya recibió TODO lo que
 * sabemos del producto y vuelve a preguntar por un punto concreto, la IA
 * tiene que desglosarlo explicado como una persona, no repetir la ficha ni
 * quedarse en una frase. Este guion reproduce exactamente eso y muestra, por
 * turno, qué partes salieron (texto / ficha / sección) y el texto crudo del
 * modelo cuando el servidor lo pisó.
 *
 *   pnpm --filter api-server exec tsx scripts/probar-desglose.ts [idProducto]
 */
import { ensureDbReady, conversations, messages, leads, products } from "@workspace/db";
import { eq } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const TENANT = 1;
const idPedido = Number(process.argv[2]) || 0;

const prods = await db.select().from(products).where(eq(products.tenantId, TENANT));
const prod: any = (idPedido ? prods.find((p: any) => p.id === idPedido) : null)
  || prods.find((p: any) => p.isActive && (p.description || "").length > 300)
  || prods[0];
if (!prod) { console.log("sin productos"); process.exit(1); }
console.log(`producto: [${prod.id}] ${prod.name} (${prod.kind}) — desc ${String(prod.description || "").length} chars, ${(prod.features || []).length} features\n`);
console.log(`DESCRIPCIÓN QUE CONOCE EL BOT:\n${String(prod.description || "").slice(0, 900)}\n`);

const GUION = [
  `hola, quiero info de ${prod.name}`,
  "sí, mándame toda la info",
  "ok ya vi todo. pero explícame mejor cómo funciona eso en la práctica, paso a paso",
  "y de lo que dice de la garantía, cuéntame más, cómo es exactamente",
  "no entendí lo de la entrega, explícamelo como si tuviera 10 años",
];

async function limpiar(convoIds: number[], leadIds: number[]) {
  for (const id of convoIds) {
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }
  for (const id of leadIds) await db.delete(leads).where(eq(leads.id, id));
}

const telefono = "573009998877";
const [lead] = await db.insert(leads).values({
  tenantId: TENANT, name: "Cliente Desglose", phone: telefono, source: "whatsapp", status: "new",
} as any).returning();
const [convo] = await db.insert(conversations).values({
  tenantId: TENANT, leadId: lead!.id, channel: "whatsapp", contactName: "Cliente Desglose",
  contactPhone: telefono, currentStage: "greeting", status: "active",
} as any).returning();

const logOriginal = console.log;
// Groq gratuito: 8.000 tokens/min y un turno consume ~5.000 → uno por minuto.
const PAUSA_MS = Number(process.env.PAUSA_MS || 65000);
let primero = true;
for (const texto of GUION.slice(0, Number(process.env.TURNOS || 99))) {
  if (!primero) await new Promise((r) => setTimeout(r, PAUSA_MS));
  primero = false;
  await db.insert(messages).values({
    conversationId: convo!.id, role: "customer", content: texto, stage: "greeting", metadata: {},
  } as any);
  logOriginal(`\n${"─".repeat(70)}\n👤 ${texto}`);
  const crudo: string[] = [];
  console.log = (...a: any[]) => {
    const t = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
    if (/\[AI-CRUDO\]|\[DESBORDE\]|\[SERVIDOR\]|\[FICHA\]|\[DECISION\]|\[DESGLOSE\]/.test(t)) crudo.push(t.slice(0, 500));
  };
  try {
    const r: any = await runAgentReply(convo!.id);
    console.log = logOriginal;
    for (const p of r?.parts || []) {
      if (p.kind === "card") logOriginal(`🤖 [FICHA producto ${p.productId} · sección ${p.seccion ?? "-"}]`);
      else logOriginal(`🤖 ${String(p.content || "").trim()}`);
    }
    if (!r?.parts?.length) logOriginal(`🤖 ${String(r?.content || "").trim() || "(VACÍO)"}`);
    for (const l of crudo) logOriginal(`   · ${l}`);
  } catch (e: any) {
    console.log = logOriginal;
    logOriginal(`💥 ${e?.message || e}`);
  }
}
await limpiar([convo!.id], [lead!.id]);
process.exit(0);
