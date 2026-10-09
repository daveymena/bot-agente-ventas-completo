import { describe, it, expect, afterEach } from "vitest";
import { promptDeToma, escenasSoraPorVideo, tomaConSora } from "../video-sora";

// 09-10-2026: Sora solo para tomas de ambiente, con tope de gasto por video.
describe("tomas con Sora", () => {
  const antes = process.env.SORA_ESCENAS_POR_VIDEO;
  afterEach(() => { if (antes === undefined) delete process.env.SORA_ESCENAS_POR_VIDEO; else process.env.SORA_ESCENAS_POR_VIDEO = antes; });

  it("el pedido es vertical, sin texto y sin mostrar el producto", () => {
    const p = promptDeToma("A woman at an office desk rubbing her neck", "¿Tensión en el cuello?");
    expect(p).toMatch(/9:16/);
    expect(p).toMatch(/No on-screen text/);
    expect(p).toMatch(/Do not show the advertised product/);
    expect(p).toContain("rubbing her neck");
  });

  it("el tope por video es 2 por defecto y nunca pasa de 4", () => {
    delete process.env.SORA_ESCENAS_POR_VIDEO;
    expect(escenasSoraPorVideo()).toBe(2);
    process.env.SORA_ESCENAS_POR_VIDEO = "10";
    expect(escenasSoraPorVideo()).toBe(4);
    process.env.SORA_ESCENAS_POR_VIDEO = "0";
    expect(escenasSoraPorVideo()).toBe(0);
  });

  it("sin descripción de toma no llama a nadie", async () => {
    expect(await tomaConSora(0, "   ", "", "x.mp4")).toBeNull();
  });
});
