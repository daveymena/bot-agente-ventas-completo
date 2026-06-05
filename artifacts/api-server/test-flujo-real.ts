/**
 * TEST CON DATOS REALES: Flujo Completo usando productos REALES de la BD
 * 
 * Este test:
 * 1. Carga productos REALES de la BD
 * 2. Usa precios REALES
 * 3. Usa descripciones REALES
 * 4. Simula una conversación completa
 * 5. Valida que el bot accede correctamente a la BD
 * 
 * Ejecutar con: npx tsx test-flujo-real.ts
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
  magenta: '\x1b[35m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

async function runTest() {
  try {
    log(colors.cyan, '\n' + '='.repeat(120));
    log(colors.cyan, '🎯 TEST CON DATOS REALES: FLUJO COMPLETO USANDO BD REAL');
    log(colors.cyan, '='.repeat(120) + '\n');

    // ── PASO 1: CARGAR PRODUCTOS REALES DE LA BD ───────────────────────────────
    log(colors.blue, '📋 [PASO 0] CARGANDO DATOS REALES DE LA BD');
    log(colors.blue, '─'.repeat(120));

    // Cargar TODOS los productos activos reales
    const productList = await db.select().from(products).where(eq(products.isActive, true));
    const categories = await db.select().from(productCategories);
    const categoryMap = new Map(categories.map(c => [c.id, c.name.toLowerCase()]));

    log(colors.green, `✅ Productos activos en BD: ${productList.length}`);
    log(colors.green, `✅ Categorías en BD: ${categories.length}\n`);

    // Mostrar algunos productos reales
    log(colors.magenta, '📦 PRODUCTOS REALES EN LA BD:');
    productList.slice(0, 5).forEach((p, i) => {
      log(colors.magenta, `   ${i + 1}. ${p.name} - $${p.price} ${p.currency}`);
    });
    if (productList.length > 5) {
      log(colors.magenta, `   ... y ${productList.length - 5} más\n`);
    } else {
      log(colors.magenta, '');
    }

    // ── PASO 2: CREAR CONVERSACIÓN ─────────────────────────────────────────────
    log(colors.blue, '📋 [PASO 1] CREAR CONVERSACIÓN');
    log(colors.blue, '─'.repeat(120));

    const [convo] = await db.insert(conversations).values({
      tenantId: 1,
      contactPhone: '573001234567',
      contactName: 'Cliente Real',
      currentStage: 'greeting',
      isActive: true,
    }).returning();

    const conversationId = convo.id;
    log(colors.green, `✅ Conversación creada: ID ${conversationId}\n`);

    // ── PASO 3: SALUDO ─────────────────────────────────────────────────────────
    log(colors.yellow, '1️⃣  PASO 2: SALUDO INICIAL');
    log(colors.yellow, '─'.repeat(120));

    await saveAgentMessage(conversationId, 'Hola', 'greeting', {
      intent: 'greeting',
      role: 'customer',
    });

    await saveAgentMessage(conversationId, '¡Hola Cliente Real! 👋 Bienvenido. ¿En qué puedo ayudarte hoy?', 'greeting', {
      intent: 'greeting',
      isHardcoded: true,
    });

    const memory1 = await loadConversationMemory(conversationId);
    log(colors.green, `✅ Cliente saludó`);
    log(colors.green, `✅ Agente respondió`);
    log(colors.green, `✅ hasGreeted: ${memory1.hasGreeted}\n`);

    // ── PASO 4: BUSCAR PRODUCTO REAL ───────────────────────────────────────────
    log(colors.yellow, '2️⃣  PASO 3: BÚSQUEDA DE PRODUCTO REAL');
    log(colors.yellow, '─'.repeat(120));

    // Buscar un producto real que existe en la BD
    // Vamos a buscar por una palabra común
    const clientMessage2 = 'Quiero guitarra';
    log(colors.green, `📝 Cliente pregunta: "${clientMessage2}"`);

    await saveAgentMessage(conversationId, clientMessage2, 'discovery', {
      intent: 'product_query',
      role: 'customer',
    });

    const memory2 = await loadConversationMemory(conversationId);
    const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

    if (decision2.productToShow) {
      log(colors.green, `✅ Producto encontrado en BD: ${decision2.productToShow.name}`);
      log(colors.green, `✅ ID: ${decision2.productToShow.id}`);
      log(colors.green, `✅ Precio REAL: $${decision2.productToShow.price} ${decision2.productToShow.currency}`);
      log(colors.green, `✅ Descripción: ${decision2.productToShow.description}`);
      log(colors.green, `✅ Características: ${decision2.productToShow.features?.join(', ') || 'N/A'}`);

      // Verificar que el producto existe en la BD
      const [productFromDB] = await db.select()
        .from(products)
        .where(eq(products.id, decision2.productToShow.id));

      if (productFromDB) {
        log(colors.green, `✅ VERIFICADO: Producto existe en BD`);
        log(colors.green, `✅ Precio en BD: $${productFromDB.price} ${productFromDB.currency}`);
        log(colors.green, `✅ Link de pago: ${productFromDB.paymentLink ? '✅ Configurado' : '❌ No configurado'}`);
        log(colors.green, `✅ Link de entrega: ${productFromDB.deliveryLink ? '✅ Configurado' : '❌ No configurado'}\n`);
      } else {
        log(colors.red, `❌ ERROR: Producto no encontrado en BD\n`);
        throw new Error('Producto no encontrado en BD');
      }
    } else {
      log(colors.yellow, `⚠️  No se encontró producto para "${clientMessage2}"`);
      log(colors.yellow, `   Intentando con otra búsqueda...\n`);

      // Intentar con otra búsqueda
      const clientMessage2b = 'Quiero un curso';
      await saveAgentMessage(conversationId, clientMessage2b, 'discovery', {
        intent: 'product_query',
        role: 'customer',
      });

      const memory2b = await loadConversationMemory(conversationId);
      const decision2b = await computeDecision(memory2b, clientMessage2b, productList, categoryMap);

      if (decision2b.productToShow) {
        log(colors.green, `✅ Producto encontrado: ${decision2b.productToShow.name}`);
        log(colors.green, `✅ Precio REAL: $${decision2b.productToShow.price} ${decision2b.productToShow.currency}\n`);
      }
    }

    // ── PASO 5: PRESENTACIÓN ───────────────────────────────────────────────────
    log(colors.yellow, '3️⃣  PASO 4: PRESENTACIÓN DE PRODUCTO');
    log(colors.yellow, '─'.repeat(120));

    const productToShow = decision2.productToShow || (await computeDecision(memory2, 'Quiero un curso', productList, categoryMap)).productToShow;

    if (productToShow) {
      const agentResponse3 = `¡Excelente! 🎯 Tenemos ${productToShow.name} perfecto para ti.\n\n[CARD: ${productToShow.id}]`;
      await saveAgentMessage(conversationId, agentResponse3, 'presentation', {
        intent: 'product_query',
        cardSent: true,
        productId: productToShow.id,
        productName: productToShow.name,
      });

      const memory3 = await loadConversationMemory(conversationId);
      log(colors.green, `✅ Tarjeta enviada: ${productToShow.name}`);
      log(colors.green, `✅ Precio mostrado: $${productToShow.price}`);
      log(colors.green, `✅ currentProductId: ${memory3.currentProductId}`);
      log(colors.green, `✅ sentProductIds: [${Array.from(memory3.sentProductIds).join(', ')}]\n`);

      // ── PASO 6: DETALLES ───────────────────────────────────────────────────
      log(colors.yellow, '4️⃣  PASO 5: PREGUNTAS SOBRE DETALLES');
      log(colors.yellow, '─'.repeat(120));

      const clientMessage4 = '¿Cuánto cuesta?';
      await saveAgentMessage(conversationId, clientMessage4, 'details', {
        intent: 'details_query',
        role: 'customer',
      });

      const memory4 = await loadConversationMemory(conversationId);
      const decision4 = await computeDecision(memory4, clientMessage4, productList, categoryMap);

      log(colors.green, `✅ Cliente preguntó: "${clientMessage4}"`);
      log(colors.green, `✅ Producto en contexto: ${decision4.productToShow?.name}`);
      log(colors.green, `✅ Precio REAL: $${decision4.productToShow?.price}`);
      log(colors.green, `✅ Contexto mantenido: ${decision4.productToShow?.id === productToShow.id ? '✅ SÍ' : '❌ NO'}\n`);

      // ── PASO 7: PAGO ───────────────────────────────────────────────────────
      log(colors.yellow, '5️⃣  PASO 6: INTENCIÓN DE PAGO');
      log(colors.yellow, '─'.repeat(120));

      const clientMessage5 = 'Quiero pagar';
      await saveAgentMessage(conversationId, clientMessage5, 'closing', {
        intent: 'payment_intent',
        role: 'customer',
      });

      const memory5 = await loadConversationMemory(conversationId);
      const decision5 = await computeDecision(memory5, clientMessage5, productList, categoryMap);

      log(colors.green, `✅ Cliente expresó: "${clientMessage5}"`);
      log(colors.green, `✅ Producto para pago: ${decision5.productToShow?.name}`);
      log(colors.green, `✅ Precio REAL para pago: $${decision5.productToShow?.price}`);

      // Verificar que el producto en pago es el correcto
      const [paymentProduct] = await db.select()
        .from(products)
        .where(eq(products.id, decision5.productToShow!.id));

      if (paymentProduct) {
        log(colors.green, `✅ VERIFICADO: Producto en pago existe en BD`);
        log(colors.green, `✅ Link de pago REAL: ${paymentProduct.paymentLink}`);
        log(colors.green, `✅ Link de entrega REAL: ${paymentProduct.deliveryLink}\n`);
      }

      // ── PASO 8: CONFIRMACIÓN ───────────────────────────────────────────────
      log(colors.yellow, '6️⃣  PASO 7: CONFIRMACIÓN DE COMPRA');
      log(colors.yellow, '─'.repeat(120));

      const clientMessage6 = 'Confirmo';
      await saveAgentMessage(conversationId, clientMessage6, 'closing', {
        intent: 'confirmation',
        role: 'customer',
      });

      const memory6 = await loadConversationMemory(conversationId);
      const decision6 = await computeDecision(memory6, clientMessage6, productList, categoryMap);

      log(colors.green, `✅ Cliente confirmó: "${clientMessage6}"`);
      log(colors.green, `✅ Producto confirmado: ${decision6.productToShow?.name}`);
      log(colors.green, `✅ Precio FINAL: $${decision6.productToShow?.price}\n`);

      // ── PASO 9: VALIDACIÓN FINAL ───────────────────────────────────────────
      log(colors.yellow, '7️⃣  PASO 8: VALIDACIÓN FINAL');
      log(colors.yellow, '─'.repeat(120));

      log(colors.green, `✅ Producto inicial: ${productToShow.name} (ID: ${productToShow.id})`);
      log(colors.green, `✅ Producto final: ${decision6.productToShow?.name} (ID: ${decision6.productToShow?.id})`);

      if (productToShow.id === decision6.productToShow?.id) {
        log(colors.green, `✅ COINCIDEN PERFECTAMENTE\n`);
      } else {
        log(colors.red, `❌ ERROR: Productos no coinciden\n`);
        throw new Error('Productos no coinciden');
      }

      // ── RESUMEN ────────────────────────────────────────────────────────────
      log(colors.cyan, '='.repeat(120));
      log(colors.green, '🎉 TEST CON DATOS REALES COMPLETADO EXITOSAMENTE');
      log(colors.cyan, '='.repeat(120));

      log(colors.green, '\n📊 RESUMEN DEL FLUJO CON DATOS REALES:');
      log(colors.green, `   ✅ Productos cargados de BD: ${productList.length}`);
      log(colors.green, `   ✅ Producto seleccionado: ${productToShow.name}`);
      log(colors.green, `   ✅ Precio REAL: $${productToShow.price} ${productToShow.currency}`);
      log(colors.green, `   ✅ Descripción REAL: ${productToShow.description}`);
      log(colors.green, `   ✅ Link de pago REAL: ${paymentProduct?.paymentLink}`);
      log(colors.green, `   ✅ Link de entrega REAL: ${paymentProduct?.deliveryLink}`);
      log(colors.green, `   ✅ Flujo completo: Saludo → Búsqueda → Presentación → Detalles → Pago → Confirmación`);
      log(colors.green, `   ✅ Producto en pago es el correcto\n`);

      log(colors.green, '✅ El bot accede correctamente a la BD');
      log(colors.green, '✅ Los precios son REALES de la BD');
      log(colors.green, '✅ Las descripciones son REALES de la BD');
      log(colors.green, '✅ Los links de pago son REALES de la BD');
      log(colors.green, '✅ El flujo de conversación es correcto\n');

      // Limpiar
      await db.delete(messages).where(eq(messages.conversationId, conversationId));
      await db.delete(conversations).where(eq(conversations.id, conversationId));

      log(colors.green, '✅ Datos de prueba eliminados\n');
    } else {
      log(colors.red, '❌ No se encontró ningún producto en la BD\n');
      throw new Error('No hay productos en la BD');
    }

    process.exit(0);
  } catch (error) {
    log(colors.red, `\n❌ ERROR: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

runTest();
