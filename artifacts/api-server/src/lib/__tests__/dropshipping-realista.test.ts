import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, conversations, messages, products, productCategories } from "@workspace/db";
import {
  loadConversationMemory,
  computeDecision,
  saveAgentMessage,
  saveCustomerMessage,
  persistStage,
} from "../conversation-engine";

/**
 * Conversacion REALISTA de dropshipping: cliente llega de anuncio, pregunta
 * por un gadget, le interesa el envio contraentrega, y cierra la compra.
 */
describe("Dropshipping realista", () => {
  let conversationId: number;
  let productList: any[];
  let categoryMap: Map<number, string>;

  beforeEach(async () => {
    await db.delete(products);
    await db.delete(productCategories).where(eq(productCategories.tenantId, 1));

    await db.insert(productCategories).values({ tenantId: 1, name: "Gadgets" }).onConflictDoNothing();
    await db.insert(productCategories).values({ tenantId: 1, name: "Tecnologia" }).onConflictDoNothing();
    const cats = await db.select().from(productCategories);
    categoryMap = new Map(cats.map(c => [c.id, c.name.toLowerCase()]));
    const gadgetsId = cats.find(c => c.name === "Gadgets")?.id ?? 1;
    const techId = cats.find(c => c.name === "Tecnologia")?.id ?? 2;

    await db.insert(products).values({
      tenantId: 1, name: "Mini Licuadora Portatil USB-C",
      description: "Licuadora portatil recargable, 380ml, 6 cuchillas de acero inoxidable.",
      price: "48000", currency: "COP", category: "Gadgets", categoryId: gadgetsId,
      kind: "physical", isActive: true, features: ["380ml", "USB-C", "6 cuchillas"],
    });

    await db.insert(products).values({
      tenantId: 1, name: "Audifonos Bluetooth Pro Max",
      description: "Audifonos inalambricos con cancelacion de ruido activa, 40h de bateria.",
      price: "85000", currency: "COP", category: "Tecnologia", categoryId: techId,
      kind: "physical", isActive: true, features: ["Cancelacion de ruido", "40h bateria", "Bluetooth 5.3"],
    });

    const [convo] = await db
      .insert(conversations)
      .values({
        tenantId: 1, contactPhone: "573001234567", contactName: "Santiago",
        currentStage: "greeting", isActive: true,
      })
      .returning();

    conversationId = convo.id;
    productList = await db.select().from(products).where(eq(products.isActive, true));
  });

  afterEach(async () => {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
  });

  it("flujo completo: saludo, busca licuadora, pregunta envio, cierra con datos", async () => {
    // Turno 1: Saludo tipico de anuncio de Meta
    let memory = await loadConversationMemory(conversationId);
    let decision = await computeDecision(memory, "Hola quiero mas informacion", productList, categoryMap, null);
    expect(decision.mensajeSinProducto).toBe(true);
    await saveCustomerMessage(conversationId, "Hola quiero mas informacion", "greeting", decision);
    await saveAgentMessage(conversationId, "Hola Santiago, bienvenido. En que te puedo ayudar?", "greeting", decision);
    await persistStage(conversationId, decision.stage);

    // Turno 2: Pide el producto especifico
    memory = await loadConversationMemory(conversationId);
    decision = await computeDecision(memory, "tienen la mini licuadora portatil?", productList, categoryMap, null);
    expect(decision.intent).toBe("product_query");
    expect(decision.productoDelMensaje).not.toBeNull();
    expect(decision.productoDelMensaje?.name).toMatch(/licuadora/i);
    await saveCustomerMessage(conversationId, "tienen la mini licuadora portatil?", "product_query", decision);
    await saveAgentMessage(conversationId, "Si, Mini Licuadora Portatil USB-C, $48.000. Te interesa?", "product_query", decision);
    await persistStage(conversationId, decision.stage);

    // Turno 3: Pregunta envio y pago (el foco sigue en licuadora)
    memory = await loadConversationMemory(conversationId);
    decision = await computeDecision(memory, "cuanto tarda en llegar y como pago?", productList, categoryMap, null);
    // No nombra un producto nuevo, el foco se mantiene
    await saveCustomerMessage(conversationId, "cuanto tarda en llegar y como pago?", "details_query", decision);
    await saveAgentMessage(conversationId, "Envio en 3 a 5 dias habiles. Pago contraentrega: pagas cuando recibes. Te lo tomo?", "closing", decision);
    await persistStage(conversationId, decision.stage);

    // Turno 4: Da datos de envio y cierra
    memory = await loadConversationMemory(conversationId);
    decision = await computeDecision(
      memory, "si dale, Santiago Perez, Calle 45 12-34, El Poblado, Medellin, 3101234567, cedula 1020304050",
      productList, categoryMap, null
    );
    expect(decision.stage).toBe("closing");
    await saveCustomerMessage(conversationId, "si dale, Santiago Perez, Calle 45 12-34, El Poblado, Medellin, 3101234567, cedula 1020304050", "closing", decision);
    await saveAgentMessage(conversationId, "Listo Santiago. Tu pedido: Mini Licuadora Portatil USB-C, $48.000, contraentrega. Calle 45 12-34, El Poblado, Medellin. 3 a 5 dias habiles.", "confirmation", decision);
    await persistStage(conversationId, decision.stage);

    const mensajes = await db.select().from(messages).where(eq(messages.conversationId, conversationId));
    expect(mensajes.length).toBe(8);
    const ultimoBot = mensajes.filter((m) => m.role === "agent").pop();
    expect(ultimoBot?.content).toContain("Santiago");
    expect(ultimoBot?.content).toContain("48.000");
    expect(ultimoBot?.content).toContain("contraentrega");
  });

  it("busca audifonos y cierra la venta", async () => {
    let memory = await loadConversationMemory(conversationId);
    let decision = await computeDecision(memory, "tienen audifonos bluetooth?", productList, categoryMap, null);
    expect(decision.intent).toBe("product_query");
    expect(decision.productoDelMensaje).not.toBeNull();
    expect(decision.productoDelMensaje?.name).toMatch(/audifonos/i);
    await saveCustomerMessage(conversationId, "tienen audifonos bluetooth?", "product_query", decision);
    await saveAgentMessage(conversationId, "Si, Audifonos Bluetooth Pro Max, $85.000.", "product_query", decision);
    await persistStage(conversationId, decision.stage);

    // Cierra la venta
    memory = await loadConversationMemory(conversationId);
    decision = await computeDecision(memory, "ese quiero", productList, categoryMap, null);
    expect(decision.stage).toBe("closing");
  });

  it("foco se mantiene cuando cliente pregunta por envio", async () => {
    let memory = await loadConversationMemory(conversationId);
    let decision = await computeDecision(memory, "quiero la mini licuadora", productList, categoryMap, null);
    expect(decision.productoDelMensaje?.name).toMatch(/licuadora/i);
    await saveCustomerMessage(conversationId, "quiero la mini licuadora", "product_query", decision);
    await saveAgentMessage(conversationId, "Mini Licuadora Portatil USB-C, $48.000.", "product_query", decision);
    await persistStage(conversationId, decision.stage);

    memory = await loadConversationMemory(conversationId);
    decision = await computeDecision(memory, "cuanto demora el envio?", productList, categoryMap, null);
    expect(decision.stage).not.toBe("greeting");
  });
});
