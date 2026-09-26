import { describe, it, expect } from "vitest";
import {
  generarHipotesis,
  validarHipotesis,
  derivarPatronesDelHistorial,
  construirPerfilDeCliente,
  especularYValidar,
  simularEspeculacionEnHistorial,
} from "./especulador";

describe("especulador", () => {
  it("genera hipótesis precio cuando cliente pregunta por precio", () => {
    const historico = [
      { role: "customer", content: "¿Cuánto cuesta?" },
    ];

    const hipotesis = generarHipotesis(historico, ["precio"], 2);

    expect(hipotesis.intent).toMatch(/precio|descuento|alternativa_economica/);
    expect(hipotesis.probabilidad).toBeGreaterThan(50);
  });

  it("genera hipótesis garantía cuando cliente pregunta por garantía", () => {
    const historico = [
      { role: "customer", content: "¿Qué garantía tiene?" },
    ];

    const hipotesis = generarHipotesis(historico, ["garantia"], 2);

    expect(hipotesis.intent).toContain("garantia");
  });

  it("genera hipótesis envío cuando cliente pregunta por entrega", () => {
    const historico = [
      { role: "customer", content: "¿Cuándo me llega?" },
    ];

    const hipotesis = generarHipotesis(historico, ["envio"], 2);

    expect(hipotesis.intent).toMatch(/tracking|envio/);
  });

  it("valida hipótesis correcta", () => {
    const hipotesis = {
      intent: "descuento",
      tema: "Va a pedir descuento",
      descripcion: "test",
      probabilidad: 65,
      razonamiento: "test",
      respuestaAnticipada: "Si pides descuento...",
      alternativas: [],
    };

    const mensajeReal = "¿Hay descuento?";

    const validacion = validarHipotesis(hipotesis, mensajeReal);

    expect(validacion.acerto).toBe(true);
    expect(validacion.aprendizaje).toContain("confirmado");
  });

  it("valida hipótesis incorrecta", () => {
    const hipotesis = {
      intent: "descuento",
      tema: "Va a pedir descuento",
      descripcion: "test",
      probabilidad: 65,
      razonamiento: "test",
      respuestaAnticipada: "Si pides...",
      alternativas: [],
    };

    const mensajeReal = "¿Qué color tiene?";

    const validacion = validarHipotesis(hipotesis, mensajeReal);

    expect(validacion.acerto).toBe(false);
    expect(validacion.razonPorQueFallo).toBeTruthy();
  });

  it("deriva patrones de historial de validaciones", () => {
    const validaciones = [
      {
        hipotesis: { intent: "descuento", tema: "test", descripcion: "", probabilidad: 65, razonamiento: "", respuestaAnticipada: "", alternativas: [] },
        mensajeReal: "¿Hay descuento?",
        acerto: true,
        proximoTema: "descuento",
      } as any,
      {
        hipotesis: { intent: "descuento", tema: "test", descripcion: "", probabilidad: 65, razonamiento: "", respuestaAnticipada: "", alternativas: [] },
        mensajeReal: "¿Hay descuento?",
        acerto: true,
        proximoTema: "descuento",
      } as any,
      {
        hipotesis: { intent: "garantia", tema: "test", descripcion: "", probabilidad: 58, razonamiento: "", respuestaAnticipada: "", alternativas: [] },
        mensajeReal: "¿Hay color azul?",
        acerto: false,
        proximoTema: "color",
      } as any,
    ];

    const patrones = derivarPatronesDelHistorial(validaciones);

    expect(patrones.length).toBeGreaterThan(0);
    expect(patrones[0].frecuencia).toBeGreaterThan(1);
  });

  it("construye perfil de cliente", () => {
    const validaciones = [
      {
        hipotesis: { intent: "descuento", tema: "test", descripcion: "", probabilidad: 65, razonamiento: "", respuestaAnticipada: "", alternativas: [] },
        mensajeReal: "¿Hay descuento?",
        acerto: true,
        proximoTema: "descuento",
      } as any,
    ];

    const patrones = [
      {
        nombre: "patron_descuento",
        descripcion: "Cliente pide descuento",
        disparadores: ["precio"],
        proximoComportamiento: "descuento",
        frecuencia: 5,
        confianza: 75,
        ejemplos: ["¿Hay descuento?"],
      },
    ];

    const perfil = construirPerfilDeCliente(["precio"], validaciones, patrones);

    expect(perfil.tags).toContain("precio");
    expect(perfil.tasaAciertoPromedio).toBeGreaterThan(0);
    expect(perfil.patronesDetectados.length).toBeGreaterThan(0);
  });

  it("especula y valida en ciclo", () => {
    const historico = [
      { role: "customer", content: "¿Cuánto cuesta?" },
      { role: "assistant", content: "El precio es $100" },
    ];

    const resultado = especularYValidar(historico, ["precio"], 2);

    expect(resultado.hipotesis).toBeTruthy();
    expect(resultado.hipotesis.intent).toBeTruthy();
    expect(resultado.respuestaAnticipada).toBeTruthy();
  });

  it("simula especulación en historial", () => {
    const mensajes = [
      { role: "customer", content: "¿Cuánto cuesta?" },
      { role: "assistant", content: "El precio es $100" },
      { role: "customer", content: "¿Hay descuento?" },
      { role: "assistant", content: "Tengo opciones..." },
      { role: "customer", content: "OK, dale" },
    ];

    const resultado = simularEspeculacionEnHistorial(mensajes, ["precio"]);

    expect(resultado.total).toBeGreaterThan(0);
    expect(resultado.tasaAcierto).toBeGreaterThanOrEqual(0);
    expect(resultado.tasaAcierto).toBeLessThanOrEqual(100);
  });

  it("tasa acierto alta en historial con patrones claros", () => {
    const mensajes = [
      { role: "customer", content: "¿Cuánto cuesta?" },
      { role: "assistant", content: "$100" },
      { role: "customer", content: "¿Hay descuento?" },
      { role: "assistant", content: "Sí" },
      { role: "customer", content: "¿Garantía?" },
      { role: "assistant", content: "2 años" },
    ];

    const resultado = simularEspeculacionEnHistorial(mensajes, ["precio", "garantia"]);

    expect(resultado.tasaAcierto).toBeGreaterThanOrEqual(50);
  });
});
