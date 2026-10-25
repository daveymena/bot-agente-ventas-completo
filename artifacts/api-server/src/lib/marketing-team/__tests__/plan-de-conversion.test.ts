import { describe, expect, it } from "vitest";
import { economiaDeAnuncio, planDeConversion } from "../plan-de-conversion";
const base = { nombre: "Producto de prueba", descripcion: "Uso y alcance confirmados", fotos: 2, precio: 60000 };

describe("economía de anuncios sin costos inventados", () => {
  it("no presupone que un digital no tiene costos", () => {
    expect(economiaDeAnuncio(60000, null, 20000).cpaObjetivo).toBeNull();
  });
  it("calcula CPA desde contribución y beneficio, no desde CTR", () => {
    expect(economiaDeAnuncio(60000, 15000, 20000)).toMatchObject({ cpaEquilibrio: 45000, cpaObjetivo: 25000, estado: "calculado_no_validado" });
  });
  it.each([NaN, Infinity, -1])("rechaza costo inválido %s", costos => {
    expect(economiaDeAnuncio(60000, costos, 0).estado).toBe("faltan_datos");
  });
  it("no propone inversión sin margen", () => {
    expect(economiaDeAnuncio(60000, 50000, 15000)).toMatchObject({ estado: "sin_margen_publicitario", cpaObjetivo: 0 });
  });
});

describe("plan específico para el cierre del negocio", () => {
  it("contraentrega exige entrega cobrada, no pedido creado", () => {
    expect(planDeConversion({ ...base, modelo: "fisico" }).cierre.evento).toBe("pedido entregado y cobrado");
  });
  it("servicios no se cierran como cursos digitales", () => {
    const p = planDeConversion({ ...base, modelo: "servicio" });
    expect(p.cierre.evento).toBe("servicio pagado y realizado");
    expect(p.cierre.requisitos).toContain("disponibilidad");
  });
  it("cotización sin precio cerrado puede preparar prueba, sin inventar precio", () => {
    const p = planDeConversion({ ...base, modelo: "cotizacion", precio: null });
    expect(p.estado).toBe("preparar_prueba_no_validada");
    expect(p.economia.estado).toBe("faltan_datos");
  });
  it("expone ficha vacía antes de invertir", () => {
    const p = planDeConversion({ ...base, modelo: "digital", descripcion: "", fotos: 0, precio: null });
    expect(p.estado).toBe("completar_ficha");
    expect(p.faltantes).toHaveLength(3);
  });
  it("detecta promesas e instrucciones de proveedor antes de crear copy", () => {
    const p = planDeConversion({ ...base, modelo: "fisico", descripcion: "Previene la joroba. NOTA IMPORTANTE: contacto https://bit.ly/proveedor" });
    expect(p.revisionDeFicha).toHaveLength(2);
  });
  it("no llama experimento causal ni ganador a exploración de conceptos", () => {
    const p = planDeConversion({ ...base, modelo: "digital" });
    expect(p.experimento.tipo).toContain("no prueba causal");
    expect(p.conceptos).toHaveLength(3);
    expect(p.medicion.join(" ")).toContain("Baileys no acredita elegibilidad");
  });
});
