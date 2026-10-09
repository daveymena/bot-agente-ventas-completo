/**
 * 09-10-2026: a mitad de una revisión de anuncios del Corrector, el panel
 * mandó la continuación automática y Atlas contestó "en este turno no está
 * disponible la consulta de campañas de Facebook". La continuación no contaba
 * como seguimiento y el turno se armaba solo con su texto.
 */
import { describe, it, expect } from "vitest";
import { textoParaElegirHerramientas, esSeguimiento } from "../texto-para-herramientas";
import { buildMcpToolRegistry } from "../opencode-mcp-tools";

const CONTINUAR = "Continuá con lo que ya tenías, sin repetir lo que ya hiciste.";
const convo = [
  { content: "revisá los anuncios del corrector de postura con varilla en facebook" },
  { content: "Voy a comparar las campañas actuales del Corrector." },
];

describe("la continuación automática trae las herramientas de lo que se venía hablando", () => {
  it("cuenta como seguimiento", () => {
    expect(esSeguimiento(CONTINUAR)).toBe(true);
  });

  it("incluye los turnos anteriores en el texto de elección", () => {
    expect(textoParaElegirHerramientas(CONTINUAR, convo)).toContain("anuncios del corrector");
  });

  it("con la conversación de Facebook, el turno lleva herramientas de Facebook", () => {
    const nombres = buildMcpToolRegistry(textoParaElegirHerramientas(CONTINUAR, convo)).map((t) => t.name);
    expect(nombres.some((n) => n.startsWith("fb_"))).toBe(true);
  });

  it("un pedido largo y nuevo sigue usando solo su propio texto", () => {
    const p = "armame una landing nueva para el producto de cocina con fotos reales";
    expect(textoParaElegirHerramientas(p, convo)).toBe(p);
  });
});
