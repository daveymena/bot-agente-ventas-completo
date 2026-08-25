import { describe, it, expect } from "vitest";
import { detectIntent } from "../conversation-engine";

/**
 * "gracias" a secas estuvo en LEAVING_PATTERNS, asi que CUALQUIER mensaje que
 * la contuviera se leia como despedida. En Colombia casi todo cliente educado
 * cierra con "Gracias", asi que el bot despedia a gente que acababa de decir
 * que le interesaba el producto.
 *
 * Caso real, conversacion 19 del 2026-08-25: "Donde es la academia. Gracias."
 * recibio "Fue un placer atenderte". El cliente insistio y termino yendose.
 */
describe("un 'gracias' de cortesia no es una despedida", () => {
  it("responde la pregunta aunque venga con gracias (el caso que costo la venta)", () => {
    expect(detectIntent("Donde es la academia.\nGracias.")).not.toBe("leaving");
    expect(detectIntent("¿Tiene garantía? Gracias")).not.toBe("leaving");
    expect(detectIntent("¿cuanto dura el curso? gracias")).not.toBe("leaving");
  });

  it("un cliente interesado no recibe un adios", () => {
    expect(detectIntent("Me interesa el curso de piano. Gracias.")).toBe("product_query");
    expect(detectIntent("quiero info del pack de contabilidad, gracias")).not.toBe("leaving");
  });

  it("preguntar el precio con gracias sigue siendo intencion de compra", () => {
    expect(detectIntent("cuanto cuesta\nGracias.")).toBe("payment_intent");
  });

  it("el agradecimiento a secas SI sigue siendo despedida", () => {
    for (const t of [
      "gracias", "Gracias.", "muchas gracias", "mil gracias", "ok gracias",
      "listo, gracias", "¡Gracias! 🙏", "gracias, muy amable", "no gracias",
    ]) {
      expect(detectIntent(t), `"${t}" deberia ser despedida`).toBe("leaving");
    }
  });

  it("las despedidas de siempre no se tocaron", () => {
    for (const t of ["chao", "adiós", "hasta luego", "no me interesa", "Gracias por ahora no."]) {
      expect(detectIntent(t), `"${t}" deberia ser despedida`).toBe("leaving");
    }
  });
});
