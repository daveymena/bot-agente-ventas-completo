import { describe, it, expect } from "vitest";
import { tipoDeImagen } from "../whatsapp";

/**
 * Las fotos de los productos FÍSICOS salen del CDN de Dropi
 * (d39ru7awumhhs2.cloudfront.net); las de los digitales, de disco. Por eso
 * fallaban solo los físicos.
 *
 * Medido sobre el catálogo real (140 productos):
 *   · 56 físicos → todos con URL absoluta al CDN; 5 de ellos en .webp
 *   · 84 digitales → rutas locales (/images, /uploads), ninguna webp
 *
 * WhatsApp trata un webp sin `mimetype` declarado como STICKER: el cliente
 * recibe una calcomanía sin descripción en lugar de la foto con su ficha.
 */
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const webp = Buffer.concat([
  Buffer.from("RIFF", "ascii"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP", "ascii"),
]);

describe("el tipo de imagen se lee de los bytes, no de la extensión", () => {
  it("reconoce los formatos que manda el CDN", () => {
    expect(tipoDeImagen(jpeg)).toBe("image/jpeg");
    expect(tipoDeImagen(png)).toBe("image/png");
    expect(tipoDeImagen(webp)).toBe("image/webp");
    expect(tipoDeImagen(gif)).toBe("image/gif");
  });

  it("caza el webp, que es el que WhatsApp convierte en sticker", () => {
    // Es el caso de los 5 productos físicos en .webp del catálogo real.
    expect(tipoDeImagen(webp)).toBe("image/webp");
  });

  it("una extensión que miente no engaña: manda el contenido", () => {
    // Dropi sirve archivos cuyo nombre no siempre coincide con el formato.
    expect(tipoDeImagen(jpeg)).toBe("image/jpeg");
  });

  it("con basura o un buffer corto devuelve null, y se cae a jpeg", () => {
    expect(tipoDeImagen(Buffer.from([1, 2, 3]))).toBeNull();
    expect(tipoDeImagen(Buffer.alloc(0))).toBeNull();
    expect(tipoDeImagen(Buffer.from("<!DOCTYPE html><html>", "ascii"))).toBeNull();
  });
});
