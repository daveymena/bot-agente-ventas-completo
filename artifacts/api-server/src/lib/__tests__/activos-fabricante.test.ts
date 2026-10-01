import { describe, it, expect } from "vitest";
import { candidatosDeBusqueda, vendidosDe, fotoGrande, esFotoDeGaleria, tramosParaClips, activosAprobados, ARCHIVO_FABRICANTE, veredictoEsSi, fotosDeReferencia, consultasDeBusqueda } from "../activos-fabricante";

/**
 * Activos del fabricante (AliExpress), 01-10-2026. Lo que se puede probar sin
 * red: cómo se lee la búsqueda, qué foto se baja, dónde se corta el video y
 * que nada llegue a la landing sin la aprobación del dueño.
 */
describe("activos del fabricante", () => {
  it("lee los candidatos de la búsqueda y los ordena por ventas", () => {
    const html = `x"productId":"111","x":1,"tradeDesc":"311 vendidos","displayTitle":"Mochila A"y`
      + `"productId":"222","tradeDesc":"3.000+ vendidos","displayTitle":"Mochila B"`
      + `"productId":"333","displayTitle":"Sin ventas"`
      + `"productId":"111"`;
    const c = candidatosDeBusqueda(html);
    expect(c.map((x) => x.id)).toEqual(["222", "111", "333"]);
    expect(c[0]).toMatchObject({ vendidos: 3000, titulo: "Mochila B" });
  });

  it("vendidos: '3.000+ vendidos' es 3000 y sin dato es 0", () => {
    expect(vendidosDe("3.000+ vendidos")).toBe(3000);
    expect(vendidosDe("311 vendidos")).toBe(311);
    expect(vendidosDe("")).toBe(0);
  });

  it("baja la foto en tamaño completo, no la miniatura", () => {
    expect(fotoGrande("//ae-pic-a1.aliexpress-media.com/kf/Sabc.jpg_220x220q75.jpg_.avif")).toBe("https://ae-pic-a1.aliexpress-media.com/kf/Sabc.jpg");
    expect(fotoGrande("https://ae01.alicdn.com/kf/Hx.png?x=1")).toBe("https://ae01.alicdn.com/kf/Hx.png");
  });

  it("solo fotos de producto del CDN (kf/), no íconos ni gifs", () => {
    expect(esFotoDeGaleria("https://ae-pic-a1.aliexpress-media.com/kf/Sabc.jpg")).toBe(true);
    expect(esFotoDeGaleria("https://ae01.alicdn.com/kf/icon.gif")).toBe(false);
    expect(esFotoDeGaleria("https://img.alicdn.com/tfs/TB1logo.png")).toBe(false);
  });

  it("los clips se reparten por el video sin pasarse del final", () => {
    const t = tramosParaClips(45.6, 4);
    expect(t).toHaveLength(4);
    expect(t[0]).toBeGreaterThanOrEqual(1);
    expect(t[t.length - 1]! + 3).toBeLessThanOrEqual(45.6);
    expect(tramosParaClips(4, 4)).toEqual([]);
  });

  it("la landing NO usa nada hasta que el dueño aprueba", () => {
    const a = { fotos: ["f"], clips: ["c"] };
    expect(activosAprobados({ activosFabricante: a })).toEqual({ fotos: [], clips: [] });
    expect(activosAprobados(JSON.stringify({ activosFabricante: { ...a, aprobado: true } }))).toEqual({ fotos: ["f"], clips: ["c"] });
  });

  it("la ruta pública solo sirve archivos con nombre de producto", () => {
    expect(ARCHIVO_FABRICANTE.test("168-clip-1.mp4")).toBe(true);
    expect(ARCHIVO_FABRICANTE.test("168-gif-1790880000000-1.gif")).toBe(true);
    expect(ARCHIVO_FABRICANTE.test("../secreto.mp4")).toBe(false);
    expect(ARCHIVO_FABRICANTE.test("168-x.exe")).toBe(false);
  });
});

describe("activos del fabricante: decisión de la visión", () => {
  it("solo un 'VEREDICTO: SI' explícito cuenta; 'SI' suelto en el texto no", () => {
    expect(veredictoEsSi("DIFERENCIAS: ninguna | VEREDICTO: SI")).toBe(true);
    expect(veredictoEsSi("DIFERENCIAS: ventana circular | VEREDICTO: NO")).toBe(false);
    expect(veredictoEsSi("**VEREDICTO:** **SÍ**")).toBe(true);
    // Medido: con la pregunta vieja el modelo empezaba con "SI" y aprobaba otro modelo.
    expect(veredictoEsSi("SI, mismo tipo de mochila")).toBe(false);
    expect(veredictoEsSi("")).toBe(false);
  });

  it("fotos de referencia: fotosUnicas es { urls }, no una lista", () => {
    const m = { fotosUnicas: { firma: "x", urls: ["a.jpg", "b.webp"] }, imagenes: ["b.webp", "c.webp"] };
    expect(fotosDeReferencia(m, "/images/products/1.jpg")).toEqual(["a.jpg", "b.webp", "c.webp"]);
    expect(fotosDeReferencia({}, "/images/products/1.jpg")).toEqual(["/images/products/1.jpg"]);
    expect(fotosDeReferencia({}, null)).toEqual([]);
  });
});

describe("visión: DeepSeek con el razonamiento apagado en TODAS las llamadas", () => {
  it("opcionesDeVision apaga el razonamiento solo para deepseek", async () => {
    const { opcionesDeVision } = await import("../media-entrante");
    expect(opcionesDeVision("deepseek")).toEqual({ thinking: { type: "disabled" } });
    expect(opcionesDeVision("ollama_local")).toEqual({});
  });
  it("las 4 funciones de visión usan opcionesDeVision", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    for (const f of ["media-entrante.ts", "ficha-desde-imagenes.ts", "leer-comprobante.ts", "activos-fabricante.ts"]) {
      const s = fs.readFileSync(path.resolve(__dirname, "..", f), "utf8");
      expect(s, f).toMatch(/\.\.\.opcionesDeVision\(proveedor\)/);
    }
  });
  it("consultas ES + EN sin duplicar (01-10-2026)", () => {
    expect(consultasDeBusqueda("mochila burbuja", "bubble backpack")).toEqual(["mochila burbuja", "bubble backpack"]);
    expect(consultasDeBusqueda("mochila", "mochila")).toEqual(["mochila"]);
    expect(consultasDeBusqueda("mochila", null)).toEqual(["mochila"]);
    expect(consultasDeBusqueda("  ", "backpack")).toEqual(["backpack"]);
  });
});
