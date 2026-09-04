import { describe, it, expect } from "vitest";
import { buildContextBlock } from "../conversation-engine";

/**
 * El perfil del negocio ya decia "el catalogo tiene digitales y fisicos,
 * fijate cual es antes de hablar de entrega". Es una instruccion BLANDA, y el
 * modelo la ignoro: con 56 productos fisicos y 84 digitales leyo la linea de
 * los digitales -- que va primera -- y se la aplico a un producto fisico.
 *
 * Caso real, conversacion 19 del 2026-08-25: al "Renovador Negro Perfecto x
 * 200ml" (un frasco que se envia por mensajeria) le prometio "acceso inmediato
 * por Google Drive". Quien pague eso espera una descarga y no recibe nada.
 *
 * Ahora la entrega se AFIRMA segun el `kind` que conoce el servidor, en vez de
 * dejar que el modelo la deduzca.
 */
const memoria: any = {
  history: [], hasGreeted: true, currentStage: "presentation",
  currentProductId: null, currentProductName: null, sentProductIds: new Set<number>(),
};

const FISICO = {
  id: 128, name: "Renovador Negro Perfecto x 200ml", price: 33000, currency: "COP",
  description: "Devuelve el negro intenso a plasticos y cauchos del vehiculo.",
  features: [], kind: "physical",
};
const DIGITAL = {
  id: 123, name: "Curso de Piano Completo", price: 20000, currency: "COP",
  description: "De cero a nivel avanzado.", features: [], kind: "digital",
};

const bloque = (p: any) =>
  buildContextBlock(memoria, "product_query" as any, "presentation" as any, p, true);

describe("la entrega se afirma segun el tipo de producto", () => {
  it("un producto FISICO no puede prometer entrega digital", () => {
    const b = bloque(FISICO);
    expect(b).toContain("PRODUCTO FÍSICO");
    expect(b).toMatch(/NUNCA digas Google Drive/);
    expect(b).toMatch(/se envía a la dirección del cliente/i);
  });

  it("un producto DIGITAL no puede prometer envio a domicilio", () => {
    const b = bloque(DIGITAL);
    expect(b).toContain("PRODUCTO DIGITAL");
    expect(b).toMatch(/NUNCA prometas envío físico/);
  });

  it("los dos tipos nunca se mezclan en el mismo bloque", () => {
    expect(bloque(FISICO)).not.toContain("PRODUCTO DIGITAL");
    expect(bloque(DIGITAL)).not.toContain("PRODUCTO FÍSICO");
  });

  it("sin kind se trata como digital, que es el default historico", () => {
    const b = bloque({ ...DIGITAL, kind: null });
    expect(b).toContain("PRODUCTO DIGITAL");
  });

  it("prohibe deducir que es el producto a partir del nombre", () => {
    // "Renovador ... 200ml" se leyo como producto para el cabello.
    expect(bloque(FISICO)).toMatch(/NO lo deduzcas del nombre/);
  });

  it("el catalogo marca cada producto como fisico o digital", () => {
    const b = buildContextBlock(
      memoria, "product_query" as any, "presentation" as any, DIGITAL, true,
      null, false, "hola", [FISICO, DIGITAL],
    );
    expect(b).toMatch(/FÍSICO \(se envía\)/);
    expect(b).toMatch(/DIGITAL \(enlace\)/);
  });
});
