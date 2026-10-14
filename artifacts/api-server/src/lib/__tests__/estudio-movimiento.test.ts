/**
 * Movimiento "vivo" del Estudio: recorte del producto sin IA, movimiento
 * continuo por capa (flotar, latir, balancearse…), cámara nueva (paneo,
 * respirar, giro 3D), partículas de ambiente y clip de fondo. Las pruebas de
 * ffmpeg se saltan si no está instalado.
 */
import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, writeFileSync, existsSync, statSync } from "node:fs";

const tmp = mkdtempSync(path.join(os.tmpdir(), "estudio-mov-"));
process.env.IMAGE_STORE_DIR = tmp;

const { recortarProducto, sombraDeSilueta, mascaraDeConservacion, rellenarHuecos, UMBRAL_RECORTE } = await import("../estudio-anuncios/recorte");
const { agruparCapas, filtroDeEntrada, filtroMovimiento, filtroAmbiente, spriteDeAmbiente, argumentosDeClip, armarVideoDesdeEscenas, hayFfmpegDisponible, rutaLocalDeUpload } = await import("../estudio-anuncios/video");
const { contenidoDeMuestra } = await import("../estudio-anuncios/plantillas");
const { escenasAutomaticas, MOVIMIENTOS, MOVIMIENTOS_CAMARA, AMBIENTES } = await import("../estudio-anuncios/diseno");
const { renderizarDiseno } = await import("../estudio-anuncios/render");

/** Foto sintética: "producto" rojo con un asa fina y una etiqueta pequeña separada, sobre fondo casi blanco con ruido JPEG. */
async function fotoDeProducto(fondo = "#f7f7f5"): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="${fondo}"/>
    <rect x="180" y="200" width="240" height="320" rx="24" fill="#c0392b"/>
    <path d="M420 300 q90 60 0 150" stroke="#c0392b" stroke-width="10" fill="none"/>
    <text x="300" y="560" font-size="26" text-anchor="middle" fill="#222" font-family="sans-serif">PREMIUM</text>
    <circle cx="60" cy="60" r="2" fill="#999"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

describe("recorte del producto sin IA", () => {
  it("recorta un producto sobre fondo liso con confianza alta y conserva asa y etiqueta", async () => {
    const r = await recortarProducto(await fotoDeProducto());
    expect(r).not.toBeNull();
    expect(r!.confianza).toBeGreaterThanOrEqual(UMBRAL_RECORTE);
    expect(r!.fondo.toLowerCase()).toMatch(/^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/);
    // La caja abarca el cuerpo (180–420 × 200–520), el asa (la curva llega a x≈465) y la etiqueta (hasta y≈570).
    expect(r!.caja.x).toBeLessThanOrEqual(185);
    expect(r!.caja.x + r!.caja.w).toBeGreaterThanOrEqual(470);
    expect(r!.caja.y + r!.caja.h).toBeGreaterThanOrEqual(560);
    const meta = await sharp(r!.png).metadata();
    expect(meta.hasAlpha).toBe(true);
    // Fuera del producto es transparente; dentro, opaco.
    const { data, info } = await sharp(r!.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alfaEn = (x: number, y: number) => data[((y - r!.caja.y) * info.width + (x - r!.caja.x)) * 4 + 3]!;
    expect(alfaEn(300, 360)).toBeGreaterThan(240);
    expect(alfaEn(r!.caja.x + 3, 300)).toBeLessThan(20); // margen dentro de la caja, fuera del producto
  });

  it("no recorta cuando el fondo no es liso (foto de ambiente) ni cuando el producto llena la foto", async () => {
    const ruido = Buffer.alloc(300 * 300 * 3);
    for (let i = 0; i < ruido.length; i++) ruido[i] = (i * 7919) % 251;
    const foto = await sharp(ruido, { raw: { width: 300, height: 300, channels: 3 } }).jpeg().toBuffer();
    const r = await recortarProducto(foto);
    expect(r).not.toBeNull();
    expect(r!.confianza).toBeLessThan(UMBRAL_RECORTE);
    expect(r!.motivo).toMatch(/no es liso/i);
    const lleno = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#fff"/><rect x="4" y="4" width="292" height="292" fill="#123"/></svg>`)).png().toBuffer();
    const r2 = await recortarProducto(lleno);
    expect(r2!.confianza).toBeLessThan(UMBRAL_RECORTE);
  });

  it("deja entero un banner diseñado (producto + textos e iconos sueltos) en vez de comerse las letras", async () => {
    // Un "montaje" típico de catálogo: foto + titulares pequeños + iconos repartidos por toda la pieza.
    const letras = Array.from({ length: 14 }, (_, i) => `<rect x="${40 + (i % 7) * 70}" y="${i < 7 ? 40 : 640}" width="34" height="14" fill="#333"/>`).join("");
    const iconos = [60, 540].flatMap((x) => [200, 320, 440].map((y) => `<circle cx="${x}" cy="${y}" r="9" fill="#1d4ed8"/>`)).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="#ffffff"/>
      <rect x="200" y="180" width="200" height="300" rx="20" fill="#c0392b"/>${letras}${iconos}</svg>`;
    const r = await recortarProducto(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
    expect(r).not.toBeNull();
    expect(r!.confianza).toBeLessThan(UMBRAL_RECORTE);
    expect(r!.motivo).toMatch(/montaje/i);
    expect(r!.piezas!.sueltos).toBeGreaterThanOrEqual(6);
  });

  it("quita la sombra proyectada bajo el producto sin tocar el producto", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="#f4f4f2"/>
      <ellipse cx="330" cy="528" rx="190" ry="26" fill="#b9b9b6"/>
      <rect x="180" y="160" width="220" height="360" rx="16" fill="#1e3a5f"/></svg>`;
    const r = await recortarProducto(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
    expect(r).not.toBeNull();
    expect(r!.confianza).toBeGreaterThanOrEqual(UMBRAL_RECORTE);
    // Sin la sombra, la caja termina cerca del pie del producto (y=520) y no en el extremo de la elipse (x≈520).
    expect(r!.caja.y + r!.caja.h).toBeLessThanOrEqual(546);
    expect(r!.caja.x + r!.caja.w).toBeLessThanOrEqual(440);
    const { data, info } = await sharp(r!.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alfaEn = (x: number, y: number) => data[((y - r!.caja.y) * info.width + (x - r!.caja.x)) * 4 + 3]!;
    expect(alfaEn(290, 500)).toBeGreaterThan(240); // el cuerpo justo encima de la sombra sigue opaco
  });

  it("marca como no fiable un producto del color del fondo (zapatilla blanca sobre gris)", async () => {
    // Cuerpo gris claro casi igual al fondo con trama más oscura: la inundación se cuela por el cuerpo y deja islas.
    const trama = Array.from({ length: 24 }, (_, i) => `<circle cx="${150 + (i % 8) * 42}" cy="${235 + Math.floor(i / 8) * 42}" r="14" fill="#b3b3b3"/>`).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#d9d9d9"/>
      <rect x="120" y="200" width="360" height="220" rx="30" fill="#e2e2e2"/>${trama}
      <rect x="120" y="350" width="360" height="70" rx="10" fill="#e8553f"/></svg>`;
    const r = await recortarProducto(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
    expect(r).not.toBeNull();
    expect(r!.confianza).toBeLessThan(UMBRAL_RECORTE);
    expect(r!.motivo).toMatch(/color del fondo|sueltos|montaje/i);
  });

  it("rellena huecos pequeños, respeta un hueco grande legítimo y mide la fuga de una trama", () => {
    const W = 120;
    const cuadrado = () => { const m = new Uint8Array(W * W); for (let y = 20; y < 100; y++) for (let x = 20; x < 100; x++) m[y * W + x] = 1; return m; };
    // 16 brillos de 6×6 dentro del producto: se rellenan todos y no hay fuga.
    const brillos = cuadrado();
    for (let i = 0; i < 16; i++) { const ox = 26 + (i % 4) * 18, oy = 26 + Math.floor(i / 4) * 18; for (let y = oy; y < oy + 6; y++) for (let x = ox; x < ox + 6; x++) brillos[y * W + x] = 0; }
    const a = rellenarHuecos(brillos, W, W);
    expect(a.rellenados).toBe(16 * 36);
    expect(a.fuga).toBeLessThan(0.02);
    expect(brillos[30 * W + 30]).toBe(1);
    // Un aro: hueco único del 25 % → se conserva y no cuenta como fuga.
    const aro = cuadrado();
    for (let y = 40; y < 80; y++) for (let x = 40; x < 80; x++) aro[y * W + x] = 0;
    const b = rellenarHuecos(aro, W, W);
    expect(b.rellenados).toBe(0);
    expect(aro[60 * W + 60]).toBe(0);
    expect(b.fuga).toBeLessThan(0.02);
    // Mitad derecha "peinada" con ranuras de 4 px abiertas al exterior (así se cuela la inundación): el cierre las sella y aflora la fuga.
    const trama = cuadrado();
    for (let y = 20; y < 100; y++) for (let x = 60; x < 100; x++) if (Math.floor(y / 4) % 2) trama[y * W + x] = 0;
    const c = rellenarHuecos(trama, W, W);
    expect(c.fuga).toBeGreaterThan(0.12);
  });

  it("respeta un PNG que ya viene recortado y genera sombra de silueta y máscara de conservación", async () => {
    const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="60" fill="#0a0"/></svg>`)).png().toBuffer();
    const r = await recortarProducto(png);
    expect(r!.confianza).toBe(1);
    expect(r!.ancho).toBeLessThanOrEqual(124);
    const s = await sombraDeSilueta(r!.png);
    const ms = await sharp(s.png).metadata();
    expect(ms.width).toBe(r!.ancho + s.margen * 2);
    const m = await mascaraDeConservacion(r!);
    const mm = await sharp(m).metadata();
    expect([mm.width, mm.height]).toEqual([200, 200]);
    const { data, info } = await sharp(m).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[(100 * info.width + 100) * 4 + 3]).toBe(255); // centro: conservar
    expect(data[(10 * info.width + 10) * 4 + 3]).toBe(0); // esquina: la IA puede pintar
  });
});

describe("animación por capas con movimiento continuo", () => {
  const capas: any[] = [
    { id: "f", tipo: "fondo", x: 0, y: 0, w: 1080, h: 1920, relleno: "#111" },
    { id: "m", tipo: "texto", x: 64, y: 100, w: 400, h: 40, texto: "MARCA", tam: 30, color: "#fff" },
    { id: "i", tipo: "imagen", src: "x.png", ajuste: "contener", x: 100, y: 400, w: 880, h: 900, anim: { entrada: "zoom", movimiento: "flotar", intensidad: 3 } },
    { id: "t", tipo: "texto", x: 64, y: 1400, w: 952, h: 200, texto: "Hola", tam: 80, color: "#fff", anim: { entrada: "deslizar-abajo", retraso: 0.4 } },
    { id: "p", tipo: "circulo", x: 700, y: 1200, w: 300, h: 300, relleno: "#ff0", anim: { movimiento: "latido" } },
  ];

  it("agrupa por entrada + movimiento y deja la base debajo; con clip todo va arriba", () => {
    const { base, grupos } = agruparCapas(capas);
    expect(base.map((c) => c.id)).toEqual(["f", "m"]);
    expect(grupos.map((g) => [g.movimiento, g.entrada, g.intensidad])).toEqual([["flotar", "zoom", 3], [null, "deslizar-abajo", 2], ["latido", null, 2]]);
    const conClip = agruparCapas(capas, { todoArriba: true });
    expect(conClip.base.map((c) => c.id)).toEqual(["f"]);
    expect(conClip.grupos[0]!.capas.map((c) => c.id)).toEqual(["m"]);
  });

  it("escribe filtros válidos por cada movimiento, con posición por el centro de la caja", () => {
    const caja = { x: 100, y: 400, w: 880, h: 900 };
    for (const mov of Object.keys(MOVIMIENTOS) as any[]) {
      const f = filtroDeEntrada(2, { capas: [], entrada: "zoom", retraso: 0, duracion: 0.6, salida: null, movimiento: mov, intensidad: 2 }, caja, 3, "b0", "c0");
      expect(f).toContain("[2:v]format=rgba");
      expect(f).toContain("overlay=x='540-w/2+");
      expect(f).toContain("y='850-h/2+");
      expect(f.endsWith("[c0];")).toBe(true);
      if (mov === "balancear" || mov === "girar") expect(f).toContain("rotate=a=");
      if (mov === "latido" || mov === "acercar") { expect(f).toContain("scale=w='max(2,iw*(1+"); expect(f).toContain(")*(0.5+0.5*("); }
    }
    // Sin movimiento ni entrada: queda quieta en su sitio.
    const quieta = filtroDeEntrada(1, { capas: [], entrada: null, retraso: 0, duracion: 0.5, salida: null, movimiento: null, intensidad: 2 }, caja, 3, "b0", "c0");
    expect(quieta).toBe("[1:v]format=rgba[l1];[b0][l1]overlay=x='540-w/2+0+0':y='850-h/2+0+0':format=auto:eval=frame[c0];");
  });

  it("ofrece cámara nueva (paneo, respirar, giro 3D) y partículas con sprite por ambiente", async () => {
    for (const mov of Object.keys(MOVIMIENTOS_CAMARA) as any[]) {
      const f = filtroMovimiento(mov, 90, 0, "v", "yuv420p");
      expect(f.endsWith("[v]")).toBe(true);
      expect(f).toContain("fps=30");
    }
    expect(filtroMovimiento("giro3d", 90, 0, "v", "rgba")).toContain("perspective=");
    for (const a of Object.keys(AMBIENTES) as any[]) {
      const png = await spriteDeAmbiente(a);
      expect(png, `sprite de ${a}`).not.toBeNull();
      const f = filtroAmbiente(1, a, 3, "b0", "amb");
      expect(f).toContain("split=");
      expect(f.endsWith("[amb];")).toBe(true);
      expect(filtroAmbiente(1, a, 3, "b0", "amb")).toBe(f); // determinista
    }
    const args = argumentosDeClip({ base: "/x/base.png", grupos: [], ambiente: { png: "/x/amb.png", tipo: "nieve", semilla: 1 } }, "fijo", 2, 0, "/x/out.mp4");
    expect(args.join(" ")).toContain("[amb]format=yuv420p[v]");
    const conClip = argumentosDeClip({ base: "/x/base.png", grupos: [], clip: "/x/clip.mp4" }, "fijo", 2, 0, "/x/out.mp4");
    expect(conClip.slice(0, 5)).toEqual(["-y", "-stream_loop", "-1", "-t", "2"]);
    expect(conClip.join(" ")).toContain("force_original_aspect_ratio=increase");
  });

  it("solo acepta clips que viven bajo IMAGE_STORE_DIR", () => {
    writeFileSync(path.join(tmp, "clip.mp4"), "x");
    expect(rutaLocalDeUpload("/uploads/clip.mp4")).toBe(path.join(tmp, "clip.mp4"));
    expect(rutaLocalDeUpload("https://ventasproia.com/uploads/clip.mp4?v=1")).toBe(path.join(tmp, "clip.mp4"));
    expect(rutaLocalDeUpload("/uploads/../../../etc/passwd")).toBeNull();
    expect(rutaLocalDeUpload("https://otro.com/x.mp4")).toBeNull();
  });
});

describe("vídeo real con producto recortado que flota, partículas y giro 3D", () => {
  let ffmpeg = false;
  beforeAll(async () => { ffmpeg = await hayFfmpegDisponible(); });

  it("arma el clip (o se salta si no hay ffmpeg)", async () => {
    if (!ffmpeg) { console.warn("sin ffmpeg: prueba de render saltada"); return; }
    const rec = await recortarProducto(await fotoDeProducto());
    writeFileSync(path.join(tmp, "recorte.png"), rec!.png);
    const c = { ...contenidoDeMuestra(), fotos: ["/uploads/recorte.png"] };
    const escenas = escenasAutomaticas(c, { guion: "clasico", estilo: "pop", tema: "navidad" }).slice(0, 2);
    escenas[0]!.movimiento = "giro3d"; escenas[0]!.ambiente = "nieve";
    escenas[1]!.movimiento = "balanceo"; escenas[1]!.ambiente = "confeti";
    for (const e of escenas) {
      e.duracion = 1.6;
      for (const capa of e.diseno.capas) {
        if (capa.tipo === "imagen") { capa.recortada = true; capa.anim = { ...(capa.anim || {}), movimiento: "flotar", intensidad: 2 }; }
        if (capa.tipo === "icono") capa.anim = { ...(capa.anim || {}), movimiento: "balancear" };
      }
    }
    // La pieza estática también entiende el recorte (sombra de silueta, sin esquinas).
    const png = await renderizarDiseno(escenas[0]!.diseno);
    expect((await sharp(png).metadata()).width).toBe(1080);
    const v = await armarVideoDesdeEscenas(escenas as any, { carpeta: tmp, nombre: "mov.mp4", conVoz: false, conMusica: false });
    expect(existsSync(v.ruta)).toBe(true);
    expect(statSync(v.ruta).size).toBeGreaterThan(20_000);
    expect(v.duracion).toBeGreaterThan(2.4);
  }, 180_000);
});
