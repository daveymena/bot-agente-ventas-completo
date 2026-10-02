import { describe, it, expect } from "vitest";
import { debeInvestigarAntes, esContinuacionAutomatica } from "../investigacion-previa";

/**
 * Pedidos REALES de los diagnósticos de turno de producción (29-09-2026).
 * Los de Dropi pagaban 25–39 s de Biblioteca de Anuncios + web para una
 * respuesta que salía de Dropi, y la continuación automática re-investigaba
 * en cada vuelta.
 */
describe("¿Atlas investiga antes de pensar?", () => {
  it("NO en pedidos que nombran Dropi u otra fuente propia", () => {
    expect(debeInvestigarAntes("Hay forma de traer los producto de dropi los más vendidos y agregarlo aquí mediante su token ?")).toBe(false);
    expect(debeInvestigarAntes('Muéstrame los productos más vendidos de Dropi en la categoría salud y busca en el catálogo de Dropi "corrector de postura" con stock.')).toBe(false);
    expect(debeInvestigarAntes("cuál es el más vendido de mis productos")).toBe(false);
  });

  it("NO en la continuación automática del panel, diga lo que diga", () => {
    const vieja = "Continuá con lo que ya tenías, sin repetir lo que ya investigaste o hiciste.";
    const nueva = "Continuá con lo que ya tenías, sin repetir lo que ya hiciste.";
    expect(esContinuacionAutomatica(vieja)).toBe(true);
    expect(esContinuacionAutomatica(nueva)).toBe(true);
    expect(debeInvestigarAntes(vieja)).toBe(false);
    expect(debeInvestigarAntes(nueva)).toBe(false);
  });

  it("SÍ cuando la respuesta está afuera", () => {
    expect(debeInvestigarAntes("Realiza una indagación de los productos contraentrega que más se están vendiendo y las estrategias e imágenes que usan")).toBe(true);
    expect(debeInvestigarAntes("qué está haciendo la competencia con correctores de postura")).toBe(true);
    // Nombra Dropi pero pide competencia: es externo.
    expect(debeInvestigarAntes("investigá la competencia del corrector que tengo en Dropi")).toBe(true);
  });

  it("NO en preguntas operativas sin señal de investigación", () => {
    expect(debeInvestigarAntes("De donde sacas los copi")).toBe(false);
    expect(debeInvestigarAntes("Que capacidades tienes para anunciar ?")).toBe(false);
  });
});
