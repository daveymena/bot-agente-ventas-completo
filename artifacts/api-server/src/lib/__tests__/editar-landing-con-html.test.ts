import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Landing 15 en producción (18-09-2026): el dueño pidió dos veces cambiar la
 * paleta, la herramienta contestó "cambios: diseño" y la página siguió
 * igual. Causa: la landing tiene HTML propio (OpenCode) y editarLanding
 * escribía sections/design, que la ruta pública ignora cuando hay html.
 *
 * Ahora: con HTML propio, la edición reescribe el HTML (en segundo plano) y
 * el estado lo dice; sin HTML, sigue el camino por secciones.
 */
const opencode = vi.fn(async (opts: any) => ({ html: `<!DOCTYPE html><html><body data-editado="${opts.instruction.includes("oscura") ? "si" : "no"}">${opts.existingHtml ? "con-base" : "sin-base"}</body></html>`, tipo: "digital" }));
vi.mock("../../routes/landing-studio-opencode", () => ({ generarLandingConOpenCode: (o: any) => opencode(o) }));

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("editar una landing con HTML propio", () => {
  let db: any, landingPages: any, products: any, editarLanding: any, estadoDeGeneracion: any;
  let id: number;
  beforeAll(async () => {
    ({ db, landingPages, products } = await import("@workspace/db"));
    ({ editarLanding } = await import("../landing/editar"));
    ({ estadoDeGeneracion } = await import("../app-operator"));
    const [p] = await db.insert(products).values({ tenantId: 1, name: "IA 2026 (test)", description: "x", price: "60000", currency: "COP", kind: "digital", isActive: true, features: [] } as any).returning();
    const [l] = await db.insert(landingPages).values({
      tenantId: 1, productId: p.id, name: "Landing · IA", slug: "ia-test-html", status: "published",
      strategy: { tipo: "digital", generador: "opencode", generando: false }, sections: [], design: { familia: "premium" }, source: {},
      html: "<!DOCTYPE html><html><body style='background:pink'>vieja</body></html>",
    } as any).returning();
    id = l.id;
  });

  it("no dice 'editada': avisa que reescribe el HTML en segundo plano, y al terminar el HTML cambió", async () => {
    const r: any = await editarLanding(1, id, "paleta oscura, sin rosados");
    expect(r.ok).toBe(true);
    expect(r.enSegundoPlano).toBe(true);
    expect(r.message).toMatch(/segundo plano/);
    expect(r.message).toMatch(/No digas que ya cambió/);

    // Mientras corre, el estado lo dice.
    let fila: any = null;
    for (let i = 0; i < 30; i++) {
      await esperar(100);
      [fila] = await db.select().from(landingPages).where(eq(landingPages.id, id));
      if (!(fila.strategy as any).generando && fila.html.includes("data-editado")) break;
    }
    expect(fila.html).toContain('data-editado="si"');
    expect(fila.html).toContain("con-base");
    expect((fila.strategy as any).generando).toBe(false);
    expect((fila.strategy as any).ultimaEdicion).toMatch(/oscura/);
    expect(estadoDeGeneracion(fila).estado).toBe("lista");
    expect(opencode).toHaveBeenCalledTimes(1);
    expect(opencode.mock.calls[0][0].existingHtml).toContain("vieja");
  });

  it("si OpenCode falla, el estado dice que el cambio NO se aplicó y la página sigue con la versión anterior", async () => {
    opencode.mockImplementationOnce(async () => ({ html: "", tipo: "digital", error: "OpenCode no configurado" }));
    const r: any = await editarLanding(1, id, "botón verde");
    expect(r.ok).toBe(true);
    let fila: any = null;
    for (let i = 0; i < 30; i++) {
      await esperar(100);
      [fila] = await db.select().from(landingPages).where(eq(landingPages.id, id));
      if (!(fila.strategy as any).generando) break;
    }
    expect((fila.strategy as any).error).toMatch(/No se pudo editar el HTML/);
    expect(fila.html).toContain('data-editado="si"'); // la versión anterior sigue
    const est = estadoDeGeneracion(fila);
    expect(est.estado).toBe("fallo");
    expect(est.texto).toMatch(/NO se aplicó/);
  });
});
