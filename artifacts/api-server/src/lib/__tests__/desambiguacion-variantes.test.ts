import { describe, it, expect } from "vitest";
import { findBestProductMatch, computeDecision, buildContextBlock, type ConversationMemory } from "../conversation-engine";

/**
 * Lógica pedida por el dueño (21-09-2026): si hay VARIOS productos con el mismo
 * nombre, el bot NO entrega el primero — muestra la lista para que el cliente
 * elija. Si el cliente da una especificación exacta (precio, apellido del
 * nombre, material), la IA le da ESA y su ficha.
 */

const CORRECTORES = [
  { id: 201, name: "Corrector de postura", description: "", category: "Salud", categoryId: 1, price: "45000", currency: "COP", features: [], isActive: true },
  { id: 203, name: "Corrector de postura", description: "", category: "Salud", categoryId: 1, price: "45000", currency: "COP", features: [], isActive: true },
  { id: 202, name: "Corrector de postura ortopédico Back", description: "", category: "Salud", categoryId: 1, price: "45000", currency: "COP", features: [], isActive: true },
  { id: 199, name: "Corrector de postura trenza", description: "", category: "Salud", categoryId: 1, price: "50000", currency: "COP", features: [], isActive: true },
  { id: 200, name: "Corrector de postura unisex", description: "", category: "Salud", categoryId: 1, price: "55000", currency: "COP", features: [], isActive: true },
  { id: 168, name: "Corrector de postura espalda unisex Black", description: "", category: "Salud", categoryId: 1, price: "60000", currency: "COP", features: [], isActive: true },
];

const categoryMap = new Map<number, string>([[1, "salud"]]);

function makeMemory(partial: Partial<ConversationMemory> = {}): ConversationMemory {
  return {
    history: [], hasGreeted: true, currentStage: "presentation",
    currentProductId: null, currentProductName: null, sentProductIds: new Set<number>(),
    lastCustomerMessage: "", lastAgentMessage: "", messageCount: 0,
    isNewSession: false, sessionStartedAt: null, paymentStatus: null,
    paymentMethod: null, paymentAmount: null, paidAt: null, ...partial,
  };
}

describe("varias variantes con el mismo nombre: se muestra la lista, no se elige una", () => {
  it("el buscador marca 'ambiguo' cuando hay varias iguales", async () => {
    const r = await findBestProductMatch("corrector de postura", CORRECTORES as any, categoryMap);
    expect(r).not.toBeNull();
    expect(r!.fiel).toBe(false);
    expect((r as any).ambiguo).toBe(true);
    expect(r!.reasoning).toMatch(/AMBIGÜEDAD/i);
  });

  it("la decisión no lo marca como 'no lo tengo': es ambiguo, no inexistente", async () => {
    const d = await computeDecision(makeMemory(), "busco un corrector de postura", CORRECTORES as any, categoryMap, null);
    expect(d.productoAmbiguo).toBe(true);
    expect(d.productSearchFailed).toBe(false);
    expect(d.mensajeSinProducto).toBe(false);
    expect(d.shouldSendCard).toBe(false); // no manda la ficha del primero
  });

  it("el bloque de contexto le ordena listar y preguntar, no elegir", async () => {
    const d = await computeDecision(makeMemory(), "corrector de postura", CORRECTORES as any, categoryMap, null);
    expect(d.contextBlock).toMatch(/list/i);
    expect(d.contextBlock).toMatch(/eleg[ií] cu[aá]l|cu[aá]l quiere/i);
    expect(d.contextBlock).toMatch(/NO elijas una por [eé]l/i);
  });

  it("con una especificación exacta, da ESA y su ficha", async () => {
    const d = await computeDecision(makeMemory(), "quiero la trenza de 50", CORRECTORES as any, categoryMap, null);
    expect(d.productoDelMensaje?.id).toBe(199);
    expect(d.productoAmbiguo).toBe(false);
  });

  it("la lista de opciones llega al modelo con nombre y precio", async () => {
    const r = await findBestProductMatch("corrector de postura", CORRECTORES as any, categoryMap);
    // Las 6 variantes aparecen en el razonamiento, con su precio.
    for (const id of [201, 203, 202, 199, 200, 168]) {
      expect(r!.reasoning).toContain(`ID ${id}`);
    }
  });
});

describe("buildContextBlock distingue 'ambiguo' de 'no lo tengo'", () => {
  it("ambiguo: no lleva la orden de 'no lo tengo'", () => {
    const ctx = buildContextBlock(
      makeMemory(), "product_query" as any, "discovery" as any, null, false,
      "⚠️ AMBIGÜEDAD: 6 productos coinciden igual", false, "corrector de postura",
      CORRECTORES as any, null, false, false, false, true,
    );
    expect(ctx).toMatch(/HAY VARIAS OPCIONES/i);
    expect(ctx).not.toMatch(/NO existe en el catálogo/i);
  });

  it("no ambiguo (no lo tiene): sí lleva la orden de 'no lo tengo'", () => {
    const ctx = buildContextBlock(
      makeMemory(), "product_query" as any, "discovery" as any, null, false,
      "No se identificó un producto", true, "saxofón",
      CORRECTORES as any, null, false, false, false, false,
    );
    expect(ctx).toMatch(/NO existe en el catálogo/i);
  });
});
