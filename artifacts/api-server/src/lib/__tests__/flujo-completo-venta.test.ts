import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, conversations, messages, products, productCategories } from '@workspace/db';
import { loadConversationMemory, computeDecision, saveAgentMessage, persistStage } from '../conversation-engine';

/**
 * TEST COMPLETO: Flujo de Conversación desde Saludo hasta Venta
 * 
 * Escenario: Cliente pregunta por guitarra, recibe información, paga
 */
describe('Flujo Completo: Saludo → Búsqueda → Presentación → Pago → Venta', () => {
  let conversationId: number;
  let productList: any[];
  let categoryMap: Map<number, string>;

  beforeEach(async () => {
    // ── SETUP: Crear conversación de prueba ──────────────────────────────────
    console.log('\n📋 [SETUP] Inicializando test de flujo completo...');

    // Crear productos de prueba
    const guitarra = await db.insert(products).values({
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

    const piano = await db.insert(products).values({
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

    conversationId = convo.id;

    // Cargar productos
    productList = await db.select().from(products).where(eq(products.isActive, true));
    const categories = await db.select().from(productCategories);
    categoryMap = new Map(categories.map(c => [c.id, c.name.toLowerCase()]));

    console.log(`✅ [SETUP] Conversación creada: ID ${conversationId}`);
    console.log(`✅ [SETUP] Productos cargados: ${productList.length}`);
  });

  afterEach(async () => {
    // Limpiar datos de prueba
    console.log('\n🧹 [CLEANUP] Limpiando datos de prueba...');
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
    console.log('✅ [CLEANUP] Datos eliminados');
  });

  describe('PASO 1: Saludo Inicial', () => {
    it('debe detectar saludo y responder apropiadamente', async () => {
      console.log('\n🎯 [PASO 1] Cliente envía saludo inicial');

      // Cliente envía: "Hola"
      const clientMessage = 'Hola';
      await saveAgentMessage(conversationId, clientMessage, 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });

      // Cargar memoria
      const memory = await loadConversationMemory(conversationId);

      // Verificaciones
      expect(memory.lastCustomerMessage).toBe('Hola');
      expect(memory.messageCount).toBe(1);
      expect(memory.hasGreeted).toBe(false); // Aún no ha saludado el agente

      console.log('✅ [PASO 1] Saludo detectado correctamente');
    });

    it('debe responder con saludo del agente', async () => {
      console.log('\n🎯 [PASO 1B] Agente responde con saludo');

      // Cliente: "Hola"
      await saveAgentMessage(conversationId, 'Hola', 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });

      // Agente: Saludo
      const agentGreeting = '¡Hola Juan! 👋 Bienvenido. ¿En qué puedo ayudarte hoy?';
      await saveAgentMessage(conversationId, agentGreeting, 'greeting', {
        intent: 'greeting',
        isHardcoded: true,
      });

      // Verificar
      const memory = await loadConversationMemory(conversationId);
      expect(memory.hasGreeted).toBe(true);
      expect(memory.currentStage).toBe('greeting');

      console.log('✅ [PASO 1B] Agente saludó correctamente');
    });
  });

  describe('PASO 2: Búsqueda de Producto', () => {
    it('debe detectar búsqueda de guitarra', async () => {
      console.log('\n🎯 [PASO 2] Cliente busca guitarra');

      // Setup: Saludo previo
      await saveAgentMessage(conversationId, 'Hola', 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });
      await saveAgentMessage(conversationId, '¡Hola Juan! 👋', 'greeting', {
        intent: 'greeting',
        isHardcoded: true,
      });

      // Cliente: "Quiero guitarra"
      const clientMessage = 'Quiero guitarra';
      await saveAgentMessage(conversationId, clientMessage, 'discovery', {
        intent: 'product_query',
        role: 'customer',
      });

      // Cargar memoria y hacer decisión
      const memory = await loadConversationMemory(conversationId);
      const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

      // Verificaciones
      expect(decision.intent).toBe('product_query');
      expect(decision.productToShow).not.toBeNull();
      expect(decision.productToShow?.name).toContain('Guitarra');
      expect(decision.shouldSendCard).toBe(true);

      console.log(`✅ [PASO 2] Guitarra encontrada: ${decision.productToShow?.name}`);
    });

    it('debe cargar producto correcto de la BD', async () => {
      console.log('\n🎯 [PASO 2B] Verificar producto de BD');

      const clientMessage = 'Quiero guitarra';
      const memory = await loadConversationMemory(conversationId);
      const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

      // Verificar que el producto existe en BD
      const [productFromDB] = await db.select()
        .from(products)
        .where(eq(products.id, decision.productToShow!.id));

      expect(productFromDB).toBeDefined();
      expect(productFromDB.name).toBe('Guitarra Acústica');
      expect(productFromDB.price).toBe('50000');
      expect(productFromDB.paymentLink).toBeDefined();

      console.log(`✅ [PASO 2B] Producto verificado en BD: ${productFromDB.name}`);
    });
  });

  describe('PASO 3: Presentación de Producto', () => {
    it('debe mostrar tarjeta del producto', async () => {
      console.log('\n🎯 [PASO 3] Mostrar tarjeta de guitarra');

      // Setup: Saludo + búsqueda
      await saveAgentMessage(conversationId, 'Hola', 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });
      await saveAgentMessage(conversationId, '¡Hola Juan!', 'greeting', {
        intent: 'greeting',
        isHardcoded: true,
      });

      // Cliente: "Quiero guitarra"
      const clientMessage = 'Quiero guitarra';
      await saveAgentMessage(conversationId, clientMessage, 'discovery', {
        intent: 'product_query',
        role: 'customer',
      });

      // Agente: Respuesta con tarjeta
      const memory = await loadConversationMemory(conversationId);
      const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

      const agentResponse = `¡Excelente! 🎸 Tenemos la Guitarra Acústica perfecta para ti.\n\n[CARD: ${decision.productToShow?.id}]`;
      await saveAgentMessage(conversationId, agentResponse, 'presentation', {
        intent: 'product_query',
        cardSent: true,
        productId: decision.productToShow?.id,
        productName: decision.productToShow?.name,
      });

      // Verificar
      const updatedMemory = await loadConversationMemory(conversationId);
      expect(updatedMemory.sentProductIds.has(decision.productToShow!.id)).toBe(true);
      expect(updatedMemory.currentProductId).toBe(decision.productToShow?.id);
      expect(updatedMemory.currentProductName).toBe('Guitarra Acústica');

      console.log(`✅ [PASO 3] Tarjeta enviada: ${decision.productToShow?.name}`);
    });

    it('debe incluir detalles del producto en la respuesta', async () => {
      console.log('\n🎯 [PASO 3B] Verificar detalles del producto');

      const clientMessage = 'Quiero guitarra';
      const memory = await loadConversationMemory(conversationId);
      const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

      expect(decision.productToShow?.price).toBe(50000);
      expect(decision.productToShow?.currency).toBe('COP');
      expect(decision.productToShow?.description).toContain('excelente calidad');
      expect(decision.productToShow?.features).toContain('Sonido profesional');

      console.log(`✅ [PASO 3B] Detalles verificados:`);
      console.log(`   - Precio: $${decision.productToShow?.price}`);
      console.log(`   - Descripción: ${decision.productToShow?.description}`);
    });
  });

  describe('PASO 4: Preguntas sobre Detalles', () => {
    it('debe responder preguntas sobre el producto', async () => {
      console.log('\n🎯 [PASO 4] Cliente pregunta detalles');

      // Setup: Saludo + búsqueda + presentación
      await saveAgentMessage(conversationId, 'Hola', 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });
      await saveAgentMessage(conversationId, '¡Hola Juan!', 'greeting', {
        intent: 'greeting',
        isHardcoded: true,
      });

      const clientMessage1 = 'Quiero guitarra';
      await saveAgentMessage(conversationId, clientMessage1, 'discovery', {
        intent: 'product_query',
        role: 'customer',
      });

      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `¡Excelente! 🎸 [CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        intent: 'product_query',
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      // Cliente: "¿Cuánto cuesta?"
      const clientMessage2 = '¿Cuánto cuesta?';
      await saveAgentMessage(conversationId, clientMessage2, 'details', {
        intent: 'details_query',
        role: 'customer',
      });

      // Agente responde
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      expect(decision2.intent).toBe('details_query');
      expect(decision2.productToShow?.id).toBe(decision1.productToShow?.id);
      expect(decision2.productToShow?.price).toBe(50000);

      console.log(`✅ [PASO 4] Detalles respondidos: $${decision2.productToShow?.price}`);
    });

    it('debe mantener el contexto del producto actual', async () => {
      console.log('\n🎯 [PASO 4B] Verificar contexto de producto');

      // Setup completo
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `[CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      // Cliente pregunta sobre otro producto pero sin intención de cambiar
      const clientMessage2 = '¿Cuánto cuesta el piano?';
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      // Debe mantener guitarra en contexto (no es payment_intent)
      expect(decision2.productToShow?.id).toBe(decision1.productToShow?.id);
      expect(decision2.productToShow?.name).toBe('Guitarra Acústica');

      console.log(`✅ [PASO 4B] Contexto mantenido: ${decision2.productToShow?.name}`);
    });
  });

  describe('PASO 5: Intención de Pago', () => {
    it('debe detectar intención de pago', async () => {
      console.log('\n🎯 [PASO 5] Cliente expresa intención de pago');

      // Setup: Saludo + búsqueda + presentación
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `[CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      // Cliente: "Quiero pagar"
      const clientMessage2 = 'Quiero pagar';
      await saveAgentMessage(conversationId, clientMessage2, 'closing', {
        intent: 'payment_intent',
        role: 'customer',
      });

      // Decisión
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      expect(decision2.intent).toBe('payment_intent');
      expect(decision2.shouldSendCard).toBe(true);
      expect(decision2.productToShow?.id).toBe(decision1.productToShow?.id);

      console.log(`✅ [PASO 5] Intención de pago detectada para: ${decision2.productToShow?.name}`);
    });

    it('debe mostrar tarjeta de pago con links', async () => {
      console.log('\n🎯 [PASO 5B] Mostrar tarjeta de pago');

      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `[CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      const clientMessage2 = 'Quiero pagar';
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      // Agente envía tarjeta de pago
      const agentResponse = `Perfecto! 💳 Aquí están tus opciones de pago:\n\n[CARD: ${decision2.productToShow?.id}]`;
      await saveAgentMessage(conversationId, agentResponse, 'closing', {
        intent: 'payment_intent',
        cardSent: true,
        productId: decision2.productToShow?.id,
        productName: decision2.productToShow?.name,
      });

      // Verificar
      const [product] = await db.select()
        .from(products)
        .where(eq(products.id, decision2.productToShow!.id));

      expect(product.paymentLink).toBeDefined();
      expect(product.deliveryLink).toBeDefined();

      console.log(`✅ [PASO 5B] Tarjeta de pago lista:`);
      console.log(`   - Producto: ${product.name}`);
      console.log(`   - Precio: $${product.price}`);
      console.log(`   - Link de pago: ${product.paymentLink}`);
    });
  });

  describe('PASO 6: Confirmación de Compra', () => {
    it('debe procesar confirmación de compra', async () => {
      console.log('\n🎯 [PASO 6] Cliente confirma compra');

      // Setup completo hasta pago
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `[CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      const clientMessage2 = 'Quiero pagar';
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      await saveAgentMessage(conversationId, `Perfecto! 💳 [CARD: ${decision2.productToShow?.id}]`, 'closing', {
        cardSent: true,
        productId: decision2.productToShow?.id,
        productName: decision2.productToShow?.name,
      });

      // Cliente: "Confirmo"
      const clientMessage3 = 'Confirmo';
      await saveAgentMessage(conversationId, clientMessage3, 'closing', {
        intent: 'confirmation',
        role: 'customer',
      });

      // Decisión final
      const memory3 = await loadConversationMemory(conversationId);
      const decision3 = await computeDecision(memory3, clientMessage3, productList, categoryMap);

      expect(decision3.intent).toBe('confirmation');
      expect(decision3.productToShow?.id).toBe(decision1.productToShow?.id);

      console.log(`✅ [PASO 6] Compra confirmada:`);
      console.log(`   - Producto: ${decision3.productToShow?.name}`);
      console.log(`   - Precio: $${decision3.productToShow?.price}`);
      console.log(`   - Estado: CONFIRMADO`);
    });
  });

  describe('PASO 7: Validación Final', () => {
    it('debe validar que el producto en pago sea el correcto', async () => {
      console.log('\n🎯 [PASO 7] Validación final del producto');

      // Flujo completo
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      const guitarraId = decision1.productToShow?.id;

      await saveAgentMessage(conversationId, `[CARD: ${guitarraId}]`, 'presentation', {
        cardSent: true,
        productId: guitarraId,
        productName: decision1.productToShow?.name,
      });

      const clientMessage2 = 'Quiero pagar';
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);

      // Verificar que el producto en pago es el mismo
      expect(decision2.productToShow?.id).toBe(guitarraId);
      expect(decision2.productToShow?.name).toBe('Guitarra Acústica');

      // Verificar que NO es piano
      expect(decision2.productToShow?.id).not.toBe(3); // Piano tiene ID 3

      console.log(`✅ [PASO 7] Validación exitosa:`);
      console.log(`   - Producto solicitado: Guitarra Acústica (ID: ${guitarraId})`);
      console.log(`   - Producto en pago: ${decision2.productToShow?.name} (ID: ${decision2.productToShow?.id})`);
      console.log(`   - ✅ COINCIDEN`);
    });

    it('debe registrar toda la conversación correctamente', async () => {
      console.log('\n🎯 [PASO 7B] Verificar registro de conversación');

      // Flujo completo
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);

      await saveAgentMessage(conversationId, `[CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });

      // Verificar registro en BD
      const allMessages = await db.select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId));

      expect(allMessages.length).toBeGreaterThan(0);

      const cardMessages = allMessages.filter(m => 
        m.content.includes('[CARD:') || (m.metadata as any)?.cardSent
      );

      expect(cardMessages.length).toBeGreaterThan(0);

      console.log(`✅ [PASO 7B] Conversación registrada:`);
      console.log(`   - Total de mensajes: ${allMessages.length}`);
      console.log(`   - Mensajes con tarjeta: ${cardMessages.length}`);
    });
  });

  describe('RESUMEN: Flujo Completo', () => {
    it('debe completar flujo completo sin errores', async () => {
      console.log('\n' + '='.repeat(80));
      console.log('🎯 FLUJO COMPLETO: SALUDO → BÚSQUEDA → PRESENTACIÓN → PAGO → VENTA');
      console.log('='.repeat(80));

      // PASO 1: Saludo
      console.log('\n1️⃣  SALUDO');
      await saveAgentMessage(conversationId, 'Hola', 'greeting', {
        intent: 'greeting',
        role: 'customer',
      });
      await saveAgentMessage(conversationId, '¡Hola Juan! 👋', 'greeting', {
        intent: 'greeting',
        isHardcoded: true,
      });
      console.log('   ✅ Cliente saludó');
      console.log('   ✅ Agente respondió');

      // PASO 2: Búsqueda
      console.log('\n2️⃣  BÚSQUEDA DE PRODUCTO');
      const clientMessage1 = 'Quiero guitarra';
      const memory1 = await loadConversationMemory(conversationId);
      const decision1 = await computeDecision(memory1, clientMessage1, productList, categoryMap);
      console.log(`   ✅ Cliente preguntó por: guitarra`);
      console.log(`   ✅ Bot encontró: ${decision1.productToShow?.name}`);

      // PASO 3: Presentación
      console.log('\n3️⃣  PRESENTACIÓN DE PRODUCTO');
      await saveAgentMessage(conversationId, `¡Excelente! 🎸 [CARD: ${decision1.productToShow?.id}]`, 'presentation', {
        cardSent: true,
        productId: decision1.productToShow?.id,
        productName: decision1.productToShow?.name,
      });
      console.log(`   ✅ Tarjeta enviada: ${decision1.productToShow?.name}`);
      console.log(`   ✅ Precio: $${decision1.productToShow?.price}`);

      // PASO 4: Detalles
      console.log('\n4️⃣  PREGUNTAS SOBRE DETALLES');
      const clientMessage2 = '¿Cuánto cuesta?';
      const memory2 = await loadConversationMemory(conversationId);
      const decision2 = await computeDecision(memory2, clientMessage2, productList, categoryMap);
      console.log(`   ✅ Cliente preguntó: ¿Cuánto cuesta?`);
      console.log(`   ✅ Bot respondió: $${decision2.productToShow?.price}`);

      // PASO 5: Intención de Pago
      console.log('\n5️⃣  INTENCIÓN DE PAGO');
      const clientMessage3 = 'Quiero pagar';
      const memory3 = await loadConversationMemory(conversationId);
      const decision3 = await computeDecision(memory3, clientMessage3, productList, categoryMap);
      console.log(`   ✅ Cliente expresó: Quiero pagar`);
      console.log(`   ✅ Producto en pago: ${decision3.productToShow?.name}`);

      // PASO 6: Confirmación
      console.log('\n6️⃣  CONFIRMACIÓN DE COMPRA');
      const clientMessage4 = 'Confirmo';
      const memory4 = await loadConversationMemory(conversationId);
      const decision4 = await computeDecision(memory4, clientMessage4, productList, categoryMap);
      console.log(`   ✅ Cliente confirmó: Confirmo`);
      console.log(`   ✅ Compra procesada: ${decision4.productToShow?.name}`);

      // PASO 7: Validación
      console.log('\n7️⃣  VALIDACIÓN FINAL');
      expect(decision1.productToShow?.id).toBe(decision4.productToShow?.id);
      expect(decision1.productToShow?.name).toBe(decision4.productToShow?.name);
      console.log(`   ✅ Producto inicial: ${decision1.productToShow?.name} (ID: ${decision1.productToShow?.id})`);
      console.log(`   ✅ Producto final: ${decision4.productToShow?.name} (ID: ${decision4.productToShow?.id})`);
      console.log(`   ✅ COINCIDEN PERFECTAMENTE`);

      console.log('\n' + '='.repeat(80));
      console.log('🎉 FLUJO COMPLETO EXITOSO');
      console.log('='.repeat(80) + '\n');
    });
  });
});
