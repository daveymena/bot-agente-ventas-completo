import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, conversations, messages, products } from "@workspace/db";
import {
  loadConversationMemory,
  computeDecision,
  saveCustomerMessage,
  saveAgentMessage,
  tryHardcodedAnswer,
  tryPaymentSubIntentAnswer,
  detectChosenPaymentMethod,
} from "../conversation-engine";

/**
 * ¿Sirve este bot para un negocio que NO es el que lo vio nacer?
 *
 * El SaaS se vende a "cualquier tipo de negocio", y el motor se escribió
 * atendiendo a UNO: cursos digitales, en Colombia, cobrando por Nequi. Cada
 * supuesto de ese negocio que quedó escrito a mano es un cliente nuevo
 * recibiendo una respuesta falsa dicha con tono de dato verificado -- que es
 * la peor forma de equivocarse frente a alguien que está por pagar.
 *
 * Buscarlos de a uno con grep ya encontró cuatro (`Nequi/Daviplata` en dos
 * funciones distintas, "100% digital", "el curso"). Esta prueba los busca de
 * la única forma que los encuentra TODOS: montando un negocio distinto y
 * teniendo una conversación de venta entera con él.
 *
 * El negocio de prueba es deliberadamente lo opuesto en las cuatro
 * dimensiones que importan:
 *
 *              este negocio        el que vio nacer el motor
 *   producto   físico              digital
 *   país       México              Colombia
 *   moneda     MXN                 COP
 *   cobro      Mercado Pago/SPEI   Nequi/Daviplata
 */

// Lo que NUNCA debería aparecer en un mensaje a un cliente de este negocio.
const PALABRAS_DE_OTRO_NEGOCIO = [
  "Nequi",
  "Daviplata",
  "el curso",
  "100% digital",
  "Google Drive",
  "sin descargas",
  "TecnoVariedades",
];

function sinRastrosDeOtroNegocio(texto: string, donde: string) {
  for (const palabra of PALABRAS_DE_OTRO_NEGOCIO) {
    expect(texto.toLowerCase(), `${donde} le nombra "${palabra}" a un negocio que no lo usa`)
      .not.toContain(palabra.toLowerCase());
  }
}

/** El perfil que tendría cargado una tienda de mochilas en México. */
const NEGOCIO_MEXICANO = {
  entrega: { metodo: "paquetería", plazo: "en 3 a 5 días hábiles", confirmado: true },
  garantia: { texto: "30 días por defectos de fábrica", confirmado: true },
  acceso: { tipo: "envío a domicilio", confirmado: true },
} as any;

const COBROS_MEXICANOS = {
  number: "5512345678",
  owner: "Mochilas del Norte SA de CV",
  billeteras: ["Mercado Pago", "SPEI"],
};

describe("Un negocio distinto: mochilas físicas, en México, cobrando en MXN", () => {
  let conversationId: number;
  let productList: any[];

  beforeEach(async () => {
    await db.insert(products).values({
      tenantId: 1,
      name: "Mochila Antirrobo Impermeable",
      description: "Mochila con compartimento acolchado para laptop y cierre oculto",
      price: "890",
      currency: "MXN",
      category: "mochilas",
      kind: "physical",
      isActive: true,
      features: ["Impermeable", "Compartimento para laptop 15\"", "Cierre antirrobo"],
    }).returning();

    const [convo] = await db.insert(conversations).values({
      tenantId: 1,
      contactPhone: "525512345678",
      contactName: "Lucía",
      currentStage: "greeting",
      isActive: true,
    }).returning();
    conversationId = convo.id;

    productList = await db.select().from(products).where(eq(products.isActive, true));
  });

  afterEach(async () => {
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
    await db.delete(conversations).where(eq(conversations.id, conversationId));
  });

  it("encuentra el producto físico cuando la clienta lo nombra", async () => {
    const memoria = await loadConversationMemory(conversationId);
    const d = await computeDecision(memoria, "hola, me interesa la mochila antirrobo", productList, new Map());
    expect(d.productoDelMensaje?.name).toMatch(/mochila/i);
  });

  it("al preguntar por el ENVÍO no le dice que la entrega es digital", async () => {
    // El bug que motivó esta prueba: a alguien preguntando por el envío de una
    // mochila, el motor le contestaba "la entrega es *100% digital*".
    const r = tryHardcodedAnswer(
      "cuánto tarda el envío?",
      "Mochila Antirrobo Impermeable",
      undefined,
      NEGOCIO_MEXICANO,
    );
    if (r) {
      sinRastrosDeOtroNegocio(r.response, "la respuesta de entrega");
      expect(r.response).toContain("paquetería");
    }
    // Si devuelve null está BIEN: significa que no tenía el dato y deja que
    // conteste la IA, que sí tiene el perfil del negocio.
  });

  it("al preguntar cómo pagar no la manda a una app que en México no existe", () => {
    const r = tryPaymentSubIntentAnswer(
      "cómo te pago?",
      "Lucía",
      "Mochila Antirrobo Impermeable",
      COBROS_MEXICANOS,
    );
    expect(r?.matched).toBe(true);
    sinRastrosDeOtroNegocio(r!.response, "la respuesta de pago");
  });

  it("si elige transferencia, le nombra SUS medios", () => {
    const r = tryPaymentSubIntentAnswer(
      "prefiero transferencia",
      "Lucía",
      "Mochila Antirrobo Impermeable",
      COBROS_MEXICANOS,
    );
    expect(r!.response).toContain("Mercado Pago/SPEI");
    sinRastrosDeOtroNegocio(r!.response, "la respuesta de transferencia");
  });

  it("entiende el medio de pago mexicano cuando la clienta lo nombra", () => {
    // "te deposito por SPEI" tiene que entenderse igual que "por Nequi" en
    // Colombia. Sin esto el bot solo entiende los medios de pago de un país.
    expect(detectChosenPaymentMethod("te deposito por SPEI", COBROS_MEXICANOS.billeteras)).toBe("transferencia");
    expect(detectChosenPaymentMethod("pago con mercado pago", COBROS_MEXICANOS.billeteras)).toBe("transferencia");
  });

  it("una conversación de venta entera no filtra nada del otro negocio", async () => {
    // El recorrido real de una clienta, de principio a fin. Es la prueba que
    // encuentra lo que el grep no ve.
    const conversacion = [
      "hola",
      "me interesa la mochila antirrobo",
      "cuánto cuesta?",
      "y cuánto tarda el envío?",
      "tiene garantía?",
      "cómo te pago?",
    ];

    for (const mensaje of conversacion) {
      await saveCustomerMessage(conversationId, mensaje, "details", { intent: "details_query" });

      const fija = tryHardcodedAnswer(mensaje, "Mochila Antirrobo Impermeable", undefined, NEGOCIO_MEXICANO);
      if (fija) sinRastrosDeOtroNegocio(fija.response, `respuesta fija a "${mensaje}"`);

      const pago = tryPaymentSubIntentAnswer(mensaje, "Lucía", "Mochila Antirrobo Impermeable", COBROS_MEXICANOS);
      if (pago) sinRastrosDeOtroNegocio(pago.response, `respuesta de pago a "${mensaje}"`);

      await saveAgentMessage(conversationId, "ok", "details", { intent: "details_query" });
    }

    const memoria = await loadConversationMemory(conversationId);
    expect(memoria.messageCount).toBeGreaterThan(0);
  });

  it("sin cobros configurados no inventa un medio de pago", () => {
    // Un negocio recién dado de alta no tiene nada cargado. Ahí el bot NO
    // puede inventar: "transferencia" es cierto en cualquier país.
    const r = tryPaymentSubIntentAnswer("cómo te pago?", "Lucía", "Mochila Antirrobo Impermeable", {});
    if (r) sinRastrosDeOtroNegocio(r.response, "la respuesta sin cobros configurados");
  });
});
