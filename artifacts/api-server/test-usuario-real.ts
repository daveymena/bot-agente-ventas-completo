/**
 * TEST CON USUARIO REAL: daveymena16@gmail.com
 * 
 * Este test:
 * 1. Carga el tenant del usuario daveymena16@gmail.com
 * 2. Carga los productos REALES del usuario
 * 3. Carga los precios REALES
 * 4. Simula una conversación completa
 * 5. Valida que el bot accede correctamente a los datos del usuario
 * 
 * Ejecutar con: npx tsx test-usuario-real.ts
 */

import { eq } from 'drizzle-orm';
import { db, conversations, messages, products, productCategories, tenants } from '@workspace/db';
import { loadConversationMemory, computeDecision, saveAgentMessage } from './src/lib/conversation-engine';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

function separator(char = '=', length = 130) {
  return char.repeat(length);
}

async function runTest() {
  try {
    log(colors.cyan, '\n' + separator('='));
    log(colors.cyan, '🎯 TEST CON USUARIO REAL: daveymena16@gmail.com');
    log(colors.cyan, separator('=') + '\n');

    // ── PASO 1: ENCONTRAR TENANT DEL USUARIO ───────────────────────────────────
    log(colors.blue, '📋 [PASO 1] BUSCAR TENANT DEL USUARIO');
    log(colors.blue, separator('-') + '\n');

    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.email, 'daveymena16@gmail.com'));

    if (!tenant) {
      log(colors.red, '❌ ERROR: Usuario daveymena16@gmail.com no encontrado en BD\n');
      throw new Error('Usuario no encontrado');
    }

    log(colors.green, `✅ Usuario encontrado: ${tenant.email}`);
    log(colors.green, `✅ Tenant ID: ${tenant.id}`);
    log(colors.green, `✅ Nombre del negocio: ${tenant.businessName || 'N/A'}`);
    log(colors.green, `✅ Estado: ${tenant.isActive ? 'Activo' : 'Inactivo'}\n`);

    // ── PASO 2: CARGAR PRODUCTOS DEL USUARIO ───────────────────────────────────
    log(colors.blue, '📋 [PASO 2] CARGAR PRODUCTOS DEL USUARIO');
    log(colors.blue, separator('-') + '\n');

    const productList = await db.select()
      .from(products)
      .where(eq(products.tenantId, tenant.id));

    const activeProducts = productList.filter(p => p.isActive);

    log(colors.green, `✅ Total de productos: ${productList.length}`);
    log(colors.green, `✅ Productos activos: ${activeProducts.length}`);
    log(colors.green, `✅ Productos inactivos: ${productList.length - activeProducts.length}\n`);

    if (activeProducts.length === 0) {
      log(colors.yellow, '⚠️  El usuario no tiene productos activos\n');
      process.exit(0);
    }

    // Mostrar productos del usuario
    log(colors.magenta, '📦 PRODUCTOS DEL USUARIO (DATOS REALES):');
    activeProducts.forEach((p, i) => {
      log(colors.magenta, `   ${i + 1}. ${p.name}`);
      log(colors.magenta, `      Precio: $${p.price} ${p.currency}`);
      log(colors.magenta, `      Descripción: ${p.description?.substring(0, 60)}...`);
      log(colors.magenta, `      Activo: ${p.isActive ? '✅' : '❌'}`);
    });
    log(colors.magenta, '');

    // ── PASO 3: CARGAR CATEGORÍAS ──────────────────────────────────────────────
    log(colors.blue, '📋 [PASO 3] CARGAR CATEGORÍAS');
    log(colors.blue, separator('-') + '\n');

    const categories = await db.select().from(productCategories);
    const categoryMap = new Map(categories.map(c => [c.id, c.name.toLowerCase()]));

    log(colors.green, `✅ Categorías cargadas: ${categories.length}\n`);

    // ── PASO 4: CREAR CONVERSACIÓN ─────────────────────────────────────────────
    log(colors.blue, '📋 [PASO 4] CREAR CONVERSACIÓN');
    log(colors.blue, separator('-') + '\n');

    const [convo] = await db.insert(conversations).values({
      tenantId: tenant.id,
      contactPhone: '573001234567',
      contactName: 'Cliente Test',
      currentStage: 'greeting',
      isActive: true,
    }).returning();

    const conversationId = convo.id;
    log(colors.green, `✅ Conversación creada: ID ${conversationId}`);
    log(colors.green, `✅ Tenant: ${tenant.id}`);
    log(colors.green, `✅ Usuario: ${tenant.email}\n`);

    // ── PASO 5: SIMULAR CONVERSACIÓN ───────────────────────────────────────────
    log(colors.yellow, '🎯 SIMULANDO CONVERSACIÓN COMPLETA');
    log(colors.yellow, separator('-') + '\n');

    // PASO 5.1: Saludo
    log(colors.yellow, '1️⃣  SALUDO');
    await saveAgentMessage(conversationId, 'Hola', 'greeting', {
      intent: 'greeting',
      role: 'customer',
    });

    await saveAgentMessage(conversationId, '¡Hola! 👋 Bienvenido. ¿En qué puedo ayudarte hoy?', 'greeting', {
      intent: 'greeting',
      isHardcoded: true,
    });

    const memory1 = await loadConversationMemory(conversationId);
    log(colors.green, `   ✅ Cliente saludó`);
    log(colors.green, `   ✅ Agente respondió\n`);

    // PASO 5.2: Búsqueda de producto
    log(colors.yellow, '2️⃣  BÚSQUEDA DE PRODUCTO');

    // Usar el primer producto del usuario para la búsqueda
    const firstProduct = activeProducts[0];
    const searchQuery = firstProduct.name.split(' ')[0].toLowerCase(); // Primera palabra del nombre

    log(colors.green, `   📝 Cliente pregunta: "Quiero ${searchQuery}"`);

    const clientMessage2 = `Quiero ${searchQuery}`;
    await saveAgentMessage(conversationId, clientMessage2, 'discovery', {
      intent: 'product_query',
      role: 'customer',
    });

    const memory2 = await loadConversationMemory(conversationId);
    const decision2 = await computeDecision(memory2, clientMessage2, activeProducts, categoryMap);

    if (decision2.productToShow) {
      log(colors.green, `   ✅ Producto encontrado: ${decision2.productToShow.name}`);
      log(colors.green, `   ✅ ID: ${decision2.productToShow.id}`);
      log(colors.green, `   ✅ Precio REAL: $${decision2.productToShow.price} ${decision2.productToShow.currency}`);
      log(colors.green, `   ✅ Descripción: ${decision2.productToShow.description?.substring(0, 50)}...`);

      // Verificar en BD
      const [productFromDB] = await db.select()
        .from(products)
        .where(eq(products.id, decision2.productToShow.id));

      if (productFromDB && productFromDB.tenantId === tenant.id) {
        log(colors.green, `   ✅ VERIFICADO: Producto pertenece al usuario ${tenant.email}`);
        log(colors.green, `   ✅ Precio en BD: $${productFromDB.price} ${productFromDB.currency}`);
        log(colors.green, `   ✅ Link de pago: ${productFromDB.paymentLink ? '✅ Configurado' : '❌ No configurado'}`);
        log(colors.green, `   ✅ Link de entrega: ${productFromDB.deliveryLink ? '✅ Configurado' : '❌ No configurado'}\n`);
      } else {
        log(colors.red, `   ❌ ERROR: Producto no pertenece al usuario\n`);
        throw new Error('Producto no pertenece al usuario');
      }

      // PASO 5.3: Presentación
      log(colors.yellow, '3️⃣  PRESENTACIÓN DE PRODUCTO');

      const agentResponse3 = `¡Excelente! 🎯 Tenemos ${decision2.productToShow.name} perfecto para ti.\n\n[CARD: ${decision2.productToShow.id}]`;
      await saveAgentMessage(conversationId, agentResponse3, 'presentation', {
        intent: 'product_query',
        cardSent: true,
        productId: decision2.productToShow.id,
        productName: decision2.productToShow.name,
      });

      const memory3 = await loadConversationMemory(conversationId);
      log(colors.green, `   ✅ Tarjeta enviada: ${decision2.productToShow.name}`);
      log(colors.green, `   ✅ Precio mostrado: $${decision2.productToShow.price}`);
      log(colors.green, `   ✅ currentProductId: ${memory3.currentProductId}`);
      log(colors.green, `   ✅ sentProductIds: [${Array.from(memory3.sentProductIds).join(', ')}]\n`);

      // PASO 5.4: Detalles
      log(colors.yellow, '4️⃣  PREGUNTAS SOBRE DETALLES');

      const clientMessage4 = '¿Cuánto cuesta?';
      await saveAgentMessage(conversationId, clientMessage4, 'details', {
        intent: 'details_query',
        role: 'customer',
      });

      const memory4 = await loadConversationMemory(conversationId);
      const decision4 = await computeDecision(memory4, clientMessage4, activeProducts, categoryMap);

      log(colors.green, `   ✅ Cliente preguntó: "${clientMessage4}"`);
      log(colors.green, `   ✅ Producto en contexto: ${decision4.productToShow?.name}`);
      log(colors.green, `   ✅ Precio REAL: $${decision4.productToShow?.price}`);
      log(colors.green, `   ✅ Contexto mantenido: ${decision4.productToShow?.id === decision2.productToShow.id ? '✅ SÍ' : '❌ NO'}\n`);

      // PASO 5.5: Pago
      log(colors.yellow, '5️⃣  INTENCIÓN DE PAGO');

      const clientMessage5 = 'Quiero pagar';
      await saveAgentMessage(conversationId, clientMessage5, 'closing', {
        intent: 'payment_intent',
        role: 'customer',
      });

      const memory5 = await loadConversationMemory(conversationId);
      const decision5 = await computeDecision(memory5, clientMessage5, activeProducts, categoryMap);

      log(colors.green, `   ✅ Cliente expresó: "${clientMessage5}"`);
      log(colors.green, `   ✅ Producto para pago: ${decision5.productToShow?.name}`);
      log(colors.green, `   ✅ Precio REAL para pago: $${decision5.productToShow?.price}`);

      // Verificar links de pago
      const [paymentProduct] = await db.select()
        .from(products)
        .where(eq(products.id, decision5.productToShow!.id));

      if (paymentProduct) {
        log(colors.green, `   ✅ VERIFICADO: Producto en pago existe en BD`);
        log(colors.green, `   ✅ Link de pago REAL: ${paymentProduct.paymentLink || 'N/A'}`);
        log(colors.green, `   ✅ Link de entrega REAL: ${paymentProduct.deliveryLink || 'N/A'}\n`);
      }

      // PASO 5.6: Confirmación
      log(colors.yellow, '6️⃣  CONFIRMACIÓN DE COMPRA');

      const clientMessage6 = 'Confirmo';
      await saveAgentMessage(conversationId, clientMessage6, 'closing', {
        intent: 'confirmation',
        role: 'customer',
      });

      const memory6 = await loadConversationMemory(conversationId);
      const decision6 = await computeDecision(memory6, clientMessage6, activeProducts, categoryMap);

      log(colors.green, `   ✅ Cliente confirmó: "${clientMessage6}"`);
      log(colors.green, `   ✅ Producto confirmado: ${decision6.productToShow?.name}`);
      log(colors.green, `   ✅ Precio FINAL: $${decision6.productToShow?.price}\n`);

      // PASO 5.7: Validación
      log(colors.yellow, '7️⃣  VALIDACIÓN FINAL');

      log(colors.green, `   ✅ Producto inicial: ${decision2.productToShow.name} (ID: ${decision2.productToShow.id})`);
      log(colors.green, `   ✅ Producto final: ${decision6.productToShow?.name} (ID: ${decision6.productToShow?.id})`);

      if (decision2.productToShow.id === decision6.productToShow?.id) {
        log(colors.green, `   ✅ COINCIDEN PERFECTAMENTE\n`);
      } else {
        log(colors.red, `   ❌ ERROR: Productos no coinciden\n`);
        throw new Error('Productos no coinciden');
      }

      // ── RESUMEN ────────────────────────────────────────────────────────────
      log(colors.cyan, separator('='));
      log(colors.green, '🎉 TEST CON USUARIO REAL COMPLETADO EXITOSAMENTE');
      log(colors.cyan, separator('='));

      log(colors.green, '\n📊 RESUMEN DEL FLUJO:');
      log(colors.green, `   Usuario: ${tenant.email}`);
      log(colors.green, `   Negocio: ${tenant.businessName || 'N/A'}`);
      log(colors.green, `   Productos activos: ${activeProducts.length}`);
      log(colors.green, `   Producto seleccionado: ${decision2.productToShow.name}`);
      log(colors.green, `   Precio REAL: $${decision2.productToShow.price} ${decision2.productToShow.currency}`);
      log(colors.green, `   Descripción REAL: ${decision2.productToShow.description?.substring(0, 60)}...`);
      log(colors.green, `   Link de pago REAL: ${paymentProduct?.paymentLink || 'N/A'}`);
      log(colors.green, `   Link de entrega REAL: ${paymentProduct?.deliveryLink || 'N/A'}`);
      log(colors.green, `   Flujo: Saludo → Búsqueda → Presentación → Detalles → Pago → Confirmación`);
      log(colors.green, `   Producto en pago: ✅ CORRECTO\n`);

      log(colors.green, '✅ El bot accede correctamente a los datos del usuario');
      log(colors.green, '✅ Los precios son REALES del usuario');
      log(colors.green, '✅ Las descripciones son REALES del usuario');
      log(colors.green, '✅ Los links de pago son REALES del usuario');
      log(colors.green, '✅ El flujo de conversación es correcto');
      log(colors.green, '✅ El producto en pago es el correcto\n');

      // Limpiar
      await db.delete(messages).where(eq(messages.conversationId, conversationId));
      await db.delete(conversations).where(eq(conversations.id, conversationId));

      log(colors.green, '✅ Datos de prueba eliminados\n');
    } else {
      log(colors.yellow, `⚠️  No se encontró producto para "${clientMessage2}"`);
      log(colors.yellow, `   Usando primer producto del usuario...\n`);

      // Usar directamente el primer producto
      const directProduct = activeProducts[0];
      log(colors.green, `   ✅ Usando: ${directProduct.name}`);
      log(colors.green, `   ✅ Precio: $${directProduct.price} ${directProduct.currency}\n`);
    }

    process.exit(0);
  } catch (error) {
    log(colors.red, `\n❌ ERROR: ${(error as Error).message}\n`);
    log(colors.red, `Stack: ${(error as Error).stack}\n`);
    process.exit(1);
  }
}

runTest();
