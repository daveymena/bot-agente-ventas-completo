import { describe, it, expect } from "vitest";
import { sePuedeReenviar, instruccionDeDuda, fraseHablada } from "../maquetas";

/**
 * Pedido del dueño (24-09-2026): la maqueta sale UNA vez; si el cliente vuelve
 * a preguntar tiene una duda, y se razona con los datos del producto.
 */
const corrector = { id: 201, name: "Corrector de Hombros y Clavícula", description: "Neopreno acolchado, velcro ajustable, se usa debajo de la ropa.", price: 45000, currency: "COP", kind: "physical", categoria: "Salud" };
const curso = { id: 7, name: "Curso de Piano desde Cero", description: "40 lecciones en video, acceso por enlace.", price: 60000, currency: "COP", kind: "digital", categoria: "Cursos" };

describe("una maqueta no se repite: se razona", () => {
  it("ficha, info y precio NUNCA se reenvían; pago, video y tienda sí (si lo pide)", () => {
    for (const s of ["completa", "info", "precio", "entrega"]) expect(sePuedeReenviar(s)).toBe(false);
    for (const s of ["pago", "pago_transferencia", "pago_link", "video", "tienda"]) expect(sePuedeReenviar(s)).toBe(true);
  });
  it("lo que recibe el modelo: la orden de razonar la duda + los datos reales", () => {
    const t = instruccionDeDuda(corrector as any, "info", ["Entrega: 2 a 5 días hábiles, pagás al recibir"]);
    expect(t).toMatch(/DUDA/);
    expect(t).toMatch(/no inventes/i);
    expect(t).toContain("$45.000 COP");
    expect(t).toContain("Neopreno acolchado");
    expect(t).toContain("Entrega: 2 a 5 días");
  });
});

describe("la nota de voz dice lo que dice la maqueta", () => {
  it("el precio se DICE, no queda mudo", () => {
    expect(fraseHablada(corrector as any, "precio")).toBe("Corrector de Hombros y Clavícula tiene un valor de 45.000 pesos.");
  });
  it("físico y digital no se anuncian igual", () => {
    expect(fraseHablada(corrector as any, "entrega")).toMatch(/cómo te llega/);
    expect(fraseHablada(curso as any, "entrega")).toMatch(/acceso/);
    expect(fraseHablada(curso as any, "pago")).toMatch(/te llega el acceso/);
    expect(fraseHablada(corrector as any, "pago")).not.toMatch(/acceso/);
  });
});
