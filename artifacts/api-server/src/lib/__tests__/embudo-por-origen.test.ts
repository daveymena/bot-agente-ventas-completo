import { describe, test, expect } from "vitest";
import { agruparEmbudo, describirEmbudo } from "../marketing-team/embudo-por-origen";

describe("embudo por origen y producto", () => {
  const filas = [
    { conversationId: 221, origen: "anuncio: Corrector de Hombros", producto: "sin producto", etapa: 0 },
    { conversationId: 219, origen: "anuncio: Corrector de Hombros", producto: "Corrector de postura", etapa: 1 },
    { conversationId: 300, origen: "anuncio: Corrector de Hombros", producto: "Corrector de postura", etapa: 2 },
    { conversationId: 301, origen: "orgánico", producto: "Curso de Piano", etapa: 5 },
  ];

  test("acumula cuántos llegaron a cada etapa y dónde se quedaron", () => {
    const g = agruparEmbudo(filas).find((x) => x.producto === "Corrector de postura")!;
    expect(g.llegaron).toMatchObject({ chat: 2, producto: 2, precio: 1, datos_de_pago: 0, cobrado: 0 });
    expect(g.sequedaron).toMatchObject({ producto: 1, precio: 1 });
  });

  test("el texto dice dónde se cae la mayoría", () => {
    const t = describirEmbudo(agruparEmbudo(filas));
    expect(t).toMatch(/anuncio: Corrector de Hombros · sin producto: escribió 1/);
    expect(t).toMatch(/Curso de Piano: .*cobrado 1/);
  });

  test("sin conversaciones", () => {
    expect(describirEmbudo([])).toMatch(/No hubo/);
  });
});
