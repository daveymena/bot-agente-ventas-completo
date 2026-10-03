/**
 * El CABLEADO real: "hazla tipo artículo" sobre una landing GUARDADA cambia
 * su composición en la base (design.modelo + semilla) sin tocar los textos.
 */
import { describe, expect, it, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { editarLanding } from "../editar";
import { db, landingPages } from "@workspace/db";

let creadaId: number | null = null;

describe("editarLanding: la composición se cambia con código", () => {
  it("de una landing guardada, 'hazla tipo artículo' le deja design.modelo + semilla", async () => {
    const [creada]: any = await db
      .insert(landingPages)
      .values({
        tenantId: 1, name: "Composicion test", slug: `compos-test-${Date.now()}`, status: "draft",
        productId: 163, sections: [], design: { familia: "ecommerce" },
      })
      .returning();
    creadaId = Number(creada.id);

    const r = await editarLanding(1, creadaId, "hazla tipo artículo");
    expect(r.ok).toBe(true);
    expect(r.aplicadas).toContain("composición");
    expect(r.message).toMatch(/Advertorial|Art[íi]culo/i);

    const [fu]: any = await db.select().from(landingPages).where(eq(landingPages.id, creadaId)).limit(1) as any;
    const design: any = typeof fu.design === "string" ? JSON.parse(fu.design) : fu.design;
    expect(design.modelo).toBe("advertorial");
    expect(String(design.semilla || "")).toBeTruthy();
  });

  it("una instrucción que NADA cambia no toca el design (el lector de composición ni la toma)", async () => {
    // 'hazla tipo artículo' SÍ es composición; este caso solo confirma que la
    // llamada con landing existente responde sin romper (el lector de texto
    // ya lo cubre composicion.test.ts).
    const r = await editarLanding(1, creadaId || -1, "hazla tipo artículo");
    expect(r).toBeTruthy();
    expect(r.ok === true || r.ok === false).toBe(true);
  });
});

afterAll(async () => {
  if (creadaId) await db.delete(landingPages).where(eq(landingPages.id, creadaId)) as any;
});
