import { describe, it, expect } from "vitest";
import { planDeLaSemana, planDelMes, revisarPlan } from "../calendario-de-contenido";
import { POSTS_POR_SEMANA_MIN, VIDEOS_POR_SEMANA_MIN } from "../reglas-de-pauta";

/**
 * El plan de publicaciones que entrega una agencia el primer día.
 *
 * El admin lo pidió así: "debería darme un plan completo de publicaciones
 * orgánicas, el tiempo, todo lo que haría una agencia, ya que esto es
 * prácticamente el trabajo de una agencia".
 *
 * Lo que se prueba acá no es que el plan exista: es que CUMPLE las reglas que
 * dice cumplir. Un calendario que promete 80/20 y entrega 50/50 es peor que no
 * tener calendario — el admin lo publica confiando y el alcance se le cae sin
 * que sepa por qué.
 */
const CATALOGO = [
  { id: 124, name: "INTELIGENCIA ARTIFICIAL 2026" },
  { id: 123, name: "Curso de Piano Completo" },
  { id: 76, name: "PACK EDUCA A TU PERRO" },
];

describe("El plan cumple las reglas de agencia, no solo las nombra", () => {
  it("respeta la cadencia mínima y el mínimo de video", () => {
    const p = planDeLaSemana(1, CATALOGO);
    expect(p.piezas.length).toBeGreaterThanOrEqual(POSTS_POR_SEMANA_MIN);
    const videos = p.piezas.filter((x) => x.formato === "reel" || x.formato === "video").length;
    expect(videos).toBeGreaterThanOrEqual(VIDEOS_POR_SEMANA_MIN);
  });

  it("la regla 80/20: una sola publicación vende", () => {
    // Es la que más se incumple y la que sostiene todo lo demás. Una página
    // que vende en todas las publicaciones deja de tener alcance.
    const p = planDeLaSemana(1, CATALOGO);
    expect(p.piezas.filter((x) => x.etapa === "vender")).toHaveLength(1);
  });

  it("y sí vende una: dar sin pedir nunca tampoco vende", () => {
    for (const s of [1, 2, 3, 4]) {
      expect(planDeLaSemana(s, CATALOGO).piezas.some((x) => x.etapa === "vender"), `semana ${s}`).toBe(true);
    }
  });

  it("la pieza que atrae NO nombra el producto", () => {
    // Tiene que funcionar para alguien que no sabe que existís. Si nombra el
    // producto, es otra publicación de venta disfrazada.
    for (const s of [1, 2, 3, 4]) {
      const atraer = planDeLaSemana(s, CATALOGO).piezas.filter((x) => x.etapa === "atraer");
      for (const a of atraer) {
        expect(a.producto, `semana ${s}`).toBeUndefined();
        expect(a.queHacer).not.toMatch(/INTELIGENCIA|Piano|PERRO/);
      }
    }
  });

  it("no pone dos publicaciones el mismo día", () => {
    // Dos el mismo día compiten entre sí por el mismo alcance.
    for (const s of [1, 2, 3, 4]) {
      const dias = planDeLaSemana(s, CATALOGO, 5).piezas.map((x) => x.dia);
      expect(new Set(dias).size, `semana ${s}`).toBe(dias.length);
    }
  });

  it("rota los productos entre semanas en vez de repetir el mismo", () => {
    // Con 84 productos en el catálogo, hablar siempre del mismo desperdicia
    // el resto.
    const s1 = planDeLaSemana(1, CATALOGO).piezas.map((x) => x.producto?.id).join(",");
    const s2 = planDeLaSemana(2, CATALOGO).piezas.map((x) => x.producto?.id).join(",");
    expect(s1).not.toBe(s2);
  });

  it("sin catálogo arma el plan igual, pero NO inventa productos", () => {
    // Es el error que este proyecto más ha pagado: preferible un calendario
    // genérico a uno que se inventa lo que vende el negocio.
    const p = planDeLaSemana(1, []);
    expect(p.piezas.length).toBeGreaterThanOrEqual(POSTS_POR_SEMANA_MIN);
    expect(p.piezas.every((x) => x.producto === undefined)).toBe(true);
  });

  it("el plan del mes son cuatro semanas y todas pasan su propia revisión", () => {
    // Cuatro es lo que una agencia entrega y lo que el algoritmo necesita para
    // mostrar algo.
    const mes = planDelMes(CATALOGO);
    expect(mes).toHaveLength(4);
    for (const semana of mes) {
      const r = revisarPlan(semana);
      expect(r.problemas, `semana ${semana.semana}`).toEqual([]);
      expect(r.ok).toBe(true);
    }
  });
});

describe("La revisión detecta un plan que incumple", () => {
  it("marca vender de más", () => {
    const malo = { semana: 1, foco: "", piezas: [1, 2, 3, 4].map((d) => ({
      dia: d, diaNombre: "x", formato: "reel" as const, etapa: "vender" as const, objetivo: "", queHacer: "",
    })) };
    expect(revisarPlan(malo).problemas.join(" ")).toMatch(/1 de cada 5/);
  });

  it("marca no vender nunca", () => {
    const malo = { semana: 1, foco: "", piezas: [1, 2, 3, 4].map((d) => ({
      dia: d, diaNombre: "x", formato: "reel" as const, etapa: "educar" as const, objetivo: "", queHacer: "",
    })) };
    expect(revisarPlan(malo).problemas.join(" ")).toMatch(/Ninguna publicación pide la venta/);
  });

  it("marca la falta de video", () => {
    const malo = { semana: 1, foco: "", piezas: [1, 2, 3, 4].map((d) => ({
      dia: d, diaNombre: "x", formato: "imagen" as const, etapa: d === 1 ? ("vender" as const) : ("educar" as const), objetivo: "", queHacer: "",
    })) };
    expect(revisarPlan(malo).problemas.join(" ")).toMatch(/videos/);
  });
});
