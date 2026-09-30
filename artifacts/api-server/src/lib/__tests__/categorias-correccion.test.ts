import { describe, it, expect, beforeAll } from "vitest";
import { db, products, productCategories } from "@workspace/db";
import { eq } from "drizzle-orm";
import { vincularCategoriasSueltas } from "../categorias";

/**
 * La rutina de arranque corrige en la BASE lo que estaba mal ubicado
 * (casos reales de sofia-premium, 30-09-2026), sin tocar lo que el dueño
 * decidió. Negocio propio para no chocar con otras pruebas.
 */
const TENANT = 9301;

async function categoriaDe(id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  const [c] = p?.categoryId ? await db.select().from(productCategories).where(eq(productCategories.id, p.categoryId)) : [];
  // (La base de prueba SQLite no tiene la columna `kind` de categorías;
  // en Postgres sí. Por eso acá no se compara el tipo de la fila.)
  return { texto: p?.category, fila: c?.name };
}

describe("vincularCategoriasSueltas corrige categorías en la base", () => {
  const ids: Record<string, number> = {};
  beforeAll(async () => {
    const [musica] = await db.insert(productCategories).values({ tenantId: TENANT, name: "Musica", kind: "digital" } as any).returning();
    const alta = async (clave: string, v: any) => {
      const [p] = await db.insert(products).values({ tenantId: TENANT, description: "x", price: "1000", currency: "COP", isActive: true, features: [], ...v }).returning();
      ids[clave] = p.id;
    };
    await alta("portatil", { name: "Portátil HP 14-DQ6101DX | Intel Processor N150", kind: "physical", category: "Cocina" });
    await alta("curso", { name: "CURSO ADOBE INDESIGN DESDE CERO", kind: "digital", category: "General" });
    await alta("piano", { name: "CURSO DE PIANO COMPLETO", kind: "digital", category: "Musica", categoryId: musica.id });
    await alta("propia", { name: "Portátil HP 14", kind: "physical", category: "Ofertas de temporada" });
    await vincularCategoriasSueltas();
  });

  it("el portátil sale de Cocina a Computadores (física)", async () => {
    expect(await categoriaDe(ids.portatil)).toEqual({ texto: "Computadores y portátiles", fila: "Computadores y portátiles" });
  });

  it("el curso sale de General a Diseño Gráfico (digital, nunca a una física)", async () => {
    expect(await categoriaDe(ids.curso)).toEqual({ texto: "Diseño Gráfico", fila: "Diseño Gráfico" });
  });

  it("'Musica' pasa a ser 'Música' y no quedan dos", async () => {
    expect((await categoriaDe(ids.piano)).fila).toBe("Música");
    const filas = await db.select().from(productCategories).where(eq(productCategories.tenantId, TENANT));
    expect(filas.filter((c: any) => /^m[uú]sica$/i.test(c.name)).length).toBe(1);
  });

  it("la categoría que inventó el dueño no se toca", async () => {
    expect((await categoriaDe(ids.propia)).texto).toBe("Ofertas de temporada");
  });

  it("correr dos veces deja todo igual", async () => {
    await vincularCategoriasSueltas();
    expect((await categoriaDe(ids.portatil)).texto).toBe("Computadores y portátiles");
    expect((await categoriaDe(ids.curso)).texto).toBe("Diseño Gráfico");
    expect((await categoriaDe(ids.piano)).fila).toBe("Música");
  });
});
