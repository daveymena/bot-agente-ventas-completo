import { describe, it, expect } from "vitest";
import { esLeccionValida, indicacionesConMejora } from "../auto-reflexion";

describe("esLeccionValida (curación de auto-reflexión)", () => {
  it("rechaza una lección que sugiere inventar datos", () => {
    expect(
      esLeccionValida({
        leccion: "El agente inventa stock para generar urgencia",
        accion: "decí que queda poco aunque no lo sepas",
      })
    ).toBe(false);
  });

  it("rechaza una lección genérica de 'sé más amable'", () => {
    expect(
      esLeccionValida({ leccion: "sé más amable con los clientes", accion: "ser más amable" })
    ).toBe(false);
  });

  it("rechaza una lección demasiado corta", () => {
    expect(esLeccionValida({ leccion: "mejorar", accion: "mejorar" })).toBe(false);
  });

  it("rechaza una lección que pide exagerar beneficios", () => {
    expect(
      esLeccionValida({
        leccion: "El agente debería exagerar los beneficios del producto",
        accion: "decí que te hacés rico en una semana",
      })
    ).toBe(false);
  });

  it("acepta una lección concreta sobre responder directamente sin agregar hechos", () => {
    expect(
      esLeccionValida({
        leccion: "El cliente hace una pregunta directa y el agente la esquiva con rodeos",
        accion: "responde primero la pregunta concreta y luego plantea una sola acción siguiente",
      })
    ).toBe(true);
  });

  it("rechaza instrucciones que intenten fijar precios o stock desde la reflexión", () => {
    expect(esLeccionValida({
      leccion: "Conviene cerrar más rápido con información comercial",
      accion: "ofrece un descuento y di que quedan pocas unidades",
    })).toBe(false);
  });
});

describe("indicacionesConMejora", () => {
  it("mantiene las instrucciones del dueño y agrega un solo bloque acotado", () => {
    const r = indicacionesConMejora("Habla de usted.", "Responde primero la pregunta concreta.");
    expect(r).toContain("Habla de usted.");
    expect(r.match(/MEJORA CONTINUA AUTOMÁTICA/g)).toHaveLength(1);
  });

  it("reemplaza la mejora anterior en vez de hacer crecer el prompt cada 12 horas", () => {
    const uno = indicacionesConMejora("Habla breve.", "Haz una pregunta.");
    const dos = indicacionesConMejora(uno, "Responde primero y cierra después.");
    expect(dos).not.toContain("Haz una pregunta.");
    expect(dos.match(/MEJORA CONTINUA AUTOMÁTICA/g)).toHaveLength(1);
  });
});