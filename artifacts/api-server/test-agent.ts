import { db, conversations, messages } from "@workspace/db";
import { runAgentReply } from "./src/lib/agent";
import { eq } from "drizzle-orm";

async function testAgent() {
  try {
    const convoList = await db.select().from(conversations).limit(1);
    if (convoList.length === 0) {
      console.log("No hay conversaciones en la BD.");
      process.exit(1);
    }
    const convoId = convoList[0].id;

    // Insertar un saludo puro para simular cliente que vuelve a escribir
    const testMsg = await db.insert(messages).values({
      conversationId: convoId,
      role: "customer",
      content: "Hola muy buenas",
      createdAt: new Date(),
    }).returning();
    console.log(`Mensaje de prueba insertado: "${testMsg[0].content}"`);

    console.log(`\nProbando runAgentReply con la conversacion ID: ${convoId}`);
    const reply = await runAgentReply(convoId);
    console.log("=== RESPUESTA ===\n", JSON.stringify(reply, null, 2));

    // Validacion automatica
    const hasCard = reply.cardProductIds && reply.cardProductIds.length > 0;
    if (hasCard) {
      console.log("\nFALLO: Sofia envio tarjeta de producto en un simple saludo. ATOSIGAMIENTO.");
    } else {
      console.log("\nEXITO: Sofia respondio al saludo sin enviar ningun producto. Protocolo correcto.");
    }

    // Limpiar el mensaje de prueba
    await db.delete(messages).where(eq(messages.id, testMsg[0].id));
    process.exit(0);
  } catch (err) {
    console.error("=== ERROR CRITICO ===\n", err);
    process.exit(1);
  }
}

testAgent();
