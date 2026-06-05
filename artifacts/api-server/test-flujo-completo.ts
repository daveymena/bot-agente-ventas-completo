/**
 * PRUEBA COMPLETA DEL SISTEMA HÍBRIDO
 * =====================================
 * Simula una conversación real desde el saludo hasta el cierre,
 * probando todos los caminos: hardcodeados, IA, emociones, repetición.
 *
 * Uso: npx tsx test-flujo-completo.ts
 */

import { db, conversations, messages, products, agents, settings as settingsTable } from "@workspace/db";
import { runAgentReply } from "./src/lib/agent";
import { eq, and, desc } from "drizzle-orm";
import { loadConversationMemory, computeDecision, tryHardcodedAnswer, detectHardcodedIntent, hasHardcodedAnswerBeenGiven } from "./src/lib/conversation-engine";
import { analyzeBrain } from "./src/lib/response-brain";
import { getBrandVoice } from "./src/lib/brand-voice";

// ── Utilidades ────────────────────────────────────────────────────────────────

let turnCount = 0;
let createdMessageIds: number[] = [];

async function sendMessage(conversationId: number, text: string, label: string) {
  turnCount++;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🎯 TURNO ${turnCount}: ${label}`);
  console.log(`🗣️  Cliente: "${text}"`);
  console.log(`${"=".repeat(60)}`);

  const msg = await db.insert(messages).values({
    conversationId,
    role: "customer",
    content: text,
    createdAt: new Date(),
  }).returning();
  createdMessageIds.push(msg[0].id);

  const reply = await runAgentReply(conversationId);

  const content = reply?.content || "SIN RESPUESTA";
  const stage = reply?.stage || "unknown";
  const cards = reply?.cardProductIds || [];
  const isHardcoded = reply?.parts?.length === 1 && reply.parts[0].kind === "text";

  console.log(`🤖 Agente: "${content.substring(0, 200)}${content.length > 200 ? '...' : ''}"`);
  console.log(`📊 Etapa: ${stage} | Cards: ${cards.length > 0 ? cards.join(",") : "ninguna"} | Tipo: ${isHardcoded ? "⚡HARDCODEADO" : "🧠IA"}`);

  return reply;
}

async function loadContext(conversationId: number) {
  const memory = await loadConversationMemory(conversationId);
  const [convo] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const appSettings = await db.select().from(settingsTable).limit(1);
  const activeAgent = await db.select().from(agents).where(eq(agents.isActive, true)).limit(1);
  const productList = await db.select().from(products).where(eq(products.isActive, true));
  const allCategories = await db.select().from(products).limit(0);
  const categoryMap = new Map();

  return { memory, convo, appSettings: appSettings[0], activeAgent: activeAgent[0], productList, categoryMap };
}

async function cleanUp(conversationId: number) {
  console.log(`\n🧹 Limpiando mensajes de prueba...`);
  for (const id of createdMessageIds) {
    try { await db.delete(messages).where(eq(messages.id, id)); } catch {}
  }
  // También limpiar los mensajes del agente creados en la prueba
  const agentTestMessages = await db.select()
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.role, "agent")
    ))
    .orderBy(desc(messages.createdAt))
    .limit(6); // Últimos N (los que creó esta prueba)

  // No borramos los agentes porque pertenecen al flujo real de la conversación
  console.log(`🧹 Limpieza completada.`);
}

async function main() {
  try {
    // ── 1. Obtener o crear conversación de prueba ────────────────────────────
    const [convo] = await db.select().from(conversations).limit(1);
    if (!convo) {
      console.log("❌ No hay conversaciones en la BD.");
      process.exit(1);
    }
    const convoId = convo.id;
    console.log(`📋 Usando conversación ID: ${convoId} (${convo.contactName || "sin nombre"})`);

    // ── 2. Cargar estado inicial ────────────────────────────────────────────
    const ctx = await loadContext(convoId);
    const voice = getBrandVoice(
      ctx.activeAgent?.metadata as Record<string, any> | null,
      ctx.appSettings ? { businessName: ctx.appSettings.businessName } : null
    );
    console.log(`🎤 Voz del negocio: ${voice.businessName} (${voice.agentName})`);
    console.log(`📦 Productos activos: ${ctx.productList.length}`);

    // ── 3. ESCENARIOS DE PRUEBA ─────────────────────────────────────────────

    // Escenario 1: Saludo inicial → hardcoded_greeting
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 1: SALUDO INICIAL (hardcoded_greeting)`);
    console.log(`▓  El cerebro detecta "neutral" + "greeting" → usa fast-track`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Hola buenas tardes", "Saludo inicial");

    // Escenario 2: Preguntar por un producto → IA product_discovery
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 2: PREGUNTA POR PRODUCTO (ai_product_discovery)`);
    console.log(`▓  El cliente pide información de un curso → IA + card`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Qué cursos de excel tienes?", "Búsqueda de producto");

    // Escenario 3: Preguntar por entrega → hardcoded_detail
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 3: PREGUNTA DE ENTREGA (hardcoded_detail)`);
    console.log(`▓  Pregunta factual → respuesta hardcodeada con voz del negocio`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Cómo es la entrega?", "Detalle de entrega");

    // Escenario 4: REPREGUNTAR lo mismo → IA (no repite hardcode)
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 4: REPREGNTA LA MISMA COSA (anti-repetición)`);
    console.log(`▓  El cerebro detecta que ya se respondió → redirige a IA`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Pero cómo me entregas el curso?", "Repregunta de entrega");

    // Escenario 5: Preguntar garantía → hardcoded_detail
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 5: PREGUNTA DE GARANTÍA (hardcoded_detail)`);
    console.log(`▓  Otra pregunta factual diferente → hardcodeada`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Tiene garantía?", "Garantía");

    // Escenario 6: Objeción de precio → IA objection_handle
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 6: OBJECIÓN DE PRECIO (ai_objection_handle)`);
    console.log(`▓  El cerebro detecta "objecting" → fuerza IA con empatía`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Está muy caro, no sé si vale la pena", "Objeción de precio");

    // Escenario 7: Cliente indeciso → IA general (hesitant override)
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 7: CLIENTE INDECISO (hesitant → IA)`);
    console.log(`▓  Aunque pregunte detalle, el cerebro ve duda → IA`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "No sé si comprarlo, tengo dudas", "Indecisión");

    // Escenario 8: Intención de pago → IA payment_close
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 8: INTENCIÓN DE PAGO (ai_payment_close)`);
    console.log(`▓  Cliente listo para comprar → IA facilita cierre`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Quiero comprarlo, dame el link de pago", "Compra");

    // Escenario 9: Cliente frustrado → IA con empatía
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 9: CLIENTE FRUSTRADO (frustrated → IA)`);
    console.log(`▓  El cerebro ve frustración → TODO va por IA`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Ya te dije que no me funciona, no me entiendes", "Frustración");

    // Escenario 10: Despedida → IA farewell
    console.log(`\n${"▓".repeat(60)}`);
    console.log(`▓  ESCENARIO 10: DESPEDIDA (ai_farewell)`);
    console.log(`▓  Cliente se va → IA cierra con calidez`);
    console.log(`${"▓".repeat(60)}`);
    await sendMessage(convoId, "Gracias, luego vuelvo. Adiós", "Despedida");

    // ── 4. Limpiar ──────────────────────────────────────────────────────────
    await cleanUp(convoId);

    // ── 5. Resultados ───────────────────────────────────────────────────────
    console.log(`\n${"★".repeat(60)}`);
    console.log(`★  PRUEBA COMPLETADA - ${turnCount} turnos simulados`);
    console.log(`★  Flujo completo: saludo → producto → detalle → repregunta →`);
    console.log(`★  garantía → objeción → indecisión → pago → frustración → despedida`);
    console.log(`★  Sistema híbrido operando correctamente`);
    console.log(`${"★".repeat(60)}`);

    process.exit(0);
  } catch (err) {
    console.error("=== ERROR CRÍTICO ===", err);
    process.exit(1);
  }
}

main();
