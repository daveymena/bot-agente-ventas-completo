import { describe, expect, it } from "vitest";
import { stripDiacritics, synonymsFor } from "../server/lib/synonyms";

describe("sinónimos es ⇄ en", () => {
  it("quita acentos y eñes", () => {
    expect(stripDiacritics("Montaña Río Café")).toBe("Montana Rio Cafe");
  });
  it("español → inglés y relacionados", () => {
    expect(synonymsFor("perro")).toEqual(expect.arrayContaining(["dog", "puppy", "mascota"]));
    expect(synonymsFor("café")).toContain("coffee");
  });
  it("inglés → español por la traducción principal", () => {
    expect(synonymsFor("dog")).toEqual(expect.arrayContaining(["perro", "mascota"]));
    expect(synonymsFor("cup")).toContain("taza");
    expect(synonymsFor("mug")).toContain("taza");
    expect(synonymsFor("business")).toContain("negocio");
  });
  it("no arrastra asociaciones laxas en la inversa cuando el término tiene entrada propia", () => {
    const noche = synonymsFor("noche");
    expect(noche).toContain("night");
    expect(noche).not.toContain("estrellas");
    expect(noche).not.toContain("neon");
  });
  it("nunca se incluye a sí mismo y respeta el tope de 6", () => {
    for (const t of ["ciudad", "city", "verde", "pastel", "xyz"]) {
      const s = synonymsFor(t);
      expect(s).not.toContain(t);
      expect(s.length).toBeLessThanOrEqual(6);
    }
    expect(synonymsFor("xyz")).toEqual([]);
  });
});
