import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildMatch, stem, tokenize, searchAssets, similarAssets } from "../server/lib/search";
import { closeDb, initDb, run } from "../server/db/client";
import { keywordsText, normalizeKeywords } from "../server/lib/assets";

describe("tokenize / stem / buildMatch", () => {
  it("normaliza acentos, signos y mayúsculas", () => {
    expect(tokenize("¡Montañas  NEVADAS, al atardecer!")).toEqual(["montanas", "nevadas", "al", "atardecer"]);
  });
  it("corta a 8 términos y descarta de 1 letra", () => {
    expect(tokenize("a b c uno dos tres cuatro cinco seis siete ocho nueve")).toHaveLength(8);
  });
  it("stem cubre plural/singular", () => {
    expect(stem("montanas")).toBe("montana");
    expect(stem("ciudades")).toBe("ciudad");
    expect(stem("sol")).toBe("sol");
  });
  it("buildMatch une grupos con AND explícito (FTS5 no admite AND implícito entre paréntesis)", () => {
    const m = buildMatch("coffee cup")!;
    expect(m.split(" AND ")).toHaveLength(2);
    expect(m).toContain('("coffee"* OR "cafe"*');
    expect(m).toContain('("cup"* OR "taza"*');
    expect(buildMatch("   ")).toBeNull();
  });
  it("buildMatch con un solo término sin sinónimos no agrega paréntesis", () => {
    expect(buildMatch("zzqx")).toBe('"zzqx"*');
  });
});

describe("búsqueda contra SQLite en memoria", () => {
  beforeAll(async () => {
    await initDb({ memory: true });
    const rows = [
      { uuid: "a1", type: "photo", title: "Taza de café con arte latte sobre mesa de madera", kws: ["café", "taza", "latte", "madera", "desayuno"], hue: 30, w: 4000, h: 2667, free: 1 },
      { uuid: "a2", type: "photo", title: "Skyline de ciudad moderna a la hora azul", kws: ["ciudad", "noche", "rascacielos", "skyline", "urbano"], hue: 220, w: 4000, h: 2667, free: 0 },
      { uuid: "a3", type: "video", title: "Timelapse de ciudad de noche con tráfico", kws: ["ciudad", "noche", "timelapse", "tráfico"], hue: 230, w: 1920, h: 1080, free: 0, res: "HD", dur: 8 },
      { uuid: "a4", type: "vector", title: "Logotipo de hoja verde ecológico", kws: ["logo", "hoja", "eco", "verde"], hue: 120, w: 2500, h: 2500, free: 0 },
      { uuid: "a5", type: "photo", title: "Borrador que no debe aparecer", kws: ["ciudad", "café"], hue: 0, w: 4000, h: 2667, free: 0, status: "pending" },
    ];
    for (const r of rows) {
      const k = normalizeKeywords(r.kws);
      await run(
        `INSERT INTO assets(uuid, type, title, description, keywords, keywords_text, status, is_free, width, height, orientation, hue, saturation, lightness, resolution_label, duration_sec, dhash, file_format) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [r.uuid, r.type, r.title, "", JSON.stringify(k), keywordsText(k), r.status || "approved", r.free, r.w, r.h, r.w === r.h ? "square" : "horizontal", r.hue, 50, 50, r.res || null, r.dur || null, "0000000000000000", r.type === "video" ? "mp4" : "jpg"],
      );
    }
  });
  afterAll(async () => { await closeDb(); });

  it("encuentra por sinónimo inglés→español y respeta el estado", async () => {
    const r = await searchAssets({ q: "coffee cup" });
    expect(r.items.map((i) => i.title)).toEqual(["Taza de café con arte latte sobre mesa de madera"]);
  });
  it("búsqueda multi-término exige todos los términos (ciudad noche)", async () => {
    const r = await searchAssets({ q: "ciudad noche" });
    expect(r.total).toBe(2);
    expect(r.facets.types.map((t) => t.type).sort()).toEqual(["photo", "video"]);
  });
  it("filtra por pestaña, precio y resolución", async () => {
    expect((await searchAssets({ q: "ciudad", tab: "video" })).total).toBe(1);
    expect((await searchAssets({ tab: "free" })).items.every((i) => i.isFree)).toBe(true);
    expect((await searchAssets({ tab: "video", resolution: "4K" })).total).toBe(0);
    expect((await searchAssets({ tab: "video", minDuration: 5, maxDuration: 10 })).total).toBe(1);
  });
  it("sin query devuelve el catálogo aprobado paginado", async () => {
    const r = await searchAssets({ perPage: 2 });
    expect(r.total).toBe(4);
    expect(r.items).toHaveLength(2);
    expect(r.totalPages).toBe(2);
  });
  it("similares se quedan en la misma familia de medio", async () => {
    const r = await searchAssets({ q: "skyline" });
    const sim = await similarAssets(r.items[0]!.id);
    expect(sim.every((s) => s.type !== "video")).toBe(true);
    expect(sim.some((s) => s.title.includes("café"))).toBe(true);
  });
});
