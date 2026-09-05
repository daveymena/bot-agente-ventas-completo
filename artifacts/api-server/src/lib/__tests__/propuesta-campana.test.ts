import { describe, expect, it } from "vitest";
import { generarPropuestaDeCampana } from "../propuesta-campana";

const CURSO = {
  id: 14,
  name: "Inteligencia Artificial 2026: Herramientas + Agentes Autónomos",
  description: "Curso digital sobre herramientas de inteligencia artificial y agentes autónomos.",
  features: ["🤖 Herramientas de IA", "🔗 Agentes autónomos", "📚 Contenido digital"],
  price: 60000,
  currency: "COP",
  kind: "digital",
};

describe("generarPropuestaDeCampana", () => {
  it("entrega una propuesta completa sin crear ni prometer una campaña", () => {
    const propuesta = generarPropuestaDeCampana(CURSO, "trafico");

    expect(propuesta.variantes).toHaveLength(3);
    expect(propuesta.texto).toContain("Propuesta de campaña");
    expect(propuesta.texto).toContain("$60.000 COP");
    expect(propuesta.texto).toContain("No se creó ningún borrador ni campaña");
    expect(propuesta.destino).toContain("Web");
  });

  it("conserva las características reales y no inventa urgencia o prueba social", () => {
    const propuesta = generarPropuestaDeCampana(CURSO);

    expect(propuesta.texto).toContain("🤖 Herramientas de IA");
    expect(propuesta.texto).not.toMatch(/cupos|últimos|descuento|miles de|garantizado/i);
  });

  it("adapta el destino y la acción cuando el objetivo son mensajes", () => {
    const propuesta = generarPropuestaDeCampana(CURSO, "mensajes");

    expect(propuesta.destino).toContain("WhatsApp");
    expect(propuesta.variantes[0]?.cta).toContain("WhatsApp");
  });
});
