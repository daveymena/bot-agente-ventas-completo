import { describe, expect, it } from "vitest";
import { nombreDePila } from "../nombre-de-pila";

describe("el caso de producción", () => {
  it('"Duvier Mena" se saluda como "Duvier"', () => {
    // 2026-09-05 07:48: "¡Duvier Mena! 😊 Cuéntame en qué te puedo ayudar."
    expect(nombreDePila("Duvier Mena")).toBe("Duvier");
  });
});

describe("lo que llega de verdad en el pushName de WhatsApp", () => {
  it("baja las mayúsculas de imprenta", () => {
    // Gritarle el nombre se lee tan automático como el apellido.
    expect(nombreDePila("MARIA FERNANDA")).toBe("Maria");
  });

  it("respeta las mayúsculas internas de un nombre real", () => {
    expect(nombreDePila("McCarthy Smith")).toBe("McCarthy");
    expect(nombreDePila("DeSoto Ruiz")).toBe("DeSoto");
  });

  it("corta el rubro que la gente pone en el nombre", () => {
    expect(nombreDePila("Andrés | Ventas")).toBe("Andrés");
    expect(nombreDePila("María - Tienda")).toBe("María");
    expect(nombreDePila("Carlos · Soporte")).toBe("Carlos");
  });

  it("saca los adornos", () => {
    expect(nombreDePila("✨Duvier✨")).toBe("Duvier");
    expect(nombreDePila("🔥 Juan Pablo")).toBe("Juan");
  });

  it("conserva tildes y ñ", () => {
    expect(nombreDePila("Íñigo Montoya")).toBe("Íñigo");
    expect(nombreDePila("Begoña Núñez")).toBe("Begoña");
  });
});

describe("cuándo NO hay nombre usable", () => {
  it.each(["cliente", "Cliente", "usuario", "contacto", "WhatsApp", "null", "undefined"])(
    '"%s" no es un nombre',
    (v) => expect(nombreDePila(v)).toBeNull(),
  );

  it.each(["", "   ", null, undefined, "🔥🔥🔥", "123"])("%s da null", (v) => {
    expect(nombreDePila(v)).toBeNull();
  });

  it("una inicial suelta no sirve para saludar", () => {
    // "¡J! 😊" es peor que no usar nombre.
    expect(nombreDePila("J. Pérez")).toBeNull();
    expect(nombreDePila("A B")).toBeNull();
  });
});

describe("nunca devuelve algo que rompa el saludo", () => {
  it("no devuelve cadena vacía: un '¡Hola !' delata lo mismo", () => {
    for (const v of ["", " ", "|", "- ", "cliente", "🔥"]) {
      const r = nombreDePila(v);
      expect(r === null || r.length > 0).toBe(true);
    }
  });

  it("no deja espacios ni puntuación colgando", () => {
    for (const v of ["Duvier Mena", " Ana  Lucía ", "Luis.", "Pedro-"]) {
      const r = nombreDePila(v);
      if (r) expect(r).toBe(r.trim());
      if (r) expect(r).not.toMatch(/[.'-]$/);
    }
  });

  it("un solo nombre pasa igual", () => {
    expect(nombreDePila("Duvier")).toBe("Duvier");
  });
});
