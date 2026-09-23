import { describe, it, expect } from "vitest";
import { findBestProductMatch } from "../conversation-engine";

/**
 * La tolerancia a errores de tipeo (505af20) aceptaba 1 letra de diferencia en
 * cualquier posición desde 4 letras. Medido con el catálogo real el 23-09-2026:
 * "astronomia" era "gastronomia" y "piano" era "plano" -- a quien pedía el
 * curso de piano se le mostraban también los de planos. Tiene que seguir
 * tolerando el typo que la motivó ("corector").
 */
const CATALOGO = [
  { id: 1, name: "Corrector de postura en X", description: "Ajustable", price: 59900, isActive: true },
  { id: 2, name: "Curso de piano completo", description: "Desde cero", price: 60000, isActive: true },
  { id: 3, name: "Curso metrados lectura de planos", description: "Construcción", price: 20000, isActive: true },
  { id: 4, name: "Curso de gastronomía", description: "Cocina", price: 20000, isActive: true },
];
const elige = async (m: string) => (await findBestProductMatch(m, CATALOGO as any, new Map()))?.product.name ?? null;

describe("errores de tipeo", () => {
  it('"corector" sigue encontrando el corrector', async () => {
    expect(await elige("tienen el corector de postura?")).toBe("Corrector de postura en X");
  });

  it('"curso de piano" es el de piano y sin ambigüedad con "planos"', async () => {
    const r = await findBestProductMatch("curso de piano", CATALOGO as any, new Map());
    expect(r?.product.name).toBe("Curso de piano completo");
    expect(r?.ambiguo).toBeFalsy();
  });

  it('"astronomia" no es "gastronomia"', async () => {
    expect(await elige("tienen algo de astronomia")).toBeNull();
  });
});
