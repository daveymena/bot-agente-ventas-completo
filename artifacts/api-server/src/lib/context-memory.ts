import { db, messages, conversations } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

export interface SummarizedSession {
  date: Date;
  summary: string;
  productsDiscussed: number[];
  resolved: boolean;
}

/**
 * Recupera un resumen de las sesiones pasadas para dar memoria a largo plazo a la IA.
 * Esto evita enviar cientos de mensajes pasados, y en su lugar envía un contexto comprimido.
 */
export async function getLongTermMemoryContext(conversationId: number): Promise<string> {
  try {
    // 1. Obtener la conversación
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!convo || !convo.contactPhone) return "";

    // 2. Buscar si hay notas o resúmenes guardados en metadata o tabla relacionada
    // (Simulado por ahora: asumiremos que extraeremos de mensajes viejos si es muy largo)
    const oldMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(50); // Traemos hasta 50 para ver si es cliente recurrente

    if (oldMessages.length <= 15) {
      return ""; // No necesita memoria a largo plazo si es corta
    }

    // Identificar productos mencionados históricamente (mirando los meta.productId de los mensajes)
    const historicalProducts = new Set<string>();
    let pastObjections = 0;
    
    oldMessages.forEach((msg: any) => {
      const meta = msg.metadata as any;
      if (meta?.productId || meta?.productName) {
        historicalProducts.add(meta.productName || `ID:${meta.productId}`);
      }
      if (meta?.intent === "objection") {
        pastObjections++;
      }
    });

    const productsArray = Array.from(historicalProducts);
    
    let contextBlock = `\n━━━━━━━━━━━━━━━━━━━━━━━\n🧠 MEMORIA DE LARGO PLAZO\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
    contextBlock += `• Cliente recurrente con historial extenso (${oldMessages.length}+ mensajes previos).\n`;
    
    if (productsArray.length > 0) {
      contextBlock += `• Interesado históricamente en: ${productsArray.slice(0, 3).join(", ")}.\n`;
    }
    
    if (pastObjections > 2) {
      contextBlock += `• Precaución: Cliente ha presentado múltiples objeciones en el pasado. Requiere manejo cuidadoso y generar mucha confianza.\n`;
    }
    
    return contextBlock;
  } catch (error) {
    console.error("Error obteniendo memoria a largo plazo:", error);
    return "";
  }
}
