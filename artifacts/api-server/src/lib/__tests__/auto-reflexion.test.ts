import { describe, it, expect } from "vitest";
import { esLeccionValida } from "../auto-reflexion";

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

  it("acepta una lección concreta sobre clarificar el precio (sin fabricar)", () => {
    expect(
      esLeccionValida({
        leccion: "El cliente pregunta el precio y el agente lo esquiva con rodeos",
        accion: "respondé el precio real del catálogo en el primer mensaje cuando lo pidan",
      })
    ).toBe(true);
  });
});