import { describe, it, expect } from "vitest";
import { notasParaElProveedor } from "../dropi-directo";

describe("notas del pedido a Dropi: la talla primero y visible", () => {
  it("WhatsApp", () => {
    expect(notasParaElProveedor("Talla/variante: m · Frente al parque | Pedido tomado por VentasPro")).toBe("TALLA: M | Frente al parque | Pedido tomado por VentasPro");
  });
  it("landing con talla y color", () => {
    expect(notasParaElProveedor("Pedido desde la landing x · Talla: L · Color: negro")).toBe("TALLA: L — COLOR: NEGRO | Pedido desde la landing x");
  });
  it("sin variante no cambia nada", () => {
    expect(notasParaElProveedor("Casa azul", "123")).toBe("Casa azul | Documento: 123");
  });
});
