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
