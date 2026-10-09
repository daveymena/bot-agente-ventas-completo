/**
 * 08-10-2026: el editor de landings no abría — GET /api/products devolvía 400
 * porque UNA fila mala hacía fallar el parse de TODO el listado.
 * Estos tests fijan que las filas buenas siempre llegan y la mala se salta.
 */
import { describe, it, expect } from "vitest";
import { serializarListaProductos } from "../productos-lista";

const buena = {
  id: 1, name: "Curso IA", description: "d", price: "99000", currency: "COP",
  sku: null, categoryId: null, category: null, kind: "digital",
  imageUrl: null, highlight: null, features: [], paymentLink: null,
  deliveryLink: null, isActive: true, metadata: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"), opciones: null,
};

describe("serializarListaProductos", () => {
  it("una fila mala no tumba a las buenas", () => {
    const saltadas: unknown[] = [];
    const out = serializarListaProductos(
      [buena, { ...buena, id: 2, currency: null }, { ...buena, id: 3, metadata: { videoIntro: "x" } }, buena && { ...buena, id: 4 }],
      (id) => { saltadas.push(id); },
    );
    expect(out.map((p) => p.id)).toEqual([1, 4]);
    expect(saltadas).toEqual([2, 3]);
  });
  it("lista sana pasa completa", () => {
    expect(serializarListaProductos([buena, { ...buena, id: 5 }]).map((p) => p.id)).toEqual([1, 5]);
  });
});
