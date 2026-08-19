/**
 * PRUEBA EN VIVO — Ciclo de aprendizaje del agente (2026-08-18)
 *
 * Simula una conversación real de WhatsApp contra la BD SQLite y el motor
 * real (runAgentReply + conversation-learning):
 *
 *   1. Crea tenant + producto + agente activo (Sofía).
 *   2. Cliente escribe "hola" → el agente responde (fast-track).
 *   3. Cliente pregunta "¿cuánto cuesta el curso de piano?" → el agente
 *      responde por IA/fallback.
 *   4. El cliente REPITE la misma pregunta → learnFromLastExchange detecta
 *      confusión (repetición), guarda la lección en architect_memory.
 *   5. Se verifica que retrieveLessons la recupera con prioridad para el
 *      producto y que formatLessonsForPrompt produce el bloque de aprendizaje
 *      que se inyecta en el prompt de la siguiente respuesta.
 *
 * Uso: USE_SQLITE=true npx tsx test-live-learning.ts
 */
import { db, tenants, products, agents, conversations, messages } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const T = (m: string) => console.log(`\n${"=".repeat(64)}\n${m}\n${"=".repeat(64)}`);

async function main() {
  await (await import("@workspace/db")).ensureDbReady();

  const sufijo = Date.now();
  const email = `live-${sufijo}@test.local`;

  T("1️⃣ CREANDO NEGOCIO + PRODUCTO + AGENTE (Sofía)");
  const [tenant] = await db.insert(tenants).values({
    name: "Prueba En Vivo",
    email,
    slug: `live-${sufijo}`,
    brandName: "Tienda Demo",
    agentName: "Sofía",
  }).returning();
  console.log("✅ tenant id:", tenant.id);

  const [product] = await db.insert(products).values({
    tenantId: tenant.id,
    name: "Curso de Piano",
    description: "Aprende piano desde cero, 100% práctico.",
    price: 60000,
    currency: "COP",
    kind: "digital",
  }).returning();
  console.log("✅ producto id:", product.id, "— Curso de Piano $60.000");

  const [agent] = await db.insert(agents).values({
    tenantId: tenant.id,
    name: "Sofía",
    role: "Directora de Ventas",
    tone: "professional",
    systemPrompt: `Eres Sofía, asesora de Tienda Demo. Vendes cursos digitales por WhatsApp.
HECHOS: pago único, acceso de por vida, entrega por Google Drive.
Formato: mensajes cortos, un emoji por línea, CTA clara.`,
    isActive: true,
    stages: [],
  }).returning();
  console.log("✅ agente activo id:", agent.id);

  const [convo] = await db.insert(conversations).values({
    tenantId: tenant.id,
    contactName: "Cliente Demo",
    contactPhone: "573001112233",
    status: "ai",
    currentStage: "greeting",
  }).returning();
  console.log("✅ conversación id:", convo.id);

  const { runAgentReply } = await import("./src/lib/agent");

  // ── PASO 2: saludo ─────────────────────────────────────────────────────────
  T("2️⃣ CLIENTE: 'hola' → EL AGENTE RESPONDE");
  await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: "hola", stage: "greeting" });
  await runAgentReply(convo.id);
  const saludo = (await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(desc(messages.id)).limit(1))[0];
  console.log(`💬 Sofía: ${(saludo?.content || "(sin respuesta)").slice(0, 120)}`);

  // ── PASO 3: pregunta de precio ─────────────────────────────────────────────
  T("3️⃣ CLIENTE: '¿cuánto cuesta el curso de piano?' → RESPUESTA 1");
  await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: "¿cuánto cuesta el curso de piano?" });
  await runAgentReply(convo.id);
  const r1 = (await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(desc(messages.id)).limit(1))[0];
  console.log(`💬 Sofía (respuesta 1): ${(r1?.content || "(sin respuesta)").slice(0, 150)}`);

  // ── PASO 4: el cliente REPITE la misma pregunta → aprendizaje ──────────────
  T("4️⃣ CLIENTE REPITE LA MISMA PREGUNTA → APRENDIZAJE DETECTA CONFUSIÓN");
  const ultimoDelAgente = (await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(desc(messages.id)).limit(2))[1]?.content || "";
  const { learnFromLastExchange, retrieveLessons, formatLessonsForPrompt } = await import("./src/lib/conversation-learning");

  const evaluacion = await learnFromLastExchange({
    tenantId: tenant.id,
    customerMsg: "¿cuánto cuesta el curso de piano?",
    prevCustomerMsg: "¿cuánto cuesta el curso de piano?",
    agentReply: ultimoDelAgente,
    productName: "Curso de Piano",
    intent: "details_query",
  });
  console.log("🔎 Evaluación:", JSON.stringify(evaluacion, null, 2));

  // ── PASO 5: recuperar la lección e inyectarla al prompt ────────────────────
  T("5️⃣ LA LECCIÓN SE RECUPERA Y SE INYECTA EN LA PRÓXIMA RESPUESTA");
  const lecciones = await retrieveLessons(tenant.id, { productName: "Curso de Piano", limit: 3 });
  console.log(`📚 Lecciones recuperadas: ${lecciones.length}`);
  const bloque = formatLessonsForPrompt(lecciones, 800);
  console.log("🧠 Bloque inyectado al prompt:\n" + bloque);

  // ── PASO 6: nueva pregunta → el agente responde CON el aprendizaje ─────────
  T("6️⃣ CLIENTE PREGUNTA OTRA VEZ → EL AGENTE RESPONDE CON APRENDIZAJE");
  await db.insert(messages).values({ conversationId: convo.id, role: "customer", content: "pero no entendí, ¿eso incluye envío o cómo lo recibo?" });
  await runAgentReply(convo.id);
  const r2 = (await db.select().from(messages).where(eq(messages.conversationId, convo.id)).orderBy(desc(messages.id)).limit(1))[0];
  console.log(`💬 Sofía (con aprendizaje): ${(r2?.content || "(sin respuesta)").slice(0, 180)}`);

  T("✅ PRUEBA EN VIVO COMPLETADA");
  console.log("Resumen del ciclo: evaluar → guardar lección → recuperar → adaptar respuesta.");
}

main().catch((e) => {
  console.error("❌ Error en la prueba:", e);
  process.exit(1);
});
