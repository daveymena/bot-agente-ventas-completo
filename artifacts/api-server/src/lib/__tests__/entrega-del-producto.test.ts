import { describe, it, expect } from "vitest";
import { pareceDigital, seDespachaPorTransportadora } from "../entrega-del-producto";

/**
 * El caso real del 2026-09-02: el bot le pidió CÉDULA, ciudad y departamento a
 * un cliente que compraba un curso de IA que llega por enlace.
 *
 * El producto estaba marcado `kind: "physical"` porque el importador de
 * WooCommerce escribía eso en todos. La bandera sola no puede ser la prueba de
 * que algo viaja en un camión.
 */
describe("No se le pide la cédula a quien compra un curso", () => {
  const CURSO_IA_MAL_MARCADO = {
    kind: "physical", // <-- el dato malo que puso el importador
    name: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
    category: "General",
    description: "3 cursos de IA en uno. MASTER EN AGENTES IA — 39 módulos en video. Acceso de por vida.",
    deliveryLink: "https://drive.google.com/drive/folders/abc123",
  };

  it("el curso del caso real no se despacha, por más que la bandera diga physical", () => {
    expect(pareceDigital(CURSO_IA_MAL_MARCADO)).toBe(true);
    expect(seDespachaPorTransportadora(CURSO_IA_MAL_MARCADO)).toBe(false);
  });

  it("y lo detecta aunque le falte el enlace de entrega", () => {
    // El nombre no dice "curso" por ningún lado: lo salva la descripción.
    const sinEnlace = { ...CURSO_IA_MAL_MARCADO, deliveryLink: null };
    expect(seDespachaPorTransportadora(sinEnlace)).toBe(false);
  });

  it("cualquier cosa que se llame curso tampoco se despacha", () => {
    for (const name of [
      "Curso de piano desde cero",
      "Masterclass de ventas",
      "Ebook de recetas",
      "Membresía anual",
    ]) {
      expect(seDespachaPorTransportadora({ kind: "physical", name }), name).toBe(false);
    }
  });
});

describe("Pero lo que SÍ se envía se sigue enviando", () => {
  it("un producto físico de verdad mantiene su flujo de datos de envío", () => {
    for (const p of [
      { kind: "physical", name: "Cojín ortopédico para moto", description: "Gel de alta densidad. Pago contra entrega." },
      { kind: "physical", name: "Báscula digital de cocina", description: "Precisión de 1g, pantalla LCD." },
      { kind: "dropshipping", name: "Reloj inteligente W26", description: "Llamadas bluetooth, resistente al agua." },
    ]) {
      expect(seDespachaPorTransportadora(p), p.name).toBe(true);
    }
  });

  it("«báscula digital» es un aparato, no un producto digital", () => {
    // Por eso "digital" a secas no entra en la lista de palabras.
    expect(pareceDigital({ kind: "physical", name: "Báscula digital de cocina" })).toBe(false);
  });
});

describe("Ante la duda, no se piden datos", () => {
  it("sin producto no hay envío que preparar", () => {
    expect(seDespachaPorTransportadora(null)).toBe(false);
    expect(seDespachaPorTransportadora(undefined)).toBe(false);
    expect(seDespachaPorTransportadora({})).toBe(false);
  });

  it("un producto sin bandera tampoco se despacha", () => {
    // El default de la base es "digital"; un kind vacío no autoriza a pedir
    // la cédula.
    expect(seDespachaPorTransportadora({ name: "Algo", kind: "" })).toBe(false);
  });
});
