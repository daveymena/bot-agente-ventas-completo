/**
 * ¿Esta foto la acepta Meta en un anuncio?
 *
 * Medido el 23-09-2026 con el corrector de postura: el anuncio no salía y el
 * commit del día culpó a "fotos de 5 MB". Las fotos reales del producto
 * (Dropi, `urlS3` = el original que subió el proveedor) miden 225×225 y pesan
 * 7 KB. Meta exige un mínimo de 600×600 px y acepta hasta 30 MB, así que el
 * problema era el opuesto: fotos demasiado CHICAS.
 *
 * Se lee el ancho y el alto de la cabecera del archivo, sin `sharp` (que no
 * está instalada en producción) ni ninguna otra dependencia nativa.
 */

export type FormatoImagen = "jpeg" | "png" | "webp" | "gif" | null;

export interface MedidaDeImagen {
  formato: FormatoImagen;
  ancho: number | null;
  alto: number | null;
}

/** Mínimo de Meta para una imagen de anuncio (feed 1:1). */
export const LADO_MINIMO_META = 600;

export function medirImagen(buf: Buffer): MedidaDeImagen {
  const nada: MedidaDeImagen = { formato: null, ancho: null, alto: null };
  if (!buf || buf.length < 12) return nada;

  // PNG: firma de 8 bytes, después el chunk IHDR con ancho y alto.
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
    if (buf.length < 24) return { ...nada, formato: "png" };
    return { formato: "png", ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
  }

  // GIF: ancho y alto little-endian en los bytes 6-9.
  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { formato: "gif", ancho: buf.readUInt16LE(6), alto: buf.readUInt16LE(8) };
  }

  // WebP: RIFF....WEBP y después VP8 / VP8L / VP8X.
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const tipo = buf.toString("ascii", 12, 16);
    if (tipo === "VP8X" && buf.length >= 30) {
      return { formato: "webp", ancho: 1 + buf.readUIntLE(24, 3), alto: 1 + buf.readUIntLE(27, 3) };
    }
    if (tipo === "VP8L" && buf.length >= 25) {
      const b = buf.readUInt32LE(21);
      return { formato: "webp", ancho: (b & 0x3fff) + 1, alto: ((b >> 14) & 0x3fff) + 1 };
    }
    if (tipo === "VP8 " && buf.length >= 30) {
      return { formato: "webp", ancho: buf.readUInt16LE(26) & 0x3fff, alto: buf.readUInt16LE(28) & 0x3fff };
    }
    return { ...nada, formato: "webp" };
  }

  // JPEG: se recorren los segmentos hasta el SOF (Start Of Frame).
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marca = buf[i + 1];
      // SOF0..SOF15, salvo DHT (C4), JPG (C8) y DAC (CC), que no traen medidas.
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { formato: "jpeg", alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
      }
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return { ...nada, formato: "jpeg" };
  }

  return nada;
}

/**
 * El motivo en palabras del dueño, o null si la foto sirve. Meta solo acepta
 * JPG o PNG en un creativo, y como mínimo 600 px de lado.
 */
export function porQueMetaLaRechaza(m: MedidaDeImagen): string | null {
  if (m.formato !== "jpeg" && m.formato !== "png") {
    return m.formato ? `está en formato ${m.formato.toUpperCase()} y Meta solo acepta JPG o PNG` : "no es una imagen";
  }
  if (m.ancho == null || m.alto == null) return null; // no se pudo medir: que decida Meta
  if (Math.min(m.ancho, m.alto) < LADO_MINIMO_META) {
    return `mide ${m.ancho}×${m.alto} px y Meta pide al menos ${LADO_MINIMO_META}×${LADO_MINIMO_META}`;
  }
  return null;
}
