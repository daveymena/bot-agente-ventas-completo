import { describe, it, expect } from "vitest";
import { temasRespondidosPorElDueno } from "../motor";

const conocimiento = [
  { productId: 1, pregunta: "Tiene certificado", respuesta: "Sí, certificado digital." },
  { productId: 2, pregunta: "Talla disponible", respuesta: "S, M y L." },
  { productId: null, pregunta: "Horario de atención", respuesta: "Lunes a sábado." },
  { productId: 1, pregunta: "Garantía", respuesta: null },
];

describe("motor v2 — lo que el dueño dejó respondido se anuncia", () => {
  it("con producto en foco: los temas de ese producto y los generales", () => {
    expect(temasRespondidosPorElDueno(conocimiento, 1)).toEqual(["Tiene certificado", "Horario de atención"]);
  });

  it("no anuncia temas de otro producto ni los que no tienen respuesta", () => {
    const temas = temasRespondidosPorElDueno(conocimiento, 1);
    expect(temas).not.toContain("Talla disponible");
    expect(temas).not.toContain("Garantía");
  });

  it("sin conocimiento cargado no agrega nada", () => {
    expect(temasRespondidosPorElDueno([], 1)).toEqual([]);
    expect(temasRespondidosPorElDueno(undefined, null)).toEqual([]);
  });
});
