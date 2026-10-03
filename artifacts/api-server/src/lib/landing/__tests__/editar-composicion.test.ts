/**
 * El CABLEADO real: "hazla tipo artículo" sobre una landing GUARDADA cambia
 * su composición en la base (design.modelo + semilla) sin tocar los textos.
 */
import { describe, expect, it, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { editarLanding } from "../editar";
import { pedidoDeComposicion } from "../composicion";
import { db, landingPages } from "@workspace/db";

let creadaId: number | null = null;

describe("editarLanding: la composición se cambia con código", () => {
  it("de una landing guardada, 'hazla tipo tienda' le deja design.modelo + semilla", async () => {
    const [creada]: any = await db
      .insert(landingPages)
      .values({
        tenantId: 1, name: "Composicion test", slug: `compos-test-${Date.now()}`, status: "draft",
        productId: 163, sections: [], design: { familia: "ecommerce" },
      })
      .returning();
    creadaId = Number(creada.id);

    const r = await editarLanding(1, creadaId, "hazla tipo tienda");
    expect(r.ok).toBe(true);
    expect(r.aplicadas).toContain("composición");
    expect(r.message).toMatch(/Tienda directa/i);

    const [fu]: any = await db.select().from(landingPages).where(eq(landingPages.id, creadaId)).limit(1) as any;
    const design: any = typeof fu.design === "string" ? JSON.parse(fu.design) : fu.design;
    expect(design.modelo).toBe("tienda-directa");
    expect(String(design.semilla || "")).toBeTruthy();
  });

  it("una instrucción que NADA cambia no la toma el lector de composición (y no llamaría al IA)", () => {
    // El lector (composicion.ts) devuelve null: el cambio va por el camino de
    // textos normal. Puro: sin base ni modelos de IA.
    expect(pedidoDeComposicion("pon un título diferente")).toBeNull();
  });
});

afterAll(async () => {
  if (creadaId) await db.delete(landingPages).where(eq(landingPages.id, creadaId)) as any;
});
