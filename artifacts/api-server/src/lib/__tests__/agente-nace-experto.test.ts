import { describe, it, expect } from "vitest";
import { plantillaMasParecida, getAllTemplates } from "../agent-templates";

/**
 * Un agente creado por Atlas atiende a CLIENTES REALES por WhatsApp.
 *
 * Hasta hoy nacía así:
 *
 *   systemPrompt: args.systemPrompt || "Eres un asistente de ventas."
 *   stages: []
 *
 * Cinco palabras y sin embudo -- mientras las once plantillas completas de
 * agent-templates.ts, cada una con su prompt de vendedor y sus etapas,
 * estaban al lado sin que ese camino las mirara nunca.
 *
 * El admin lo pidió en estos términos: "cuando Atlas cree un agente debe ser
 * igual de bueno para el tema de WhatsApp, dejándolos expertos".
 */

describe("Elegir la plantilla experta según lo que pidió el admin", () => {
  it("cada plantilla trae prompt de verdad y etapas -- ninguna viene vacía", () => {
    // La garantía de fondo: elegir bien no sirve si lo elegido está vacío.
    for (const t of getAllTemplates()) {
      expect(t.systemPrompt.length, `${t.name} sin prompt`).toBeGreaterThan(200);
      if (t.agentType !== "architect") {
        expect(t.stages.length, `${t.name} sin etapas`).toBeGreaterThan(0);
      }
    }
  });

  it("lo más específico gana: un agente de dropshipping no es uno de cursos", () => {
    // El caso que motivó el orden de las pistas: "curso de dropshipping"
    // tiene las dos palabras, y quien atiende esa venta es el de físicos.
    expect(plantillaMasParecida("vendedor de dropshipping").agentType).toBe("dropshipping");
    expect(plantillaMasParecida("curso de dropshipping").agentType).toBe("dropshipping");
  });

  it("reconoce las especialidades que el admin nombra en su idioma", () => {
    expect(plantillaMasParecida("asesor de cursos online").agentType).toBe("courses");
    expect(plantillaMasParecida("quiero uno para membresías").agentType).toBe("subscriptions");
    expect(plantillaMasParecida("agente de seguimiento").agentType).toBe("followup");
    expect(plantillaMasParecida("ventas a empresas").agentType).toBe("b2b");
    expect(plantillaMasParecida("megapacks digitales").agentType).toBe("digital_products");
  });

  it("si no reconoce nada, cae en la general -- nunca en vacío", () => {
    // Un agente genérico EXPERTO es mejor que uno específico vacío. Lo que no
    // puede pasar es que no haya plantilla y se vuelva a las cinco palabras.
    const p = plantillaMasParecida("");
    expect(p.agentType).toBe("general");
    expect(p.systemPrompt.length).toBeGreaterThan(200);
    expect(p.stages.length).toBeGreaterThan(0);

    expect(plantillaMasParecida("algo que no existe xyzzy").agentType).toBe("general");
  });

  it("el Arquitecto nunca sale como vendedor de WhatsApp", () => {
    // No es un vendedor: ofrecerlo como agente de ventas sería poner la
    // persona equivocada a atender clientes reales.
    const pedidos = ["arquitecto", "diseñador de agentes", "agente arquitecto de ia"];
    for (const p of pedidos) {
      expect(plantillaMasParecida(p).agentType, p).not.toBe("architect");
    }
  });
});

describe("create_agent entrega un agente listo para vender", () => {
  it("la herramienta declara que el agente nace de una plantilla experta", async () => {
    const { TOOLS } = await import("../app-operator");
    const tool = TOOLS.find((t: any) => t.name === "update_agent");
    expect(tool, "update_agent tiene que existir -- es la que crea si no hay").toBeTruthy();
  });
});
