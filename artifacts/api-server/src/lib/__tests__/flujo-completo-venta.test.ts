import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, conversations, messages, products, productCategories } from '@workspace/db';
import { loadConversationMemory, computeDecision, saveAgentMessage, saveCustomerMessage, persistStage } from '../conversation-engine';

/**
 * Flujo completo de venta contra el comportamiento ACTUAL del motor.
 *
 * Este test era legacy y fallaba porque esperaba que `computeDecision` pusiera
 * `productToShow` en las consultas de producto (product_query). El motor hoy
 * delega la elección de la tarjeta a la IA: para product_query devuelve
 * `productoDelMensaje` (el producto que el cliente nombró) y deja `productToShow`
 * en null. Recién en la intención de pago, con el producto en foco, `productToShow`
 * vuelve a poblarse. Se actualiza para validar ese contrato real.
 */
describe('Flujo Completo: Saludo → Búsqueda → Presentación → Pago → Venta', () => {
  let conversationId: number;
  let productList: any[];
  let categoryMap: Map<number, string>;

  beforeEach(async () => {
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

    const [convo] = await db.insert(conversations).values({
      tenantId: 1,
      contactPhone: '573001234567',
      contactName: 'Juan',
      currentStage: 'greeting',
      isActive: true,
    }).returning();

    conversationId = convo.id;

    productList = await db.select().from(products).where(eq(products.isActive, true));
    const categories = await db.select().from(productCategories);
    categoryMap = new Map(categories.map(c => [c.id, c.name.toLowerCase()]));
  });

  afterEach(async () => {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
  });

  it('detecta el saludo inicial', async () => {
    await saveCustomerMessage(conversationId, 'Hola', 'greeting', { intent: 'greeting' });
    const memory = await loadConversationMemory(conversationId);
    expect(memory.lastCustomerMessage).toBe('Hola');
    expect(memory.messageCount).toBe(1);
    expect(memory.hasGreeted).toBe(false);
  });

  it('marca saludo cuando el agente responde', async () => {
    await saveCustomerMessage(conversationId, 'Hola', 'greeting', { intent: 'greeting' });
    await saveAgentMessage(conversationId, '¡Hola Juan! 👋', 'greeting', { intent: 'greeting', isHardcoded: true });
    const memory = await loadConversationMemory(conversationId);
    expect(memory.hasGreeted).toBe(true);
  });

  it('identifica la guitarra en la búsqueda (productoDelMensaje)', async () => {
    const clientMessage = 'Quiero guitarra';
    const memory = await loadConversationMemory(conversationId);
    const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

    expect(decision.intent).toBe('product_query');
    expect(decision.productoDelMensaje).not.toBeNull();
    expect(decision.productoDelMensaje?.name).toMatch(/guitarra/i);
  });

  it('mantiene el producto en foco tras enviar la tarjeta', async () => {
    const clientMessage = 'Quiero guitarra';
    const memory = await loadConversationMemory(conversationId);
    const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

    const guitarraId = decision.productoDelMensaje?.id;
    expect(guitarraId).toBeDefined();

    await saveAgentMessage(conversationId, `[CARD: ${guitarraId}]`, 'presentation', {
      cardSent: true,
      productId: guitarraId,
      productName: decision.productoDelMensaje?.name,
    });

    const updatedMemory = await loadConversationMemory(conversationId);
    expect(updatedMemory.currentProductId).toBe(guitarraId);
    expect(updatedMemory.sentProductIds.has(guitarraId!)).toBe(true);
  });

  it('detecta intención de pago y muestra la tarjeta del producto en foco', async () => {
    const clientMessage = 'Quiero guitarra';
    const memory = await loadConversationMemory(conversationId);
    const decision = await computeDecision(memory, clientMessage, productList, categoryMap);

    const guitarraId = decision.productoDelMensaje?.id;
    await saveAgentMessage(conversationId, `[CARD: ${guitarraId}]`, 'presentation', {
      cardSent: true,
      productId: guitarraId,
      productName: decision.productoDelMensaje?.name,
    });

    const memory2 = await loadConversationMemory(conversationId);
    const decision2 = await computeDecision(memory2, 'Quiero pagar', productList, categoryMap);

    expect(decision2.intent).toBe('payment_intent');
    expect(decision2.shouldSendCard).toBe(true);
    expect(decision2.productToShow?.id).toBe(guitarraId);
    expect(decision2.productToShow?.name).toMatch(/guitarra/i);
  });

  it('procesa la confirmación de compra sobre el producto correcto', async () => {
    const memory = await loadConversationMemory(conversationId);
    const decision = await computeDecision(memory, 'Quiero guitarra', productList, categoryMap);

    const guitarraId = decision.productoDelMensaje?.id;
    await saveAgentMessage(conversationId, `[CARD: ${guitarraId}]`, 'presentation', {
      cardSent: true,
      productId: guitarraId,
      productName: decision.productoDelMensaje?.name,
    });

    const memory3 = await loadConversationMemory(conversationId);
    const decision3 = await computeDecision(memory3, 'Confirmo', productList, categoryMap);

    expect(decision3.intent).toBe('payment_intent');
    expect(decision3.productToShow?.id).toBe(guitarraId);
  });

  it('no mezcla el producto: el de pago es el que se venía hablando', async () => {
    const memory = await loadConversationMemory(conversationId);
    const decision = await computeDecision(memory, 'Quiero guitarra', productList, categoryMap);

    const guitarraId = decision.productoDelMensaje?.id;
    await saveAgentMessage(conversationId, `[CARD: ${guitarraId}]`, 'presentation', {
      cardSent: true,
      productId: guitarraId,
      productName: decision.productoDelMensaje?.name,
    });

    const memory2 = await loadConversationMemory(conversationId);
    const decision2 = await computeDecision(memory2, 'Quiero pagar', productList, categoryMap);

    expect(decision2.productToShow?.id).toBe(guitarraId);
    expect(decision2.productToShow?.name).toMatch(/guitarra/i);
  });
});
