import { describe, it, expect } from "vitest";
import { medirImagen, porQueMetaLaRechaza } from "../medidas-de-imagen";

/** JPEG mínimo: SOI + APP0 (JFIF) + SOF0 con las medidas. */
function jpeg(ancho: number, alto: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(alto, 5);
  sof.writeUInt16BE(ancho, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function png(ancho: number, alto: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(ancho, 16);
  b.writeUInt32BE(alto, 20);
  return b;
}

function webpVp8x(ancho: number, alto: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(ancho - 1, 24, 3);
  b.writeUIntLE(alto - 1, 27, 3);
  return b;
}

describe("medir una foto sin sharp", () => {
  it("lee las medidas de un JPEG", () => {
    expect(medirImagen(jpeg(225, 225))).toEqual({ formato: "jpeg", ancho: 225, alto: 225 });
  });
  it("lee las medidas de un PNG", () => {
    expect(medirImagen(png(1080, 1350))).toEqual({ formato: "png", ancho: 1080, alto: 1350 });
  });
  it("reconoce un WebP con sus medidas", () => {
    expect(medirImagen(webpVp8x(800, 800))).toEqual({ formato: "webp", ancho: 800, alto: 800 });
  });
  it("un HTML o un cartel de error no es una imagen", () => {
    expect(medirImagen(Buffer.from("<!DOCTYPE html><html>no encontrada</html>")).formato).toBeNull();
  });
});

describe("lo que Meta acepta en un anuncio", () => {
  it("la foto real del corrector (225×225, Dropi) se rechaza diciendo por qué", () => {
    expect(porQueMetaLaRechaza(medirImagen(jpeg(225, 225)))).toMatch(/225×225.*600×600/);
  });
  it("basta con que UN lado sea chico: 1200×400 no sirve", () => {
    expect(porQueMetaLaRechaza(medirImagen(jpeg(1200, 400)))).toMatch(/1200×400/);
  });
  it("600×600 JPG y 1080×1350 PNG sirven", () => {
    expect(porQueMetaLaRechaza(medirImagen(jpeg(600, 600)))).toBeNull();
    expect(porQueMetaLaRechaza(medirImagen(png(1080, 1350)))).toBeNull();
  });
  it("WebP no sirve aunque sea grande", () => {
    expect(porQueMetaLaRechaza(medirImagen(webpVp8x(1080, 1080)))).toMatch(/WEBP/);
  });
});
