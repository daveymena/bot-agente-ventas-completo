/**
 * Landings de Landing Forge creadas antes del vínculo con VentasPro: el
 * pedido trae solo el nombre del producto. Se busca en el catálogo, pero solo
 * con una coincidencia clara: el catálogo real tiene cuatro correctores de
 * postura parecidos y despachar el equivocado es plata perdida.
 */
import { describe, it, expect } from "vitest";
import { productoPorNombre } from "../../routes/landing-forge-entrada";

const CATALOGO = [
  { id: 157, name: "Corrector de Postura Trenza" },
  { id: 156, name: "Corrector de Postura JE100055 EH" },
  { id: 155, name: "Corrector de Postura Zxf 25 Eh" },
  { id: 124, name: "Corrector de postura con varilla" },
  { id: 80, name: "CURSO INGLES OXFORD" },
];

describe("productoPorNombre", () => {
  it("el nombre exacto de la landing del corrector ZXF-25", () => {
    expect(productoPorNombre("Corrector de Postura Zxf 25 Eh", CATALOGO)?.id).toBe(155);
  });
  it("un nombre genérico que calza con varios: no adivina", () => {
    expect(productoPorNombre("Corrector de postura", CATALOGO)).toBeNull();
  });
  it("un producto que no está en el catálogo: null", () => {
    expect(productoPorNombre("Almohada cabeza bebe", CATALOGO)).toBeNull();
  });
});
