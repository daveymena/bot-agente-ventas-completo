import { describe, test, expect } from "vitest";
import { lecturaDeMargen } from "../margen-de-anuncio";

describe("¿el producto aguanta publicidad?", () => {
  test("pierde plata por pedido: bloquea", () => {
    const r = lecturaDeMargen(-3000, 20000);
    expect(r.bloquea).toBe(true);
    expect(r.texto).toMatch(/pierde plata/);
  });
  test("deja ganancia: dice el costo máximo por venta y cuántas ventas diarias hacen falta", () => {
    const r = lecturaDeMargen(15000, 20000);
    expect(r.bloquea).toBe(false);
    expect(r.texto).toMatch(/como máximo \$15\.000/);
    expect(r.texto).toMatch(/al menos 2 venta/);
  });
  test("sin datos no bloquea pero lo dice", () => {
    expect(lecturaDeMargen(null, 20000)).toMatchObject({ bloquea: false });
  });
});
