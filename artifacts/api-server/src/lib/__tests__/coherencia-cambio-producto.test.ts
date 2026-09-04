import { describe, it, expect } from "vitest";
import { computeDecision, type ConversationMemory } from "../conversation-engine";

/**
 * Regresión del bug de coherencia reportado en vivo (2026-08-23):
 *
 *   cliente: "forma de pago del curso de piano"  → ficha del piano
 *   cliente: "me interesa el curso de inglés"    → (el bot respondió sin ficha)
 *   cliente: "tienes el curso de idiomas?"       → (respondió sin ficha)
 *   cliente: "Si"                                → ¡el bot cobró PIANO!
 *
 * La causa: el producto que el cliente NOMBRABA (inglés/idiomas) nunca se
 * guardaba como "producto en foco" si el bot no enviaba una tarjeta en ese
 * mismo turno, así que el "Si" final volvía al producto viejo del historial.
 *
 * Este test fija el contrato del motor de decisión:
 *  1. Cuando el cliente nombra un producto NUEVO, ese producto queda como el
 *     "productoDelMensaje" (aunque sea una consulta, no un pago).
 *  2. Cuando después confirma ("Si"), la decisión de cierre usa el producto en
 *     foco correcto, no el anterior.
 */

const catalogo = [
  { id: 82, name: "Curso de Piano Completo: De Cero a Nivel Avanzado", description: "Aprende piano desde cero.", category: "Cursos", categoryId: 3, price: "60000", currency: "COP", features: [], isActive: true },
  { id: 91, name: "Curso de Inglés Completo", description: "Inglés con audios y ejercicios.", category: "Idiomas", categoryId: 4, price: "60000", currency: "COP", features: [], isActive: true },
  { id: 93, name: "Pack de Idiomas", description: "Varios idiomas juntos, de por vida.", category: "Idiomas", categoryId: 4, price: "90000", currency: "COP", features: [], isActive: true },
];

const categoryMap = new Map<number, string>([
  [3, "cursos"],
  [4, "idiomas"],
]);

function makeMemory(partial: Partial<ConversationMemory> = {}): ConversationMemory {
  return {
    history: [],
    hasGreeted: true,
    currentStage: "presentation",
    currentProductId: null,
    currentProductName: null,
    sentProductIds: new Set<number>(),
    lastCustomerMessage: "",
    lastAgentMessage: "",
    messageCount: 0,
    isNewSession: false,
    sessionStartedAt: null,
    paymentStatus: null,
    paymentMethod: null,
    paymentAmount: null,
    paidAt: null,
    ...partial,
  };
}

describe("Coherencia de producto: cambio de producto → confirmación", () => {
  it("nombra un producto nuevo y lo deja como productoDelMensaje (no se queda con el anterior)", async () => {
    const memory = makeMemory({
      currentProductId: 82, // venía hablando del piano
      currentProductName: "Curso de Piano Completo: De Cero a Nivel Avanzado",
      sentProductIds: new Set([82]),
    });

    const decision = await computeDecision(
      memory,
      "me interesa el curso de inglés",
      catalogo,
      categoryMap,
      null,
    );

    expect(decision.productoDelMensaje).not.toBeNull();
    expect(decision.productoDelMensaje?.id).toBe(91); // inglés, NO piano
    expect(decision.productoDelMensaje?.name).toContain("Inglés");
  });

  it('nombra "idiomas" y resuelve al Pack de Idiomas, no al piano', async () => {
    const memory = makeMemory({
      currentProductId: 82,
      currentProductName: "Curso de Piano Completo: De Cero a Nivel Avanzado",
      sentProductIds: new Set([82]),
    });

    const decision = await computeDecision(
      memory,
      "tienes disponible el curso de idiomas",
      catalogo,
      categoryMap,
      null,
    );

    expect(decision.productoDelMensaje?.id).toBe(93);
  });

  it('cuando el foco ya es "inglés" y el cliente dice "Si", el cierre usa inglés (no piano)', async () => {
    // Este es el estado que deja el arreglo de persistencia: tras nombrar
    // inglés, el foco quedó en 91 (aunque no se haya enviado tarjeta).
    const memory = makeMemory({
      currentProductId: 91,
      currentProductName: "Curso de Inglés Completo",
      sentProductIds: new Set([82]),
    });

    const decision = await computeDecision(memory, "Si", catalogo, categoryMap, null);

    expect(decision.intent).toBe("confirmation");
    expect(decision.shouldSendCard).toBe(true);
    expect(decision.productToShow?.id).toBe(91); // inglés, NO piano
    expect(decision.productToShow?.name).toContain("Inglés");
  });

  it('"Si" sin ningún producto en foco no inventa un producto', async () => {
    const memory = makeMemory({ currentProductId: null, sentProductIds: new Set() });

    const decision = await computeDecision(memory, "Si", catalogo, categoryMap, null);

    expect(decision.intent).toBe("confirmation");
    expect(decision.productToShow).toBeNull();
  });

  it('una consulta de detalles ("¿qué incluye?") con producto en foco NO es "mensaje sin producto"', async () => {
    // Regresión 2026-08-23: el cliente preguntaba "¿qué incluye?" sobre el curso
    // que venía viendo y el bot contestaba con el de EXCEL (otro producto del
    // catálogo). Causa: la consulta de detalles se marcaba como mensajeSinProducto
    // y la IA recibía "no asumas que sigue interesado en el producto anterior".
    const memory = makeMemory({
      currentProductId: 82,
      currentProductName: "Curso de Piano Completo: De Cero a Nivel Avanzado",
      sentProductIds: new Set([82]),
    });

    const decision = await computeDecision(memory, "¿qué incluye?", catalogo, categoryMap, null);

    expect(decision.intent).toBe("details_query");
    expect(decision.mensajeSinProducto).toBe(false);
  });
});
