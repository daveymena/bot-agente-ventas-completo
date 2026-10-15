/**
 * Recorte de fondo de fotos de producto, con sharp (ya instalado) y sin
 * modelos de IA.
 *
 * Por qué así y no con un modelo: las fotos que más se usan son las del
 * proveedor (Dropi, Woo), casi siempre sobre fondo liso blanco o gris. Para
 * ese caso alcanza con detectar el color del borde y "inundar" desde los
 * bordes todo lo que se le parece: rápido, gratis, sin bajar 100 MB de modelo
 * al contenedor ni mandar las fotos del negocio a un tercero.
 *
 * Cuando el fondo NO es liso (foto en uso, ambiente), no se intenta: se
 * devuelve `ok:false` con el motivo y la maqueta usa la foto completa. Un mal
 * recorte (producto mordido, halos) es peor que no recortar.
 *
 * Se guarda en /uploads/recortes/<hash>.png: el mismo origen da el mismo
 * archivo, así que la segunda vez es instantáneo.
 */
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { getImageStoreDir } from "../image-store";
import { logger } from "../logger";

export type ResultadoRecorte = { ok: true; url: string; cobertura: number } | { ok: false; motivo: string };

const MAX_LADO = 1200;

async function bajar(src: string): Promise<Buffer | null> {
  if (src.startsWith("/uploads/")) {
    const base = getImageStoreDir();
    const ruta = path.resolve(base, src.replace(/^\/uploads\//, "").split("?")[0]!);
    if (!ruta.startsWith(path.resolve(base))) return null;
    return readFile(ruta).catch(() => null);
  }
  if (!/^https?:\/\//i.test(src)) return null;
  // Solo fotos públicas: nada de pedirle al servidor direcciones internas.
  try {
    const h = new URL(src).hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/.test(h)) return null;
  } catch { return null; }
  try {
    const r = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 200 && b.length < 25 * 1024 * 1024 ? b : null;
  } catch { return null; }
}

const dist = (d: Uint8Array, i: number, r: number, g: number, b: number) => {
  const dr = d[i]! - r, dg = d[i + 1]! - g, db = d[i + 2]! - b;
  return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11) * 1.7;
};

/**
 * La máscara (1 = producto) de una imagen RGBA. Exportada para las pruebas.
 * Devuelve null si el fondo no es lo bastante liso para recortar con
 * seguridad.
 */
export function mascaraDeFondoLiso(datos: Uint8Array, ancho: number, alto: number, tolerancia = 34): { mascara: Uint8Array; fondo: [number, number, number] } | { motivo: string } {
  // 1) El color del fondo: la mediana de los píxeles del borde.
  const borde: number[] = [];
  const empujar = (x: number, y: number) => borde.push((y * ancho + x) * 4);
  for (let x = 0; x < ancho; x += 2) { empujar(x, 0); empujar(x, alto - 1); }
  for (let y = 0; y < alto; y += 2) { empujar(0, y); empujar(ancho - 1, y); }
  const med = (k: number) => { const v = borde.map((i) => datos[i + k]!).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]!; };
  const fondo: [number, number, number] = [med(0), med(1), med(2)];
  // Un borde transparente (PNG ya recortado) también es "fondo".
  const transparentes = borde.filter((i) => datos[i + 3]! < 20).length / borde.length;
  // 2) ¿Es liso? La gran mayoría del borde tiene que parecerse a la mediana.
  const parecidos = borde.filter((i) => datos[i + 3]! < 20 || dist(datos, i, ...fondo) < tolerancia).length / borde.length;
  if (parecidos < 0.86) return { motivo: `el fondo no es liso (solo ${Math.round(parecidos * 100)}% del borde es del mismo color): es una foto de ambiente` };

  // 3) Inundar desde el borde: es fondo lo conectado al borde y parecido al fondo.
  const n = ancho * alto;
  const esFondo = new Uint8Array(n);
  const cola = new Int32Array(n);
  let ini = 0, fin = 0;
  const lumFondo = 0.3 * fondo[0] + 0.59 * fondo[1] + 0.11 * fondo[2];
  const croma = (i: number) => Math.max(datos[i]!, datos[i + 1]!, datos[i + 2]!) - Math.min(datos[i]!, datos[i + 1]!, datos[i + 2]!);
  const lum = (i: number) => 0.3 * datos[i]! + 0.59 * datos[i + 1]! + 0.11 * datos[i + 2]!;
  /**
   * Es fondo si se parece al color del fondo, O si es un paso SUAVE desde un
   * píxel que ya es fondo y es gris (sin color): así se van el degradado del
   * estudio y las sombras difusas, pero el borrado se frena en el borde nítido
   * del producto (ahí el salto entre vecinos es grande).
   */
  const probar = (p: number, desde: number) => {
    if (esFondo[p]) return;
    const i = p * 4;
    const ok = datos[i + 3]! < 20
      || dist(datos, i, ...fondo) < tolerancia
      || (desde >= 0 && dist(datos, i, datos[desde * 4]!, datos[desde * 4 + 1]!, datos[desde * 4 + 2]!) < 9 && croma(i) < 22 && lum(i) > lumFondo * 0.42);
    if (ok) { esFondo[p] = 1; cola[fin++] = p; }
  };
  for (let x = 0; x < ancho; x++) { probar(x, -1); probar((alto - 1) * ancho + x, -1); }
  for (let y = 0; y < alto; y++) { probar(y * ancho, -1); probar(y * ancho + ancho - 1, -1); }
  while (ini < fin) {
    const p = cola[ini++]!;
    const x = p % ancho, y = (p - x) / ancho;
    if (x > 0) probar(p - 1, p);
    if (x < ancho - 1) probar(p + 1, p);
    if (y > 0) probar(p - ancho, p);
    if (y < alto - 1) probar(p + ancho, p);
  }
  // ── Seguro contra "comerse" el producto ──────────────────────────────────
  // El paso suave (degradados, sombras) puede colarse en un producto gris y
  // liso (un sillón de tela gris: caso real del 14-10). Lo que se borró SOLO
  // por ese paso tiene que ser liso como una sombra; si tiene textura, era
  // producto: se vuelve al recorte estricto (que deja la sombra, pero no
  // muerde nada).
  let extra = 0, texturaExtra = 0;
  for (let p = 0; p < n; p++) {
    if (!esFondo[p]) continue;
    const i = p * 4;
    if (datos[i + 3]! < 20 || dist(datos, i, ...fondo) < tolerancia) continue;
    extra++;
    const x = p % ancho;
    if (x < ancho - 1 && p + ancho < n) texturaExtra += Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + ancho * 4));
  }
  const conservador = extra > n * 0.01 && texturaExtra / extra > 3.2;
  const mascara = new Uint8Array(n);
  let producto = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    const fondoEstricto = datos[i + 3]! < 20 || dist(datos, i, ...fondo) < tolerancia;
    const esProducto = conservador ? !(esFondo[p] && fondoEstricto) : !esFondo[p];
    if (esProducto) { mascara[p] = 1; producto++; }
  }
  const cobertura = producto / n;
  // ── ¿Quedaría sucio? ────────────────────────────────────────────────────
  // Producto claro sobre fondo claro (la faja blanca de Dropi, caso real del
  // 14-10): los huecos de fondo encerrados por el producto no se pueden
  // quitar sin morder las partes blancas del producto. Medido en 6 fotos:
  // las que quedaban limpias tenían <= 8,5 % de "fondo" dentro; la sucia, 16 %.
  let fondoDentro = 0;
  for (let p = 0; p < n; p++) if (mascara[p] && datos[p * 4 + 3]! >= 20 && dist(datos, p * 4, ...fondo) < tolerancia) fondoDentro++;
  if (producto > 0 && fondoDentro / producto > 0.12) return { motivo: "producto claro sobre fondo claro: el recorte dejaría manchas del fondo dentro del producto" };
  if (transparentes > 0.9 && cobertura > 0.02) return { mascara, fondo }; // ya venía recortada
  if (cobertura < 0.04) return { motivo: "casi no quedó producto: el producto se confunde con el fondo" };
  if (cobertura > 0.97) return { motivo: "no se encontró fondo para quitar" };
  return { mascara, fondo };
}

export async function recortarFondo(src: string): Promise<ResultadoRecorte> {
  const clave = createHash("sha1").update(src).digest("hex").slice(0, 20);
  const dir = path.join(getImageStoreDir(), "recortes");
  const archivo = path.join(dir, `${clave}.png`);
  const url = `/uploads/recortes/${clave}.png`;
  try { const s = await stat(archivo); if (s.size > 0) return { ok: true, url, cobertura: -1 }; } catch { /* no estaba */ }

  const buf = await bajar(src);
  if (!buf) return { ok: false, motivo: "no se pudo bajar la foto" };
  const sharp = (await import("sharp")).default;
  try {
    const { data, info } = await sharp(buf).rotate().resize(MAX_LADO, MAX_LADO, { fit: "inside", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Una foto chica no da un recorte limpio (ni sirve a 1080 px en un anuncio).
    if (Math.min(info.width, info.height) < 320) return { ok: false, motivo: `la foto es muy chica (${info.width}×${info.height} px): conviene una de al menos 800 px` };
    const r = mascaraDeFondoLiso(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height);
    if ("motivo" in r) return { ok: false, motivo: r.motivo };
    // Alfa = máscara, con el borde suavizado (sin escalones ni halo duro).
    const alfa = Buffer.alloc(info.width * info.height);
    let n = 0;
    for (let p = 0; p < alfa.length; p++) { alfa[p] = r.mascara[p] ? 255 : 0; n += r.mascara[p]!; }
    const alfaSuave = await sharp(alfa, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(1.1).extractChannel(0).raw().toBuffer();
    // ⚠️ Sin extractChannel, sharp devuelve el desenfoque en 3 canales y la
    // transparencia salía mezclada en bloques (producto "mordido", 14-10).
    const rgb = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).removeAlpha().raw().toBuffer();
    const png = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } })
      .joinChannel(alfaSuave, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .trim({ threshold: 1 })
      .toBuffer();
    await mkdir(dir, { recursive: true });
    await writeFile(archivo, png);
    logger.info({ src: src.slice(0, 80), cobertura: n / alfa.length }, "[Recorte] fondo quitado");
    return { ok: true, url, cobertura: n / alfa.length };
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Recorte] falló");
    return { ok: false, motivo: "no se pudo procesar la foto" };
  }
}

/** Recorta las primeras fotos que se puedan, sin pasarse de tiempo. */
export async function recortesDe(fotos: string[], max = 2, msMax = 9000): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const limite = Date.now() + msMax;
  for (const f of fotos.slice(0, 4)) {
    if (Object.keys(out).length >= max || Date.now() > limite) break;
    const r = await Promise.race([recortarFondo(f), new Promise<ResultadoRecorte>((ok) => setTimeout(() => ok({ ok: false, motivo: "tardó demasiado" }), Math.max(500, limite - Date.now())))]);
    if (r.ok) out[f] = r.url;
  }
  return out;
}

/**
 * El color propio del PRODUCTO (no del fondo): el tono con más presencia
 * entre los píxeles opacos del recorte, pesado por saturación. Es de donde
 * salen las paletas del kit; sacarlo de la foto entera daba el gris del
 * estudio (14-10) y las paletas salían grises.
 */
export async function colorDelRecorte(urlRecorte: string): Promise<string | null> {
  const buf = await bajar(urlRecorte);
  if (!buf) return null;
  const sharp = (await import("sharp")).default;
  const { data } = await sharp(buf).resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cubetas = Array.from({ length: 24 }, () => ({ peso: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat < 0.2 || max < 40) continue; // grises, negros y blancos no definen marca
    let h = 0;
    const d = max - min;
    h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const k = Math.floor((((h * 60) + 360) % 360) / 15);
    const c = cubetas[k]!;
    c.peso += sat; c.r += r * sat; c.g += g * sat; c.b += b * sat;
  }
  const mejor = cubetas.reduce((a, c) => (c.peso > a.peso ? c : a));
  if (mejor.peso < 3) return null;
  const hex = (v: number) => Math.round(v / mejor.peso).toString(16).padStart(2, "0");
  return `#${hex(mejor.r)}${hex(mejor.g)}${hex(mejor.b)}`;
}
