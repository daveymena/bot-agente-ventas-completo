import { db, conversations, messages, leads } from "@workspace/db";
import { runAgentReply } from "./lib/agent";
import { eq } from "drizzle-orm";

const STEP = "━".repeat(70);

async function testConversation() {
  const phone = "test-flow-" + Date.now();

  // 1. Crear lead
  const [lead] = await db.insert(leads).values({
    tenantId: 1,
    name: "TestUser",
    phone,
    stage: "new",
    value: "0",
    source: "whatsapp",
  }).returning();

  // 2. Crear conversación
  const [convo] = await db.insert(conversations).values({
    tenantId: 1,
    contactName: "TestUser",
    contactPhone: phone,
    status: "ai",
    currentStage: "greeting",
    leadId: lead?.id,
  }).returning();

  console.log(`🧪 Conversación #${convo.id} | Lead #${lead?.id}`);
  console.log(STEP);

  const chat = [
    "Hola, buenas tardes",
    "Me interesa el megapack de piano",
    "¿Cómo funciona y qué incluye?",
    "¿Aceptan Nequi?",
    "¿Y también tienes curso de guitarra? Me interesa",
    "Mmm, ¿qué garantía tiene?",
    "Está muy caro el piano, $60,000 es mucho",
    "Sí, dale, quiero comprar el piano",
  ];

  for (const text of chat) {
    console.log(`\n👤 Cliente: ${text}`);

    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: text,
      stage: convo.currentStage as string,
    });

    try {
      const reply = await runAgentReply(convo.id);
      if (reply) {
        for (const part of reply.parts) {
          if (part.kind === "card") {
            const flag = (part as any).paymentOnly ? " (solo enlaces de pago)" : "";
            console.log(`🤖 Bot → 🃏 [CARD: ${part.productId}]${flag}`);
          } else {
            const content = ((part as any).content || "").trim();
            if (content) {
              const lines = content.split("\n").filter(Boolean);
              for (const line of lines) {
                console.log(`🤖 Bot: ${line.substring(0, 120)}`);
              }
            }
          }
        }
        console.log(`📊 Stage: ${reply.stage} | Partes: ${reply.parts.length}`);
      } else {
        console.log(`⚠️  No hubo respuesta`);
      }
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
    }

    console.log(STEP);
  }

  // Limpiar
  try {
    await db.delete(messages).where(eq(messages.conversationId, convo.id));
    await db.delete(conversations).where(eq(conversations.id, convo.id));
    if (lead) await db.delete(leads).where(eq(leads.id, lead.id));
    console.log(`🧹 Datos de prueba eliminados`);
  } catch {}
}

testConversation().catch(console.error);
