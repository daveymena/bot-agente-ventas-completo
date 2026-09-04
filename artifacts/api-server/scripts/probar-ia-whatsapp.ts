/**
 * Prueba REAL del camino de respuesta de WhatsApp, sin WhatsApp.
 *
 * Siembra una conversación en la base local, mete un mensaje de cliente y
 * llama a `runAgentReply` — el mismo código que corre en producción cuando
 * entra un mensaje. Sirve para ver si el agente responde, si responde
 * cualquier cosa, o si revienta.
 *
 * Uso:  npx tsx scripts/probar-ia-whatsapp.ts
 */
import { ensureDbReady, conversations, messages, leads, tenants, products } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const { db } = await ensureDbReady();
const { runAgentReply } = await import("../src/lib/agent");

const TENANT = 1;

// Los casos que importan: el que llega de un anuncio (texto de Meta), el que
// arrastra otro producto, el que pregunta por entrega/garantía, y el que compra.
const CASOS: Array<{ nombre: string; mensajes: string[]; anuncio?: any }> = [
  {
    nombre: "Llega de un anuncio de PIANO (texto autocompletado por Meta)",
    mensajes: ["¡Hola! Quiero más información"],
    anuncio: {
      adTitle: "Curso de Piano Completo",
      adBody: "Aprende a tocar desde cero, sin leer partituras",
      adUrl: "https://ventasproia.com/p/311",
      adId: "ad_piano_test",
    },
  },
  {
    nombre: "Saludo pelado, sin anuncio",
    mensajes: ["hola"],
  },
  {
    nombre: "Pregunta por un producto concreto",
    mensajes: ["tienen curso de excel?"],
  },
  {
    nombre: "Pregunta por entrega y garantía",
    mensajes: ["hola", "cómo me lo entregan? tiene garantía?"],
  },
  {
    nombre: "Segundo mensaje después del anuncio (¿se acuerda del anuncio?)",
    mensajes: ["¡Hola! Quiero más información", "cuánto cuesta?"],
    anuncio: {
      adTitle: "Curso de Piano Completo",
      adBody: "Aprende a tocar desde cero",
      adUrl: "https://ventasproia.com/p/311",
      adId: "ad_piano_test",
    },
  },
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

const creados: { convos: number[]; leads: number[] } = { convos: [], leads: [] };

const catalogo = await db
  .select({ id: products.id, name: products.name })
  .from(products)
  .where(eq(products.tenantId, TENANT))
  .limit(10);
console.log(`\n📦 Catálogo del tenant ${TENANT}: ${catalogo.length} productos`);
catalogo.forEach((p: any) => console.log(`   #${p.id} ${p.name}`));

let fallos = 0;

for (const [i, caso] of CASOS.entries()) {
  const telefono = `57300000${String(i).padStart(4, "0")}`;
  console.log(`\n${"═".repeat(70)}\n▶ CASO ${i + 1}: ${caso.nombre}\n${"═".repeat(70)}`);

  // Conversación limpia por caso, para que no se contaminen entre sí.
  const [lead] = await db.insert(leads).values({
    tenantId: TENANT, name: `Prueba ${i + 1}`, phone: telefono, source: "whatsapp", status: "new",
  } as any).returning();

  const [convo] = await db.insert(conversations).values({
    tenantId: TENANT, leadId: lead!.id, channel: "whatsapp",
    contactName: `Prueba ${i + 1}`, contactPhone: telefono, currentStage: "greeting", status: "active",
  } as any).returning();

  creados.convos.push(convo!.id);
  creados.leads.push(lead!.id);

  for (const [j, texto] of caso.mensajes.entries()) {
    await db.insert(messages).values({
      conversationId: convo!.id,
      role: "customer",
      content: texto,
      stage: "greeting",
      // El anuncio viaja SOLO con el primer mensaje, igual que en WhatsApp real.
      metadata: j === 0 && caso.anuncio ? caso.anuncio : {},
    } as any);

    console.log(`\n👤 Cliente: ${texto}`);
    if (j === 0 && caso.anuncio) console.log(`   (llegó del anuncio: "${caso.anuncio.adTitle}")`);

    try {
      const t0 = Date.now();
      const r: any = await runAgentReply(convo!.id);
      const ms = Date.now() - t0;

      const texto2 = r?.reply ?? r?.text ?? r?.content ?? "";
      const partes = r?.parts?.length ?? 0;

      if (!texto2 || String(texto2).trim() === "") {
        console.log(`🤖 [${ms}ms] ⚠️ RESPUESTA VACÍA · keys=${Object.keys(r || {}).join(",")}`);
        fallos++;
      } else {
        console.log(`🤖 [${ms}ms] ${String(texto2).slice(0, 400)}`);
        if (partes) console.log(`   (${partes} partes, etapa: ${r?.stage})`);
        // ¿Respondió con un mensaje de error disfrazado?
        if (/error|no pude|intenta de nuevo|problema t[eé]cnico/i.test(String(texto2))) {
          console.log(`   ❌ La respuesta PARECE un mensaje de error`);
          fallos++;
        }
      }
    } catch (e: any) {
      console.log(`💥 EXCEPCIÓN: ${e?.message || e}`);
      console.log(String(e?.stack || "").split("\n").slice(1, 5).join("\n"));
      fallos++;
    }
  }

  // Qué quedó guardado del lado del agente
  const guardados = await db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, convo!.id))
    .orderBy(desc(messages.id))
    .limit(3);
  console.log(`   💾 últimos en BD: ${guardados.map((m: any) => `${m.role}:"${String(m.content).slice(0, 40)}"`).join(" | ")}`);
}

console.log(`\n${"═".repeat(70)}`);
console.log(fallos === 0 ? `✅ Los ${CASOS.length} casos respondieron` : `❌ ${fallos} fallo(s) detectado(s)`);
await limpiar(creados.convos, creados.leads);
process.exit(fallos === 0 ? 0 : 1);
