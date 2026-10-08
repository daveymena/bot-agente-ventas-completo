import { describe, it, expect } from "vitest";
import { compararConLoPedido } from "../verificar-anuncio-en-meta";

const SEIS = ["Bogotá", "Medellín", "Cali", "Barranquilla", "Bucaramanga", "Cartagena"];

describe("verificación posterior: lo que Meta guardó vs lo pedido", () => {
  it("el caso real del 07-10: carrusel 25-55 en seis ciudades → salió imagen, 18-65, país", () => {
    const r = compararConLoPedido(
      { ageMin: 25, ageMax: 55, ciudades: SEIS, formato: "carrusel" },
      {
        targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ["CO"] } },
        effective_status: "ACTIVE",
        ads: [{ creative: { object_story_spec: { link_data: { picture: "https://x/1.jpg" } } } }],
      },
    );
    expect(r.ok).toBe(false);
    expect(r.linea).toContain("NO quedó como se pidió");
    expect(r.linea).toContain("edad mínima 18");
    expect(r.linea).toContain("todo el país");
    expect(r.linea).toContain("UNA imagen");
    expect(r.linea).toContain("ACTIVO");
  });

  it("si quedó bien, lo dice con lo leído", () => {
    const r = compararConLoPedido(
      { ageMin: 25, ageMax: 55, ciudades: SEIS, formato: "carrusel" },
      {
        targeting: { age_min: 25, age_max: 55, geo_locations: { cities: SEIS.map((_, i) => ({ key: String(i) })) } },
        status: "PAUSED",
        ads: [{ creative: { object_story_spec: { link_data: { child_attachments: [{}, {}, {}, {}] } } } }],
      },
    );
    expect(r.ok).toBe(true);
    expect(r.linea).toBe("🔎 Leído en Meta: 25–55 años · 6 ciudad(es) · carrusel de 4 fotos · en pausa.");
  });

  it("ciudades + país a la vez se marca: en Meta eso suma todo el país", () => {
    const r = compararConLoPedido(
      { ciudades: ["Bogotá"] },
      { targeting: { geo_locations: { cities: [{ key: "1" }], countries: ["CO"] } } },
    );
    expect(r.ok).toBe(false);
  });
});

// 08-10: el carrusel se guardaba en el borrador pero la subida armaba UNA foto.
describe("subida a Meta: el carrusel se arma de verdad", () => {
  it("una tarjeta por foto, mismo destino y botón, sin foto única en la raíz", async () => {
    const { linkDataDeCarrusel } = await import("../facebook");
    const ld = linkDataDeCarrusel(
      { link: "https://ventasproia.com/l/corrector", message: "x", picture: "https://f/1.jpg", call_to_action: { type: "SHOP_NOW" } },
      ["https://f/1.jpg", "https://f/2.jpg", "https://f/3.jpg"],
      "Corrector",
    );
    expect(ld.picture).toBeUndefined();
    expect(ld.child_attachments).toHaveLength(3);
    expect(ld.child_attachments[1]).toEqual({ link: "https://ventasproia.com/l/corrector", picture: "https://f/2.jpg", name: "Corrector", call_to_action: { type: "SHOP_NOW" } });
    // Y la verificación posterior lo reconoce como carrusel.
    const { compararConLoPedido } = await import("../verificar-anuncio-en-meta");
    const r = compararConLoPedido({ formato: "carrusel" }, { ads: [{ creative: { object_story_spec: { link_data: ld } } }] });
    expect(r.linea).toContain("carrusel de 3 fotos");
  });
});

// 08-10, datos reales: VentasPro tenía guardado un píxel que NO es de la cuenta.
describe("qué píxel usa la campaña", () => {
  it("el guardado no es de la cuenta y la cuenta tiene uno solo → ese (el caso real)", async () => {
    const { elegirPixel } = await import("../facebook");
    expect(elegirPixel("1193902929595904", ["1064770976005166"])).toEqual({ pixelId: "1064770976005166", corregido: true });
  });
  it("el guardado sí es de la cuenta → se respeta", async () => {
    const { elegirPixel } = await import("../facebook");
    expect(elegirPixel("1064770976005166", ["1064770976005166", "2"])).toEqual({ pixelId: "1064770976005166", corregido: false });
  });
  it("varios en la cuenta y el guardado no es ninguno → no adivina", async () => {
    const { elegirPixel } = await import("../facebook");
    expect(elegirPixel("999", ["1", "2"]).pixelId).toBeNull();
  });
});

describe("verificación: qué optimiza el conjunto", () => {
  it("pediste ventas y busca clics → NO verificado (la campaña real del corrector)", async () => {
    const { compararConLoPedido } = await import("../verificar-anuncio-en-meta");
    const r = compararConLoPedido({ objetivo: "ventas" }, { optimization_goal: "LINK_CLICKS", targeting: { age_min: 18, age_max: 65 } });
    expect(r.ok).toBe(false);
    expect(r.linea).toContain("pediste VENTAS y el conjunto busca CLICS");
  });
  it("ventas que busca compras → bien", async () => {
    const { compararConLoPedido } = await import("../verificar-anuncio-en-meta");
    expect(compararConLoPedido({ objetivo: "ventas" }, { optimization_goal: "OFFSITE_CONVERSIONS" }).ok).toBe(true);
  });
});
