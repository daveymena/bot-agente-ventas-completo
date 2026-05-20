import { db, conversations, messages } from "@workspace/db";
import { runAgentReply } from "../artifacts/api-server/src/lib/agent";
import { eq, desc } from "drizzle-orm";

async function testConversation() {
  // 1. Crear conversación de prueba
  const [convo] = await db.insert(conversations).values({
    tenantId: 1,
    contactName: "TestUser",
    contactPhone: "test-flow-" + Date.now(),
    status: "ai",
    currentStage: "greeting",
  }).returning();

  console.log(`🧪 Conversación creada: ${convo.id}`);
  console.log("=".repeat(60));

  // Mensajes de la conversación
  const messages = [
    "Hola, buenas tardes",
    "Me interesa el megapack de piano",
    "¿Qué tal funciona y qué incluye?",
    "¿Aceptan Nequi?",
    "¿Y también tienes curso de guitarra? Me interesa",
    "Mmm, ¿qué garantía tiene?",
    "Está muy caro el piano, $60,000 es mucho",
    "Sí, dale, quiero comprar el piano",
  ];

  for (const msg of messages) {
    console.log(`\n👤 Cliente: ${msg}`);

    // Guardar mensaje del cliente
    await db.insert(messages).values({
      conversationId: convo.id,
      role: "customer",
      content: msg,
    });

    // Obtener respuesta
    try {
      const reply = await runAgentReply(convo.id);
      if (reply) {
        const partSummary = reply.parts.map(p =>
          p.kind === "card" ? `[CARD:${p.productId}]` : (p.content || "").substring(0, 120)
        ).join(" | ");
        console.log(`🤖 Bot: ${partSummary}`);
      } else {
        console.log(`⚠️  No hubo respuesta`);
      }
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
    }

    console.log("-".repeat(60));
  }

  // Limpiar
  await db.delete(messages).where(eq(messages.conversationId, convo.id));
  await db.delete(conversations).where(eq(conversations.id, convo.id));
  console.log(`🧹 Conversación ${convo.id} eliminada`);
}

testConversation().catch(console.error);
