import { describe, expect, it } from "vitest";
import { herramientasDeLaFamilia, READ_ONLY_TOOLS } from "../app-operator";

/**
 * Atlas diseña (23-10-2026): las herramientas de diseño tienen que llegarle
 * cuando el pedido es de diseño, y NO cuando es de pauta (pesan, y el tope
 * por minuto de Groq ya está justo: el-filtro-tiene-que-filtrar.test.ts).
 */
describe("las herramientas de diseño llegan a Atlas", () => {
  it("con un pedido de diseño", () => {
    for (const pedido of ["hazme el creativo de la mochila más bonito", "cambia la letra del titular de la landing", "diseña una imagen para el anuncio"]) {
      const h = herramientasDeLaFamilia(pedido);
      expect(h, pedido).not.toBeNull();
      expect(h!.has("creativo_disenar"), pedido).toBe(true);
      expect(h!.has("landing_disenar"), pedido).toBe(true);
    }
  });

  it("no en un pedido de pauta", () => {
    const h = herramientasDeLaFamilia("publica un anuncio en facebook con 20 mil diarios");
    expect(h?.has("creativo_disenar") ?? false).toBe(false);
  });

  it("diseñar no pide permiso en cada vuelta (solo toca borradores)", () => {
    for (const t of ["creativo_ver", "creativo_disenar", "landing_ver", "landing_disenar"]) expect(READ_ONLY_TOOLS.has(t), t).toBe(true);
  });
});
