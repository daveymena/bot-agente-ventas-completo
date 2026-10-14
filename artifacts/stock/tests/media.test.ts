import { describe, expect, it } from "vitest";
import { hammingHex, orientationOf, probeMp4, resolutionLabel } from "../server/lib/media";

/** Arma un átomo MP4 (size + type + payload). */
function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8); head.writeUInt32BE(body.length + 8, 0); head.write(type, 4, "latin1");
  return Buffer.concat([head, body]);
}
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };
const u64 = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(n), 0); return b; };
const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; };
const zeros = (n: number) => Buffer.alloc(n);
const fixed16 = (n: number) => u32(Math.round(n * 65536));

function fakeMp4(version: 0 | 1, { width = 1920, height = 1080, timescale = 1000, duration = 6000, mdhdScale = 12800, delta = 512 } = {}) {
  const mvhd = version === 1
    ? box("mvhd", Buffer.from([1, 0, 0, 0]), u64(0), u64(0), u32(timescale), u64(duration), zeros(80))
    : box("mvhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(timescale), u32(duration), zeros(80));
  const tkhd = version === 1
    ? box("tkhd", Buffer.from([1, 0, 0, 0]), u64(0), u64(0), u32(1), u32(0), u64(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), zeros(36), fixed16(width), fixed16(height))
    : box("tkhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), zeros(36), fixed16(width), fixed16(height));
  const mdhd = box("mdhd", Buffer.from([0, 0, 0, 0]), u32(0), u32(0), u32(mdhdScale), u32(0), u16(0), u16(0));
  const stts = box("stts", u32(0), u32(1), u32(150), u32(delta));
  const trak = box("trak", tkhd, box("mdia", mdhd, box("minf", box("stbl", stts))));
  return Buffer.concat([box("ftyp", Buffer.from("isom")), box("moov", mvhd, trak), box("mdat", zeros(16))]);
}

describe("probeMp4 (sin ffmpeg)", () => {
  it("lee duración, tamaño y fps de cabeceras versión 0", () => {
    const info = probeMp4(fakeMp4(0));
    expect(info).toEqual({ durationSec: 6, width: 1920, height: 1080, fps: 25 });
  });
  it("lee cabeceras versión 1 (64 bits)", () => {
    const info = probeMp4(fakeMp4(1, { width: 3840, height: 2160, duration: 12000 }));
    expect(info).toEqual({ durationSec: 12, width: 3840, height: 2160, fps: 25 });
  });
  it("vídeo vertical", () => {
    const info = probeMp4(fakeMp4(0, { width: 1080, height: 1920 }));
    expect([info.width, info.height]).toEqual([1080, 1920]);
    expect(orientationOf(info.width, info.height)).toBe("vertical");
  });
  it("no revienta con basura", () => {
    expect(probeMp4(Buffer.from("no soy un mp4"))).toEqual({ durationSec: null, width: 0, height: 0, fps: null });
  });
});

describe("utilidades de medios", () => {
  it("etiqueta de resolución", () => {
    expect(resolutionLabel(3840, 2160)).toBe("4K");
    expect(resolutionLabel(1920, 1080)).toBe("HD");
    expect(resolutionLabel(640, 480)).toBe("SD");
    expect(resolutionLabel(0, 0)).toBeNull();
  });
  it("orientación", () => {
    expect(orientationOf(3000, 1000)).toBe("panoramic");
    expect(orientationOf(1000, 1000)).toBe("square");
    expect(orientationOf(1600, 900)).toBe("horizontal");
    expect(orientationOf(900, 1600)).toBe("vertical");
  });
  it("distancia de Hamming entre dHash", () => {
    expect(hammingHex("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingHex("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hammingHex("f", "0")).toBe(4);
  });
});
