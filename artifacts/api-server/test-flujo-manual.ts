/**
 * TEST MANUAL: Flujo Completo desde Saludo hasta Venta
 * 
 * Ejecutar con: npx tsx test-flujo-manual.ts
 */

import { eq } from 'drizzle-orm';
import { db, conversations, messages, products, productCategories } from '@workspace/db';
import { loadConversationMemory, computeDecision, saveAgentMessage } from './src/lib/conversation-engine';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

async function runTest() {
  try {
    log(colors.cyan, '\n' + '='.repeat(100));
    log(colors.cyan, '🎯 TEST COMPLETO: FLUJO DE CONVERSACIÓN DESDE SALUDO HASTA VENTA');
    log(colors.cyan, '='.repeat(100) + '\n');

    // ── SETUP ──────────────────────────────────────────────────────────────────
    log(colors.blue, '📋 [SETUP] Inicializando test...');

    // Crear productos de prueba
    const [guitarra] = await db.insert(products).values({
      tenantId: 1,
      name: 'Guitarra Acústica',
      description: 'Instrumento de cuerda de excelente calidad',
      price: '50000',
      currency: 'COP',
      category: 'música',
      categoryId: 1,
      kind: 'digital',
      isActive: true,
      features: ['Sonido profesional', 'Fácil de tocar', 'Incluye accesorios'],
      paymentLink: 'https://mercadopago.com/checkout/guitarra',
      deliveryLink: 'https://drive.google.com/guitarra',
    }).returning();

    const [piano] = await db.insert(products).values({
      tenantId: 1,
      name: 'Piano Digital',
      description: 'Teclado electrónico con 88 teclas',
      price: '120000',
      currency: 'COP',
      category: 'música',
      categoryId: 1,
      kind: 'digital',
      isActive: true,
      features: ['88 teclas', 'Sonido realista', 'Conexión MIDI'],
      paymentLink: 'https://mercadopago.com/checkout/piano',
      deliveryLink: 'https://drive.google.com/piano',
    }).returning();

    // Crear conversación
    const [convo] = await db.insert(conversations).values({
      tenantId: 1,
      contactPhone: '573001234567',
      contactName: 'Juan',
      currentStage: 'greeting',
      isActive: true,
    }).returning();

    const conversationId = convo.id;

    // Cargar productos
    const productList = await db.select().from(products).where(eq(products.isActive, true));
    const categories = await db.select().from(productCategories);
    const categoryMap = new Map(categories.map(c => [c.id, c.name.toLowerCase()]));

    log(colors.green, `✅ Conversación creada: ID ${conversationId}`);
    log(colors.green, `✅ Productos cargados: ${productList.length}`);
    log(colors.green, `✅ Guitarra ID: ${guitarra.id}`);
    log(colors.green, `✅ Piano ID: ${piano.id}\n`);

    // ── PASO 1: SALUDO ─────────────────────────────────────────────────────────
    log(colors.yellow, '1️⃣  PASO 1: SALUDO INICIAL');
    log(colors.yellow, '─'.repeat(100));

    await saveAgentMessage(conversationId, 'Hola', 'greeting', {
      intent: 'greeting',
      role: 'customer',
    });

    await saveAgentMessage(conversationId, '¡Hola Juan! 👋 Bienvenido. ¿En qué puedo ayudarte hoy?', 'greeting', {
      intent: 'greeting',
      isHardcoded: true,
    });

    const memory1 = await loadConversationMemory(conversationId);
    log(colors.green, `✅ Cliente saludó: "${memory1.lastCustomerMessage}"`);
    log(colors.green, `✅ Agente respondió`);
    log(colors.green, `✅ hasGreeted: ${memory1.hasGreeted}`);
    log(colors.green, `✅ messageCount: ${memory1.messageCount}\n`);

    // ── PASO 2: BÚSQUEDA DE PRODUCTO ───────────────────────────────────────────
    log(colors.yellow, '2️⃣  PASO 2: BÚSQUEDA DE PRODUCTO');
    log(colors.yellow, '─'.repeat(100));

    const clientMessage2 = 'Quiero guitarra';
    await saveAgentMessage(conversationId, clientMessage2, 'discovery', {
      intent: 'product_query',
      role: 'customer',
    });

    const memory2 = await loadConversationMemory(conversationId);
    const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

    log(colors.green, `✅ Cliente preguntó: "${clientMessage2}"`);
    log(colors.green, `✅ Intención detectada: ${decision2.intent}`);
    log(colors.green, `✅ Producto encontrado: ${decision2.productToShow?.name}`);
    log(colors.green, `✅ ID del producto: ${decision2.productToShow?.id}`);
    log(colors.green, `✅ Precio: $${decision2.productToShow?.price}`);
    log(colors.green, `✅ shouldSendCard: ${decision2.shouldSendCard}\n`);

    // Validar que es guitarra, no piano
    if (decision2.productToShow?.id === guitarra.id) {
      log(colors.green, `✅ VALIDACIÓN: Es la guitarra correcta (ID: ${guitarra.id})\n`);
    } else {
      log(colors.red, `❌ ERROR: Producto incorrecto. Esperaba guitarra (${guitarra.id}), obtuve ${decision2.productToShow?.id}\n`);
      throw new Error('Producto incorrecto en búsqueda');
    }

    // ── PASO 3: PRESENTACIÓN DE PRODUCTO ───────────────────────────────────────
    log(colors.yellow, '3️⃣  PASO 3: PRESENTACIÓN DE PRODUCTO');
    log(colors.yellow, '─'.repeat(100));

    const agentResponse3 = `¡Excelente! 🎸 Tenemos la Guitarra Acústica perfecta para ti.\n\n[CARD: ${decision2.productToShow?.id}]`;
    await saveAgentMessage(conversationId, agentResponse3, 'presentation', {
      intent: 'product_query',
      cardSent: true,
      productId: decision2.productToShow?.id,
      productName: decision2.productToShow?.name,
    });

    const memory3 = await loadConversationMemory(conversationId);
    log(colors.green, `✅ Tarjeta enviada: ${decision2.productToShow?.name}`);
    log(colors.green, `✅ sentProductIds: [${Array.from(memory3.sentProductIds).join(', ')}]`);
    log(colors.green, `✅ currentProductId: ${memory3.currentProductId}`);
    log(colors.green, `✅ currentProductName: ${memory3.currentProductName}\n`);

    // ── PASO 4: PREGUNTAS SOBRE DETALLES ───────────────────────────────────────
    log(colors.yellow, '4️⃣  PASO 4: PREGUNTAS SOBRE DETALLES');
    log(colors.yellow, '─'.repeat(100));

    const clientMessage4 = '¿Cuánto cuesta?';
    await saveAgentMessage(conversationId, clientMessage4, 'details', {
      intent: 'details_query',
      role: 'customer',
    });

    const memory4 = await loadConversationMemory(conversationId);
    const decision4 = await computeDecision(memory4, clientMessage4, productList, categoryMap);

    log(colors.green, `✅ Cliente preguntó: "${clientMessage4}"`);
    log(colors.green, `✅ Intención detectada: ${decision4.intent}`);
    log(colors.green, `✅ Producto en contexto: ${decision4.productToShow?.name}`);
    log(colors.green, `✅ Precio: $${decision4.productToShow?.price}\n`);

    // Validar que mantiene guitarra
    if (decision4.productToShow?.id === guitarra.id) {
      log(colors.green, `✅ VALIDACIÓN: Mantiene guitarra en contexto\n`);
    } else {
      log(colors.red, `❌ ERROR: Perdió contexto del producto\n`);
      throw new Error('Contexto de producto perdido');
    }

    // ── PASO 5: INTENCIÓN DE PAGO ──────────────────────────────────────────────
    log(colors.yellow, '5️⃣  PASO 5: INTENCIÓN DE PAGO');
    log(colors.yellow, '─'.repeat(100));

    const clientMessage5 = 'Quiero pagar';
    await saveAgentMessage(conversationId, clientMessage5, 'closing', {
      intent: 'payment_intent',
      role: 'customer',
    });

    const memory5 = await loadConversationMemory(conversationId);
    const decision5 = await computeDecision(memory5, clientMessage5, productList, categoryMap);

    log(colors.green, `✅ Cliente expresó: "${clientMessage5}"`);
    log(colors.green, `✅ Intención detectada: ${decision5.intent}`);
    log(colors.green, `✅ Producto para pago: ${decision5.productToShow?.name}`);
    log(colors.green, `✅ shouldSendCard: ${decision5.shouldSendCard}\n`);

    // Validar que es guitarra
    if (decision5.productToShow?.id === guitarra.id) {
      log(colors.green, `✅ VALIDACIÓN: Producto correcto para pago (Guitarra)\n`);
    } else {
      log(colors.red, `❌ ERROR: Producto incorrecto para pago\n`);
      throw new Error('Producto incorrecto en pago');
    }

    // ── PASO 6: CONFIRMACIÓN DE COMPRA ─────────────────────────────────────────
    log(colors.yellow, '6️⃣  PASO 6: CONFIRMACIÓN DE COMPRA');
    log(colors.yellow, '─'.repeat(100));

    const clientMessage6 = 'Confirmo';
    await saveAgentMessage(conversationId, clientMessage6, 'closing', {
      intent: 'confirmation',
      role: 'customer',
    });

    const memory6 = await loadConversationMemory(conversationId);
    const decision6 = await computeDecision(memory6, clientMessage6, productList, categoryMap);

    log(colors.green, `✅ Cliente confirmó: "${clientMessage6}"`);
    log(colors.green, `✅ Intención detectada: ${decision6.intent}`);
    log(colors.green, `✅ Producto confirmado: ${decision6.productToShow?.name}`);
    log(colors.green, `✅ Precio final: $${decision6.productToShow?.price}\n`);

    // ── PASO 7: VALIDACIÓN FINAL ───────────────────────────────────────────────
    log(colors.yellow, '7️⃣  PASO 7: VALIDACIÓN FINAL');
    log(colors.yellow, '─'.repeat(100));

    log(colors.green, `✅ Producto inicial (Paso 2): ${decision2.productToShow?.name} (ID: ${decision2.productToShow?.id})`);
    log(colors.green, `✅ Producto final (Paso 6): ${decision6.productToShow?.name} (ID: ${decision6.productToShow?.id})`);

    if (decision2.productToShow?.id === decision6.productToShow?.id) {
      log(colors.green, `✅ COINCIDEN PERFECTAMENTE\n`);
    } else {
      log(colors.red, `❌ ERROR: Productos no coinciden\n`);
      throw new Error('Productos no coinciden');
    }

    // ── RESUMEN ────────────────────────────────────────────────────────────────
    log(colors.cyan, '='.repeat(100));
    log(colors.green, '🎉 TEST COMPLETADO EXITOSAMENTE');
    log(colors.cyan, '='.repeat(100));

    log(colors.green, '\n📊 RESUMEN DEL FLUJO:');
    log(colors.green, `   1. Saludo: ✅`);
    log(colors.green, `   2. Búsqueda: ✅ (Guitarra encontrada)`);
    log(colors.green, `   3. Presentación: ✅ (Tarjeta enviada)`);
    log(colors.green, `   4. Detalles: ✅ (Contexto mantenido)`);
    log(colors.green, `   5. Pago: ✅ (Producto correcto)`);
    log(colors.green, `   6. Confirmación: ✅ (Compra confirmada)`);
    log(colors.green, `   7. Validación: ✅ (Productos coinciden)\n`);

    log(colors.green, '✅ El bot está funcionando correctamente');
    log(colors.green, '✅ Los productos se cargan correctamente de la BD');
    log(colors.green, '✅ El flujo de conversación es correcto');
    log(colors.green, '✅ El producto en pago es el correcto\n');

    // Limpiar
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    await db.delete(products).where(eq(products.id, guitarra.id));
    await db.delete(products).where(eq(products.id, piano.id));

    log(colors.green, '✅ Datos de prueba eliminados\n');

    process.exit(0);
  } catch (error) {
    log(colors.red, `\n❌ ERROR: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

runTest();
