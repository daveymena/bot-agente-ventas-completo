import { describe, it, expect } from "vitest";
import { aTextoPlano, pareceDocumentoDeEditor } from "../texto-plano";

describe("un documento de editor pegado no sale publicado como JSON", () => {
  const doc = { type: "doc", content: [
    { type: "paragraph", attrs: { align: null, indent: null }, content: [{ type: "text", text: "¿Tu perro destruye todo?" }] },
    { type: "paragraph", attrs: { align: null, indent: null }, content: [{ type: "text", text: "Este pack lo cambia en 21 días." }] },
  ] };
  it("objeto → texto por párrafos", () => {
    expect(aTextoPlano(doc)).toBe("¿Tu perro destruye todo?\n\nEste pack lo cambia en 21 días.");
  });
  it("JSON serializado → texto", () => {
    expect(aTextoPlano(JSON.stringify(doc))).toMatch(/^¿Tu perro destruye todo\?/);
  });
  it("el volcado aplanado que vio el dueño → quedan solo las palabras", () => {
    const t = aTextoPlano("type doc content type paragraph attrs align null indent null content type text text Curso de piano desde cero");
    expect(t).toBe("Curso de piano desde cero");
  });
  it("un texto normal no se toca", () => {
    expect(pareceDocumentoDeEditor("Hola, ¿tienes el curso?")).toBe(false);
    expect(aTextoPlano("Hola, ¿tienes el curso?")).toBe("Hola, ¿tienes el curso?");
  });
});
