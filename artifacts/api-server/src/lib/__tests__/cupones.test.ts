import { describe, expect, it } from "vitest";
import { aplicarCupon, normalizarCodigo } from "../cupones";

const hoy = new Date("2026-09-14T12:00:00Z");

describe("cupones — cálculo de descuento real, sin inventar", () => {
  it("normaliza el código que escribe el cliente", () => {
    expect(normalizarCodigo("  promo 10 ")).toBe("PROMO10");
    expect(normalizarCodigo(null)).toBe("");
  });

  it("aplica un descuento por porcentaje", () => {
    const r = aplicarCupon({ tipo: "porcentaje", valor: 20, activo: true }, { total: 100000, ahora: hoy });
    expect(r.ok).toBe(true);
    expect(r.descuento).toBe(20000);
    expect(r.precioFinal).toBe(80000);
  });

  it("aplica un descuento fijo sin pasarse del total", () => {
    const r = aplicarCupon({ tipo: "fijo", valor: 15000, activo: true }, { total: 10000, ahora: hoy });
    expect(r.ok).toBe(true);
    expect(r.descuento).toBe(10000);
    expect(r.precioFinal).toBe(0);
  });

  it("rechaza un cupón vencido con su motivo", () => {
    const r = aplicarCupon({ activo: true, tipo: "porcentaje", valor: 10, vigenciaFin: "2026-09-01T00:00:00Z" }, { total: 1000, ahora: hoy });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("venció");
  });

  it("rechaza cuando no alcanza el mínimo de compra", () => {
    const r = aplicarCupon({ activo: true, tipo: "porcentaje", valor: 10, minimoCompra: 50000 }, { total: 20000, ahora: hoy });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("mínima");
  });

  it("rechaza un cupón que no aplica a ese producto", () => {
    const r = aplicarCupon({ activo: true, tipo: "porcentaje", valor: 10, productId: 7 }, { total: 1000, productId: 9, ahora: hoy });
    expect(r.ok).toBe(false);
  });

  it("rechaza cuando se agotó el límite de usos", () => {
    const r = aplicarCupon({ activo: true, tipo: "porcentaje", valor: 10, usosMax: 3, usos: 3 }, { total: 1000, ahora: hoy });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("límite");
  });
});
