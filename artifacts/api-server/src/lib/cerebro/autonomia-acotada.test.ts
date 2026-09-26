import { describe, it, expect } from "vitest";
import {
  detectarErrores,
  generarMejora,
  compararSimulaciones,
  decidirAutonomia,
} from "./autonomia-acotada";
import type { DeteccionErrores, ResultadoSimulacion } from "./tipos-autonomia";

describe("autonomia-acotada", () => {
  it("detecta errores de redacción repetitiva", async () => {
    const conversaciones = [
      {
        messages: [
          { role: "agent", content: "¿Y qué más quisiera saber?" },
          { role: "customer", content: "Precio" },
          { role: "agent", content: "¿Y qué más quisiera saber?" },
          { role: "customer", content: "Envío" },
          { role: "agent", content: "¿Y qué más quisiera saber?" },
        ],
      },
    ];

    const errores = await detectarErrores(1, conversaciones);

    expect(errores.some((e) => e.tipo === "redaccion")).toBe(true);
  });

  it("detecta errores de omisión en cliente que compara", async () => {
    const conversaciones = [
      {
        intent: "comparacion",
        messages: [
          { role: "customer", content: "¿Cuál es la diferencia?" },
          { role: "agent", content: "Tenemos dos opciones" },
          { role: "customer", content: "Pero ¿cuál es la diferencia?" },
          { role: "agent", content: "Una es más cara que la otra" },
        ],
        duration: 30,
      },
    ];

    const errores = await detectarErrores(1, conversaciones);

    expect(errores.some((e) => e.tipo === "omision")).toBe(true);
  });

  it("detecta contradicciones en la misma conversación", async () => {
    const conversaciones = [
      {
        messages: [
          { role: "agent", content: "Sí, tenemos ese producto" },
          { role: "customer", content: "¿En qué talla?" },
          { role: "agent", content: "No, no tenemos eso" },
        ],
        duration: 20,
      },
    ];

    const errores = await detectarErrores(1, conversaciones);

    expect(errores.some((e) => e.tipo === "contradiccion")).toBe(true);
  });

  it("genera mejora para error de redacción", async () => {
    const error: DeteccionErrores = {
      tipo: "redaccion",
      descripcion: "Respuestas muy repetitivas",
      severidad: "medio",
      ejemploProblema: "¿Y qué más quisiera saber?",
      ejemploCorreccion: "Varía: ¿Hay algo más?",
      frecuencia: 3,
    };

    const promptActual = "El agente siempre pregunta ¿Y qué más quisiera saber?";

    const mejora = await generarMejora(error, promptActual, null);

    expect(mejora.promptNuevo).not.toBe(promptActual);
    expect(mejora.tipo).toMatch(/tactico|operativo/);
    expect(mejora.razon).toContain("Varía");
  });

  it("compara simulaciones correctamente", () => {
    const simulaciones: ResultadoSimulacion[] = [
      {
        arquetipoId: "normal",
        arquitectoNombre: "Normal",
        tasaExitoAntes: 70,
        tasaExitoDespues: 80,
        mejora: 10,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      },
      {
        arquetipoId: "precio_sensible",
        arquitectoNombre: "Precio sensible",
        tasaExitoAntes: 60,
        tasaExitoDespues: 75,
        mejora: 15,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      },
      {
        arquetipoId: "esceptico",
        arquitectoNombre: "Escéptico",
        tasaExitoAntes: 65,
        tasaExitoDespues: 62,
        mejora: -3,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      },
    ];

    const comparacion = compararSimulaciones(simulaciones);

    expect(comparacion.arquetiposMejoraron).toContain("normal");
    expect(comparacion.arquetiposMejoraron).toContain("precio_sensible");
    expect(comparacion.arquetiposEmpeoraron).toContain("esceptico");
    expect(comparacion.sinRiesgos).toBe(false); // Hay empeoramiento
    expect(comparacion.confianzaPromedio).toBeGreaterThan(0);
  });

  it("auto-aplica si confianza > 85% y táctico", () => {
    const simulaciones: ResultadoSimulacion[] = Array(14)
      .fill(null)
      .map((_, i) => ({
        arquetipoId: `arq_${i}`,
        arquitectoNombre: `Arquetipo ${i}`,
        tasaExitoAntes: 60,
        tasaExitoDespues: 85,
        mejora: 25,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      }));

    const comparacion = compararSimulaciones(simulaciones);

    const mejora = {
      tenantId: 1,
      agentId: 1,
      tipo: "tactico" as const,
      titulo: "Test",
      descripcion: "Test",
      promptActual: "test",
      promptNuevo: "test mejorado",
      razon: "test",
      diff: { removed: ["a"], added: ["b"] },
      createdAt: new Date(),
    };

    const decision = decidirAutonomia(mejora, comparacion);

    expect(decision.decision).toBe("auto_aplicar");
  });

  it("propone +4h si confianza 70-85%", () => {
    const simulaciones: ResultadoSimulacion[] = Array(14)
      .fill(null)
      .map((_, i) => ({
        arquetipoId: `arq_${i}`,
        arquitectoNombre: `Arquetipo ${i}`,
        tasaExitoAntes: 60,
        tasaExitoDespues: 75,
        mejora: 15,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      }));

    const comparacion = compararSimulaciones(simulaciones);

    const mejora = {
      tenantId: 1,
      agentId: 1,
      tipo: "tactico" as const,
      titulo: "Test",
      descripcion: "Test",
      promptActual: "test",
      promptNuevo: "test mejorado",
      razon: "test",
      diff: { removed: ["a"], added: ["b"] },
      createdAt: new Date(),
    };

    const decision = decidirAutonomia(mejora, comparacion);

    expect(decision.decision).toBe("proponer_4h");
  });

  it("pide aprobación si hay empeoramientos", () => {
    const simulaciones: ResultadoSimulacion[] = [
      // Mejoras
      ...Array(10)
        .fill(null)
        .map((_, i) => ({
          arquetipoId: `arq_${i}`,
          arquitectoNombre: `Arquetipo ${i}`,
          tasaExitoAntes: 60,
          tasaExitoDespues: 85,
          mejora: 25,
          mensajeEjemplo: "test",
          respuestaAntes: "antes",
          respuestaDespues: "después",
        })),
      // Empeoramientos
      {
        arquetipoId: "esceptico",
        arquitectoNombre: "Escéptico",
        tasaExitoAntes: 70,
        tasaExitoDespues: 50,
        mejora: -20,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      },
    ];

    const comparacion = compararSimulaciones(simulaciones);
    expect(comparacion.arquetiposEmpeoraron.length).toBeGreaterThan(0);

    const mejora = {
      tenantId: 1,
      agentId: 1,
      tipo: "tactico" as const,
      titulo: "Test",
      descripcion: "Test",
      promptActual: "test",
      promptNuevo: "test mejorado",
      razon: "test",
      diff: { removed: ["a"], added: ["b"] },
      createdAt: new Date(),
    };

    const decision = decidirAutonomia(mejora, comparacion);

    expect(decision.decision).toBe("pedir_aprobacion");
    expect(decision.razonamiento).toContain("esceptico");
  });

  it("nunca auto-aplica cambios estratégicos", () => {
    const simulaciones: ResultadoSimulacion[] = Array(14)
      .fill(null)
      .map((_, i) => ({
        arquetipoId: `arq_${i}`,
        arquitectoNombre: `Arquetipo ${i}`,
        tasaExitoAntes: 60,
        tasaExitoDespues: 95,
        mejora: 35,
        mensajeEjemplo: "test",
        respuestaAntes: "antes",
        respuestaDespues: "después",
      }));

    const comparacion = compararSimulaciones(simulaciones);

    const mejora = {
      tenantId: 1,
      agentId: 1,
      tipo: "estrategico" as const,
      titulo: "Cambiar objetivo",
      descripcion: "Cambiar objetivo de campaña",
      promptActual: "test",
      promptNuevo: "test",
      razon: "test",
      diff: { removed: ["a"], added: ["b"] },
      createdAt: new Date(),
    };

    const decision = decidirAutonomia(mejora, comparacion);

    expect(decision.decision).toBe("pedir_aprobacion");
    expect(decision.razonamiento).toContain("estratég");
  });
});
