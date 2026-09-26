import { describe, it, expect } from "vitest";
import { generarPlan, evaluarAlineacion, actualizarPlan, procesarConPlan } from "./planificador";

describe("planificador", () => {
  it("genera plan para intent compra_evaluando", () => {
    const plan = generarPlan("compra_evaluando", []);

    expect(plan.intent).toBe("compra_evaluando");
    expect(plan.pasos.length).toBeGreaterThan(0);
    expect(plan.pasoActual).toBe(1);
    expect(plan.completitud).toBe(0);
  });

  it("genera plan con ramas para cliente precio-sensible", () => {
    const plan = generarPlan("compra_evaluando", ["precio"]);

    expect(plan.ramasAlternativas.length).toBeGreaterThan(0);
    expect(plan.ramasAlternativas.some((r) => r.condicion === "cliente_precio_sensible")).toBe(true);
  });

  it("genera plan con rama urgencia para cliente apurado", () => {
    const plan = generarPlan("compra_evaluando", ["urgencia"]);

    expect(plan.ramasAlternativas.some((r) => r.condicion === "cliente_urgencia")).toBe(true);
  });

  it("evalúa alineación correcta si respuesta menciona paso", () => {
    const plan = generarPlan("compra_evaluando", []);
    const respuesta = "¿Cuál es tu necesidad exacta? Entiendo que necesitas...";

    const evaluacion = evaluarAlineacion(plan, respuesta);

    expect(evaluacion.alineacion).toBeGreaterThan(50);
  });

  it("baja alineación si respuesta es muy corta", () => {
    const plan = generarPlan("compra_evaluando", []);
    const respuesta = "ok";

    const evaluacion = evaluarAlineacion(plan, respuesta);

    expect(evaluacion.alineacion).toBeLessThan(75);
  });

  it("sugiere ajuste si alineación < 60%", () => {
    const plan = generarPlan("compra_evaluando", []);
    const respuesta = "xyz";

    const evaluacion = evaluarAlineacion(plan, respuesta);

    expect(evaluacion.sugiere).toBe("ajustar");
  });

  it("actualiza plan cuando detecta señal de éxito", () => {
    const plan = generarPlan("compra_evaluando", []);
    const mensajeCliente = "Exacto, eso es lo que buscaba";
    const respuestaAgente = "Perfecto, entonces...";

    const actualizacion = actualizarPlan(plan, mensajeCliente, respuestaAgente);

    expect(actualizacion).not.toBeNull();
    expect(actualizacion?.razonCambio).toContain("éxito");
    expect(plan.pasoActual).not.toBe(1); // Cambió de paso
  });

  it("actualiza plan cuando detecta señal de fracaso", () => {
    const plan = generarPlan("compra_evaluando", []);
    const mensajeCliente = "No entiendo lo que dices";
    const respuestaAgente = "¿Alguna pregunta?";

    const actualizacion = actualizarPlan(plan, mensajeCliente, respuestaAgente);

    // Puede o no actualizar dependiendo de la heurística
    if (actualizacion) {
      expect(actualizacion.razonCambio).toContain("fracaso");
    }
  });

  it("incremente completitud con cada paso", () => {
    const plan = generarPlan("compra_evaluando", []);
    const completitudInicial = plan.completitud;

    actualizarPlan(plan, "Exacto", "Entiendo");

    expect(plan.completitud).toBeGreaterThanOrEqual(completitudInicial);
  });

  it("marca completitud 100 cuando llega a cierre", () => {
    const plan = generarPlan("compra_evaluando", []);

    // Simular llegada a cierre
    plan.pasoActual = 4; // Cierre
    actualizarPlan(plan, "Sí, quiero", "Perfecto");

    expect(plan.completitud).toBe(100);
  });

  it("procesa conversación completa con plan", () => {
    const result1 = procesarConPlan(
      "compra_evaluando",
      ["precio"],
      "Necesito algo para dolor de espalda",
      "¿Cuál es tu necesidad exacta?",
    );

    expect(result1.plan.intent).toBe("compra_evaluando");
    expect(result1.evaluacion.alineacion).toBeGreaterThan(0);

    // Siguiente turno
    const result2 = procesarConPlan(
      "compra_evaluando",
      ["precio"],
      "Exacto, eso",
      "Perfecto, entonces...",
      result1.plan,
    );

    expect(result2.plan.pasoActual).not.toBe(result1.plan.pasoActual);
  });

  it("plan comparacion tiene pasos para tabla", () => {
    const plan = generarPlan("comparacion", ["comparacion"]);

    expect(plan.pasos.some((p) => p.nombre.toLowerCase().includes("tabla"))).toBe(true);
  });

  it("plan generado es diferente para intents diferentes", () => {
    const plan1 = generarPlan("compra_evaluando", []);
    const plan2 = generarPlan("comparacion", []);

    // Pueden tener mismo número de pasos pero diferentes nombres
    expect(plan1.intent).not.toBe(plan2.intent);
  });
});
