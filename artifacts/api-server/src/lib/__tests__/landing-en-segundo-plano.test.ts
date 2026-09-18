import { describe, it, expect, vi, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

/**
 * Atlas decía "voy a crear la landing" y mostraba una VIEJA (dueño, 18-09-2026).
 *
 * Causa: la generación con OpenCode (45s × hasta 4 modelos) no entra en el
 * request (el proxy corta a ~150s), moría a mitad, y en el turno siguiente el
 * modelo presentaba la que había en landing_listar. Ahora:
 *
 *   1. landing_crear devuelve AL INSTANTE el id de una fila NUEVA en estado
 *      "generando" y le dice al modelo que no muestre otra en su lugar.
 *   2. La generación corre en segundo plano; si OpenCode falla, se arma con
 *      el generador por secciones: la landing queda lista SIEMPRE.
 *   3. landing_estado / la nota del turno siguiente dicen "lista" con la
 *      vista previa, o "fallo" con el motivo. Nunca una landing vieja.
 */
vi.mock("../../routes/landing-studio-opencode", () => ({
  generarLandingConOpenCode: vi.fn(async () => ({ html: "", tipo: "digital", error: "OpenCode no configurado" })),
}));
vi.mock("../../routes/landing-pages-ai", () => ({
  generarLandingLocal: vi.fn(async ({ product }: any) => ({
    ok: true, generatedBy: "ai", name: `Landing · ${product.name}`,
    strategy: { promise: "x" }, design: { tone: "sobrio" },
    sections: [{ id: "hero", type: "hero", title: "Aprende piano", body: "...", cta: "Quiero mi acceso" }],
  })),
}));
// La auditoría de acciones necesita Postgres; en SQLite se bloquea toda
// mutación. Acá se prueba la herramienta, no la auditoría.
vi.mock("../control-plane-audit", () => ({ recordControlPlaneAudit: vi.fn(async () => 1) }));
vi.mock("../landing/memoria", () => ({ recordarLanding: vi.fn(async () => undefined), contextoLanding: vi.fn(async () => "") }));

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("landing_crear en segundo plano", () => {
  let db: any, products: any, landingPages: any, executeAction: any, estadoDeGeneracion: any, notaDeLandingsEnSegundoPlano: any;
  let productId: number;

  beforeAll(async () => {
    ({ db, products, landingPages } = await import("@workspace/db"));
    ({ executeAction, estadoDeGeneracion, notaDeLandingsEnSegundoPlano } = await import("../app-operator"));
    const [p] = await db.insert(products).values({
      tenantId: 1, name: "CURSO DE PIANO (test landing)", description: "Curso de piano.", price: "60000", currency: "COP",
      kind: "digital", isActive: true, features: [], imageUrl: "/x.jpg",
    }).returning();
    productId = p.id;
  });

  it("devuelve al instante una landing NUEVA en estado generando, y no la muestra como lista", async () => {
    const ctx = { tenantId: 1, sessionId: "sesion-landing-test" } as any;
    const t0 = Date.now();
    const r: any = await executeAction("landing_crear", { productId, instruccion: "que se vea profesional" }, ctx);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(r.data?.estado).toBe("generando");
    expect(r.summary).toMatch(/NUEVA \[\d+\]/);
    expect(r.summary).toMatch(/no .*muestres otra landing/i);

    const [fila] = await db.select().from(landingPages).where(eq(landingPages.id, r.data.id));
    expect(fila).toBeTruthy();
    expect((fila.strategy as any).generando).toBe(true);
    expect(estadoDeGeneracion(fila).estado).toBe("generando");

    // El respaldo por secciones la deja lista aunque OpenCode falle.
    let lista: any = null;
    for (let i = 0; i < 40 && !lista; i++) {
      await esperar(100);
      const [f] = await db.select().from(landingPages).where(eq(landingPages.id, r.data.id));
      if (!(f.strategy as any).generando) lista = f;
    }
    expect(lista, "la generación en segundo plano no terminó").toBeTruthy();
    const est = estadoDeGeneracion(lista);
    expect(est.estado).toBe("lista");
    expect((lista.strategy as any).generador).toBe("plantilla");
    expect((lista.strategy as any).motivoRespaldo).toMatch(/OpenCode/);
    expect(lista.sections).toHaveLength(1);
    expect(est.texto).toContain(`[${r.data.id}]`);
    expect(est.vistaPrevia).toMatch(/\/l\//);

    // El turno siguiente se entera solo, y una sola vez.
    const nota = await notaDeLandingsEnSegundoPlano(ctx);
    expect(nota).toContain("[SISTEMA]");
    expect(nota).toContain(`[${r.data.id}]`);
    expect(nota).toMatch(/LISTA/);
    expect(await notaDeLandingsEnSegundoPlano(ctx)).toBe("");

    const e: any = await executeAction("landing_estado", { id: r.data.id }, ctx);
    expect(e.ok).toBe(true);
    expect(e.data.estado).toBe("lista");
  });

  it("una fila 'generando' de hace más de 6 minutos se reporta como fallo (el proceso se reinició)", () => {
    const est = estadoDeGeneracion({ id: 9, name: "x", slug: "x", strategy: { generando: true, desde: new Date(Date.now() - 7 * 60_000).toISOString() } });
    expect(est.estado).toBe("fallo");
    expect(est.texto).toMatch(/crearla de nuevo/);
  });

  it("un fallo total se dice con el motivo, no se disimula", () => {
    const est = estadoDeGeneracion({ id: 9, name: "x", slug: "x", strategy: { generando: false, error: "revienta" }, html: null, sections: [] });
    expect(est.estado).toBe("fallo");
    expect(est.texto).toContain("revienta");
  });
});
