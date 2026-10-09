/**
 * 09-10-2026, caso real: Atlas revisó las 2 campañas pausadas del Corrector de
 * postura (producto 155) y escribió "no conviene reactivarlas: prometen 'sin
 * dolor', 'al instante', 'envío incluido'"... y en el MISMO mensaje propuso
 * encender la 120249903421270097. El validador de promesas solo corría al
 * CREAR un anuncio; encender uno viejo no pasaba por ningún control.
 */
import { describe, it, expect, vi } from "vitest";
import { db, tenants, products, facebookDrafts } from "@workspace/db";

let textosEnMeta: string[] | null = [];
vi.mock("../facebook", () => ({
  FacebookService: class {
    isConfigured() { return true; }
    async textosDeLosAnuncios() { return textosEnMeta; }
  },
}));

import { copyVivoSinRespaldo, ENCIENDEN_CAMPANA } from "../app-operator";

async function escenario(campaignId: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const [t] = await db.insert(tenants)
    .values({ name: "Copy Vivo", email: `copyvivo-${sufijo}@test.local`, slug: `copyvivo-${sufijo}`, brandName: "Copy Vivo" } as any)
    .returning();
  const [p] = await db.insert(products).values({
    tenantId: t.id,
    name: "Corrector de Postura Zxf 25 Eh",
    description: "Corrector de postura con doble correa ajustable, neopreno acolchado y ligero. Ayuda a la alineación de hombros y espalda.",
    price: "55000",
    currency: "COP",
    kind: "physical",
    features: ["doble correa ajustable", "neopreno acolchado y ligero", "alineación de hombros y espalda"],
  } as any).returning();
  await db.insert(facebookDrafts).values({ tenantId: t.id, productId: p.id, productName: p.name, campaignId, status: "uploaded" } as any);
  return { ctx: { tenantId: t.id, sessionId: "test", role: "admin" } as any, productId: p.id };
}

describe("encender una campaña pasa por el mismo control de contenido que crearla", () => {
  it("las dos herramientas que encienden están cubiertas", () => {
    expect(ENCIENDEN_CAMPANA.has("fb_make_campaign_deliver")).toBe(true);
    expect(ENCIENDEN_CAMPANA.has("fb_resume_campaign")).toBe(true);
  });

  it("el texto viejo con garantía inventada NO se enciende, y dice qué hacer en su lugar", async () => {
    const { ctx } = await escenario("120249903421270097");
    textosEnMeta = ["Corrige tu postura en 30 días o te devolvemos tu dinero. Garantía total. $55.000"];
    const r = await copyVivoSinRespaldo("120249903421270097", ctx);
    expect(r).toMatch(/NO se enciende la campaña 120249903421270097/);
    expect(r).toMatch(/crear_anuncio/);
  });

  it.each([
    ["Corrige tu postura sin dolor"],
    ["Resultados al instante"],
    ["Envío incluido a toda Colombia"],
    ["Te llega en 3 a 5 días"],
  ])("las frases reales de las campañas del Corrector se frenan: %s", async (frase) => {
    const { ctx } = await escenario(`frase-${frase.length}`);
    textosEnMeta = [frase];
    expect(await copyVivoSinRespaldo(`frase-${frase.length}`, ctx)).toMatch(/NO se enciende/);
  });

  it("un texto que solo usa lo de la ficha sí se puede encender", async () => {
    const { ctx } = await escenario("120249903421270098");
    textosEnMeta = ["Corrector de postura con doble correa ajustable y neopreno acolchado y ligero. Alineación de hombros y espalda. $55.000 COP."];
    expect(await copyVivoSinRespaldo("120249903421270098", ctx)).toBeNull();
  });

  it("si la campaña no es de VentasPro (no hay producto con qué comparar) no se bloquea", async () => {
    const { ctx } = await escenario("111");
    textosEnMeta = ["Garantía total o te devolvemos tu dinero"];
    expect(await copyVivoSinRespaldo("999999", ctx)).toBeNull();
  });

  it("si Meta no deja leer el texto no se bloquea a ciegas", async () => {
    const { ctx } = await escenario("120249903421270099");
    textosEnMeta = null;
    expect(await copyVivoSinRespaldo("120249903421270099", ctx)).toBeNull();
  });
});
