import { describe, it, expect } from "vitest";
import { candidatosDeBusqueda, vendidosDe, fotoGrande, esFotoDeGaleria, tramosParaClips, activosAprobados, ARCHIVO_FABRICANTE, veredictoEsSi, fotosDeReferencia, consultasDeBusqueda, tipoDeArchivo, veredictoDeVideo } from "../activos-fabricante";

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

/* ═══════════════════════════════════════════════════════════════════════════
 * LO QUE SE BAJA HAY QUE MIRARLO (bug del 02-10-2026)
 *
 * `bajar()` solo miraba status y TAMAÑO: una respuesta de AliExpress con HTTP
 * 200 y `text/html` (muro de login, captcha, redirección) pasaba el filtro y se
 * guardaba como .mp4/.jpg. Eso llegaba a la landing como video dañado o imagen
 * mala. Medido contra AliExpress real: una ficha devuelve 200 + 73 KB de HTML y
 * el filtro viejo la aceptaba.
 * ═══════════════════════════════════════════════════════════════════════════ */

const bytes = (...b: number[]) => Buffer.from(b);
const relleno = (cabecera: number[] | string, n = 2048) => {
  const c = typeof cabecera === "string" ? Buffer.from(cabecera, "binary") : bytes(...cabecera);
  return Buffer.concat([c, Buffer.alloc(n)]);
};
const ftyp = (marca: string) => relleno([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, ...Buffer.from(marca, "ascii")]);

describe("tipoDeArchivo: la firma manda, no la extensión de la URL", () => {
  it("reconoce las imágenes que sirve AliExpress", () => {
    expect(tipoDeArchivo(relleno([0xff, 0xd8, 0xff, 0xe0]))).toBe("imagen"); // JPEG
    expect(tipoDeArchivo(relleno([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("imagen"); // PNG
    expect(tipoDeArchivo(relleno("RIFF\x00\x00\x00\x00WEBPVP8 "))).toBe("imagen"); // WEBP
    expect(tipoDeArchivo(relleno("GIF89a"))).toBe("imagen"); // GIF
    expect(tipoDeArchivo(ftyp("avif"))).toBe("imagen"); // AVIF (marca ftyp)
  });

  it("reconoce los videos, separándolos de AVIF aunque compartan `ftyp`", () => {
    expect(tipoDeArchivo(ftyp("isom"))).toBe("video");
    expect(tipoDeArchivo(ftyp("mp42"))).toBe("video");
    expect(tipoDeArchivo(relleno([0x1a, 0x45, 0xdf, 0xa3]))).toBe("video"); // WebM/MKV
  });

  it("caza el HTML con 200: es lo que rompía todo", () => {
    expect(tipoDeArchivo(Buffer.concat([Buffer.from("<!DOCTYPE html><html><body>captcha"), Buffer.alloc(3000)]))).toBe("html");
    expect(tipoDeArchivo(Buffer.concat([Buffer.from("\n  <html lang=\"es\">"), Buffer.alloc(3000)]))).toBe("html");
  });

  it("lo que no es nada no pasa por archivo", () => {
    expect(tipoDeArchivo(Buffer.alloc(0))).toBe("otro");
    expect(tipoDeArchivo(Buffer.from("hola"))).toBe("otro");
    expect(tipoDeArchivo(Buffer.alloc(5000, 0x41))).toBe("otro");
  });
});

describe("fotoGrande: las tres formas de miniatura de AliExpress", () => {
  it("por SUFIJO, en jpg y también en avif (que faltaba)", () => {
    expect(fotoGrande("//ae-pic-a1.aliexpress-media.com/kf/Sabc.jpg_220x220q75.jpg_.avif")).toBe(
      "https://ae-pic-a1.aliexpress-media.com/kf/Sabc.jpg",
    );
    expect(fotoGrande("https://x.aliexpress-media.com/kf/Sfoto.webp_960x960.webp")).toBe(
      "https://x.aliexpress-media.com/kf/Sfoto.webp",
    );
  });

  it("por RUTA: '/96x96.png' era el cuadradito que se bajaba tal cual", () => {
    expect(fotoGrande("https://ae-pic-a1.aliexpress-media.com/kf/S75c9e889/96x96.png")).toBe(
      "https://ae-pic-a1.aliexpress-media.com/kf/S75c9e889.png",
    );
  });

  it("con la basura que trae el HTML (`)`, comillas, punto y coma)", () => {
    expect(fotoGrande("https://ae-pic-a1.aliexpress-media.com/kf/S7f30/96x96.png)")).toBe(
      "https://ae-pic-a1.aliexpress-media.com/kf/S7f30.png",
    );
    expect(fotoGrande('"https://x.aliexpress-media.com/kf/Sa.jpg"')).toBe("https://x.aliexpress-media.com/kf/Sa.jpg");
  });

  it("una foto que ya es grande no se toca", () => {
    expect(fotoGrande("https://ae01.alicdn.com/kf/Hx.png?x=1")).toBe("https://ae01.alicdn.com/kf/Hx.png");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * UN MP4 TRUNCADO PASA LA FIRMA Y NO SE PUEDE CORTAR
 *
 * La otra mitad de "videos dañados": la descarga se corta a la mitad (o el
 * contenedor viene roto) y la cabecera está bien, así que los magic bytes no lo
 * cazan. Sin esto, ffmpeg producía clips vacíos o con un solo cuadro.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe("veredictoDeVideo: ¿el video se puede usar de verdad?", () => {
  it("un video sano pasa, con su duración", () => {
    const salida = JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "18.42" } });
    expect(veredictoDeVideo(salida)).toEqual({ ok: true, duracion: 18.42 });
  });

  it("sin pista de video no sirve (aunque el contenedor sea válido)", () => {
    const salida = JSON.stringify({ streams: [{ codec_type: "audio" }], format: { duration: "30" } });
    const r = veredictoDeVideo(salida);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/pista de video/);
  });

  it("truncado: sin duración legible se descarta (no se corta un clip vacío)", () => {
    const sinDuracion = JSON.stringify({ streams: [{ codec_type: "video" }], format: {} });
    expect(veredictoDeVideo(sinDuracion).ok).toBe(false);
    const cero = JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "0" } });
    const r = veredictoDeVideo(cero);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/duración ilegible/);
  });

  it("menos de un segundo no alcanza para un tramo de 3 s", () => {
    expect(veredictoDeVideo(JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "0.6" } })).ok).toBe(false);
  });

  it("lo que no es JSON no se toma por bueno", () => {
    expect(veredictoDeVideo("").ok).toBe(false);
    expect(veredictoDeVideo("ffprobe: error abriendo el archivo").ok).toBe(false);
  });
});
