/**
 * Recorte del producto (quitar el fondo) sin IA ni modelos: sirve para la
 * mayoría de las fotos de catálogo, que vienen sobre fondo liso (blanco, gris,
 * un color). Con el producto recortado el Estudio puede ponerlo sobre fondos
 * del tema, darle sombra real y, en el vídeo, moverlo por su cuenta (flotar,
 * balancearse, latir) como si fuera un personaje.
 *
 * Regla de la casa: NUNCA se inventa producto. Si el fondo no es liso (una
 * persona en una oficina, un banner con texto) el recorte devuelve
 * confianza baja y no se usa; la foto sale entera, como siempre.
 *
 * Cómo funciona (rápido, <100 ms en fotos normales):
 *  1. Se trabaja a 320 px de lado mayor.
 *  2. Se mide el color del borde y qué tan uniforme es.
 *  3. Inundación (flood fill) desde el borde: todo lo parecido al color del
 *     borde y conectado con él es fondo. Lo demás es producto.
 *  4. Se quitan motas sueltas, se mide cuánto producto toca el borde y qué
 *     área ocupa, y de ahí sale la confianza.
 *  5. La máscara se escala a la foto original con borde suave y se recorta a
 *     la caja del producto con un pequeño margen.
 */
import sharp from "sharp";

export interface Recorte {
  /** PNG con transparencia, ya recortado a la caja del producto (+margen). */
  png: Buffer;
  ancho: number;
  alto: number;
  /** Caja del producto en píxeles de la foto original. */
  caja: { x: number; y: number; w: number; h: number };
  /** Tamaño de la foto normalizada (≤ 2500 px de lado) sobre la que se calculó todo. */
  original: { ancho: number; alto: number };
  /** La foto normalizada en JPEG (la que hay que mandar a una IA junto con la máscara). */
  foto?: Buffer;
  /** 0–1. Por debajo de UMBRAL_RECORTE no se usa automáticamente. */
  confianza: number;
  /** Color del fondo detectado (#rrggbb). */
  fondo: string;
  /** Por qué la confianza es baja (para el panel/Atlas). */
  motivo?: string;
  /** Piezas detectadas: componentes conservados y piezas sueltas lejos del producto (montajes). */
  piezas?: { componentes: number; sueltos: number; fuga: number };
}

export const UMBRAL_RECORTE = 0.72;
const LADO_TRABAJO = 320;
const LADO_MAXIMO = 2500;

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Máscara de fondo por inundación desde el borde. Devuelve 1 donde hay producto. */
export function mascaraPorInundacion(rgba: Uint8Array, w: number, h: number, tol: number): { producto: Uint8Array; fondo: [number, number, number]; uniformidad: number } {
  // Color del borde: media de un anillo de 2 px, robusta (se descartan los lejanos y se repite).
  const ring: number[] = [];
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) if (y >= 0 && y < h) ring.push((y * w + x) * 4);
  for (let y = 2; y < h - 2; y++) for (const x of [0, 1, w - 2, w - 1]) if (x >= 0 && x < w) ring.push((y * w + x) * 4);
  let r = 0, g = 0, b = 0;
  for (const i of ring) { r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!; }
  let n = ring.length || 1;
  r /= n; g /= n; b /= n;
  for (let paso = 0; paso < 2; paso++) {
    let sr = 0, sg = 0, sb = 0, c = 0;
    for (const i of ring) {
      const d = Math.hypot(rgba[i]! - r, rgba[i + 1]! - g, rgba[i + 2]! - b);
      if (d <= 48) { sr += rgba[i]!; sg += rgba[i + 1]!; sb += rgba[i + 2]!; c++; }
    }
    if (c) { r = sr / c; g = sg / c; b = sb / c; }
  }
  let dentro = 0;
  for (const i of ring) if (Math.hypot(rgba[i]! - r, rgba[i + 1]! - g, rgba[i + 2]! - b) <= tol) dentro++;
  const uniformidad = dentro / (ring.length || 1);

  const esFondo = new Uint8Array(w * h);
  const cola = new Int32Array(w * h);
  let qi = 0, qf = 0;
  const parecido = (p: number, t: number) => { const i = p * 4; return Math.hypot(rgba[i]! - r, rgba[i + 1]! - g, rgba[i + 2]! - b) <= t; };
  const sembrar = (p: number) => { if (!esFondo[p] && parecido(p, tol)) { esFondo[p] = 1; cola[qf++] = p; } };
  for (let x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }
  while (qi < qf) {
    const p = cola[qi++]!;
    const x = p % w, y = (p - x) / w;
    if (x > 0) sembrar(p - 1);
    if (x < w - 1) sembrar(p + 1);
    if (y > 0) sembrar(p - w);
    if (y < h - 1) sembrar(p + w);
  }
  // Un paso de dilatación hacia píxeles casi iguales (antialias del borde del producto).
  const extra: number[] = [];
  for (let p = 0; p < w * h; p++) {
    if (esFondo[p]) continue;
    const x = p % w, y = (p - x) / w;
    const vecinoFondo = (x > 0 && esFondo[p - 1]) || (x < w - 1 && esFondo[p + 1]) || (y > 0 && esFondo[p - w]) || (y < h - 1 && esFondo[p + w]);
    if (vecinoFondo && parecido(p, tol * 1.6)) extra.push(p);
  }
  for (const p of extra) esFondo[p] = 1;

  const producto = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) producto[p] = esFondo[p] ? 0 : 1;
  return { producto, fondo: [r, g, b], uniformidad };
}

/**
 * Quita la sombra proyectada que la inundación deja pegada al producto: píxeles
 * del mismo tono que el fondo pero más oscuros (hasta un 55 %), en la franja
 * inferior de la caja del producto. Si al hacerlo se perdería demasiado
 * (producto gris o blanco), se deshace: antes entero con sombra que roto.
 */
export function quitarSombra(rgba: Uint8Array, producto: Uint8Array, w: number, h: number, fondo: [number, number, number], tol: number): number {
  let y0 = h, y1 = -1, area = 0;
  for (let p = 0; p < w * h; p++) if (producto[p]) { const y = (p - (p % w)) / w; if (y < y0) y0 = y; if (y > y1) y1 = y; area++; }
  if (y1 < 0 || !area) return 0;
  const desde = y1 - Math.round((y1 - y0 + 1) * 0.22);
  const lumF = 0.299 * fondo[0] + 0.587 * fondo[1] + 0.114 * fondo[2];
  const candidatos: number[] = [];
  for (let y = Math.max(0, desde); y <= y1; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!producto[p]) continue;
      const i = p * 4;
      const r = rgba[i]!, g = rgba[i + 1]!, b = rgba[i + 2]!;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const caida = lumF - lum;
      if (caida < tol * 0.5 || caida > lumF * 0.55) continue;
      // Mismo tono que el fondo: la diferencia de color una vez compensada la luminosidad es pequeña.
      const k = lum > 0 ? lumF / lum : 1;
      const croma = Math.hypot(r * k - fondo[0], g * k - fondo[1], b * k - fondo[2]);
      if (croma <= Math.max(14, tol * 0.45)) candidatos.push(p);
    }
  }
  if (!candidatos.length || candidatos.length > area * 0.2) return 0;
  for (const p of candidatos) producto[p] = 0;
  return candidatos.length;
}

function dilatar(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } a[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && a[yy * w + x]) v = 1; } b[y * w + x] = v; }
  return b;
}
function erosionar(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) inv[p] = m[p] ? 0 : 1;
  const d = dilatar(inv, w, h, r);
  for (let p = 0; p < w * h; p++) d[p] = d[p] ? 0 : 1;
  return d;
}

/** Huecos (fondo no conectado con el borde) de una máscara: devuelve la máscara con TODOS los huecos rellenos y la lista de huecos. */
function huecosDe(m: Uint8Array, w: number, h: number): { rellena: Uint8Array; huecos: number[][] } {
  const visto = new Uint8Array(w * h);
  const cola = new Int32Array(w * h);
  let qi = 0, qf = 0;
  const sembrar = (p: number) => { if (!visto[p] && !m[p]) { visto[p] = 1; cola[qf++] = p; } };
  for (let x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }
  while (qi < qf) {
    const p = cola[qi++]!;
    const x = p % w, y = (p - x) / w;
    if (x > 0) sembrar(p - 1); if (x < w - 1) sembrar(p + 1); if (y > 0) sembrar(p - w); if (y < h - 1) sembrar(p + w);
  }
  const rellena = new Uint8Array(w * h);
  const huecos: number[][] = [];
  const etiqueta = new Int32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    rellena[p] = m[p] || !visto[p] ? 1 : 0;
    if (m[p] || visto[p] || etiqueta[p]) continue;
    const id = huecos.length + 1;
    const miembros: number[] = [];
    let top = 0; cola[top++] = p; etiqueta[p] = id;
    while (top) {
      const q = cola[--top]!;
      miembros.push(q);
      const x = q % w, y = (q - x) / w;
      for (const v of [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1]) if (v >= 0 && !m[v] && !visto[v] && !etiqueta[v]) { etiqueta[v] = id; cola[top++] = v; }
    }
    huecos.push(miembros);
  }
  return { rellena, huecos };
}

/**
 * Rellena los huecos pequeños (brillos y tramas del color del fondo dentro del
 * producto) y mide la "fuga": cuánto producto se perdió porque su color se
 * confunde con el fondo (zapatilla blanca sobre gris). Devuelve la fracción
 * de área recuperada al cerrar y rellenar; por encima de ~12 % el recorte no es fiable.
 */
export function rellenarHuecos(producto: Uint8Array, w: number, h: number): { fuga: number; rellenados: number } {
  let area = 0;
  for (let p = 0; p < w * h; p++) area += producto[p]!;
  if (!area) return { fuga: 0, rellenados: 0 };
  const { huecos } = huecosDe(producto, w, h);
  let rellenados = 0;
  for (const hu of huecos) if (hu.length <= area * 0.03) { for (const p of hu) producto[p] = 1; rellenados += hu.length; }
  // Fuga: cierre morfológico + relleno frente a la máscara real. Un único hueco
  // grande (el aro de una pulsera, el asa de una taza) es forma legítima y no cuenta.
  const r = Math.max(2, Math.round(Math.max(w, h) * 0.012));
  const cerrada = erosionar(dilatar(producto, w, h, r), w, h, r);
  const relleno = huecosDe(cerrada, w, h);
  let areaRellena = 0, areaActual = 0;
  for (let p = 0; p < w * h; p++) { areaRellena += relleno.rellena[p]!; areaActual += producto[p]!; }
  let grandes = 0;
  for (const hu of relleno.huecos) if (hu.length > areaRellena * 0.1) grandes += hu.length;
  const base = areaRellena - grandes;
  return { fuga: base > 0 ? Math.max(0, (base - areaActual) / base) : 0, rellenados };
}

/**
 * Quita motas (polvo, ruido de JPEG) y devuelve el área total y la caja del
 * producto. Solo se borra lo pequeño Y lejano al cuerpo principal: las letras
 * de una etiqueta, un asa fina o un logo pegado al producto son parte de él y
 * se conservan aunque queden sueltos en la máscara.
 */
export function limpiarMotas(producto: Uint8Array, w: number, h: number, minArea: number): { area: number; caja: { x: number; y: number; w: number; h: number } | null; componentes: number; sueltos: number } {
  const etiqueta = new Int32Array(w * h);
  const pila = new Int32Array(w * h);
  interface Comp { miembros: number[]; x0: number; y0: number; x1: number; y1: number }
  const comps: Comp[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!producto[s] || etiqueta[s]) continue;
    const id = comps.length + 1;
    let top = 0; pila[top++] = s; etiqueta[s] = id;
    const c: Comp = { miembros: [], x0: w, y0: h, x1: -1, y1: -1 };
    while (top) {
      const p = pila[--top]!;
      c.miembros.push(p);
      const x = p % w, y = (p - x) / w;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      const vecinos = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const v of vecinos) if (v >= 0 && producto[v] && !etiqueta[v]) { etiqueta[v] = id; pila[top++] = v; }
    }
    comps.push(c);
  }
  if (!comps.length) return { area: 0, caja: null, componentes: 0, sueltos: 0 };
  const mayor = comps.reduce((a, b) => (b.miembros.length > a.miembros.length ? b : a));
  const mx = Math.round(w * 0.08), my = Math.round(h * 0.08);
  const cerca = (c: Comp) => c.x1 >= mayor.x0 - mx && c.x0 <= mayor.x1 + mx && c.y1 >= mayor.y0 - my && c.y0 <= mayor.y1 + my;
  let areaTotal = 0, componentes = 0, sueltos = 0;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (const c of comps) {
    const n = c.miembros.length;
    // Piezas lejos del producto principal (letras, iconos, cajitas): un montaje tiene muchas.
    if (n >= 4 && !cerca(c)) sueltos++;
    const mota = n < 4 || (n < minArea && !cerca(c));
    if (mota) { for (const p of c.miembros) producto[p] = 0; continue; }
    areaTotal += n;
    componentes++;
    if (c.x0 < x0) x0 = c.x0; if (c.x1 > x1) x1 = c.x1; if (c.y0 < y0) y0 = c.y0; if (c.y1 > y1) y1 = c.y1;
  }
  return { area: areaTotal, caja: x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, componentes, sueltos };
}

/**
 * Recorta el producto de una foto. Devuelve null si la imagen no se puede
 * leer. Si la foto ya trae transparencia (PNG recortado) se respeta tal cual.
 */
export async function recortarProducto(buf: Buffer, opts: { margen?: number } = {}): Promise<Recorte | null> {
  let base: sharp.Sharp;
  let meta: sharp.Metadata;
  try {
    base = sharp(buf, { failOn: "none" }).rotate();
    meta = await base.metadata();
    const lado = Math.max(meta.width || 0, meta.height || 0);
    if (lado > LADO_MAXIMO) {
      // Se normaliza (y se fija la orientación) para que caja, máscara y foto hablen de los mismos píxeles.
      const norm = await base.resize(LADO_MAXIMO, LADO_MAXIMO, { fit: "inside" }).png().toBuffer();
      base = sharp(norm);
      meta = await base.metadata();
    }
  } catch { return null; }
  const W = meta.width || 0, H = meta.height || 0;
  if (W < 24 || H < 24) return null;

  // ¿Ya viene recortada? (PNG/WebP con alfa real en los bordes)
  if (meta.hasAlpha) {
    const { data, info } = await base.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparentes = 0, total = 0;
    for (let x = 0; x < info.width; x += 2) for (const y of [0, info.height - 1]) { total++; if (data[(y * info.width + x) * 4 + 3]! < 16) transparentes++; }
    for (let y = 0; y < info.height; y += 2) for (const x of [0, info.width - 1]) { total++; if (data[(y * info.width + x) * 4 + 3]! < 16) transparentes++; }
    if (total && transparentes / total > 0.8) {
      const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
      const rec = await sharp(png).trim({ threshold: 8 }).png().toBuffer({ resolveWithObject: true });
      const x = Math.max(0, -(rec.info.trimOffsetLeft ?? 0)), y = Math.max(0, -(rec.info.trimOffsetTop ?? 0));
      return { png: rec.data, ancho: rec.info.width, alto: rec.info.height, caja: { x, y, w: rec.info.width, h: rec.info.height }, original: { ancho: W, alto: H }, confianza: 1, fondo: "#00000000" };
    }
  }

  const escala = Math.min(1, LADO_TRABAJO / Math.max(W, H));
  const w = Math.max(8, Math.round(W * escala)), h = Math.max(8, Math.round(H * escala));
  const { data } = await base.clone().removeAlpha().resize(w, h, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8Array(w * h * 4);
  for (let p = 0; p < w * h; p++) { rgba[p * 4] = data[p * 3]!; rgba[p * 4 + 1] = data[p * 3 + 1]!; rgba[p * 4 + 2] = data[p * 3 + 2]!; rgba[p * 4 + 3] = 255; }

  // Desviación del borde para adaptar la tolerancia (fondos con leve degradado).
  const ring: number[] = [];
  for (let x = 0; x < w; x++) { ring.push(x * 4, ((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y++) { ring.push((y * w) * 4, (y * w + w - 1) * 4); }
  let mr = 0, mg = 0, mb = 0;
  for (const i of ring) { mr += rgba[i]!; mg += rgba[i + 1]!; mb += rgba[i + 2]!; }
  mr /= ring.length; mg /= ring.length; mb /= ring.length;
  let varianza = 0;
  for (const i of ring) varianza += (rgba[i]! - mr) ** 2 + (rgba[i + 1]! - mg) ** 2 + (rgba[i + 2]! - mb) ** 2;
  const desvio = Math.sqrt(varianza / ring.length);
  const tol = Math.max(26, Math.min(64, 22 + desvio * 0.9));

  const m = mascaraPorInundacion(rgba, w, h, tol);
  const fondoHex = hex(m.fondo[0], m.fondo[1], m.fondo[2]);
  if (m.uniformidad < 0.6) {
    return { png: Buffer.alloc(0), ancho: 0, alto: 0, caja: { x: 0, y: 0, w: W, h: H }, original: { ancho: W, alto: H }, confianza: Math.round(m.uniformidad * 40) / 100, fondo: fondoHex, motivo: "El fondo no es liso: la foto se usa entera." };
  }
  quitarSombra(rgba, m.producto, w, h, m.fondo, tol);
  const { area, caja, componentes, sueltos } = limpiarMotas(m.producto, w, h, Math.max(12, Math.round(w * h * 0.0012)));
  const { fuga } = caja ? rellenarHuecos(m.producto, w, h) : { fuga: 0 };
  const fraccion = area / (w * h);
  if (!caja || fraccion < 0.02) {
    return { png: Buffer.alloc(0), ancho: 0, alto: 0, caja: { x: 0, y: 0, w: W, h: H }, original: { ancho: W, alto: H }, confianza: 0.1, fondo: fondoHex, motivo: "No se distingue un producto sobre el fondo." };
  }
  // Cuánto del producto toca el borde (una foto cortada por el encuadre no se recorta bien).
  let contacto = 0;
  for (let x = 0; x < w; x++) contacto += m.producto[x]! + m.producto[(h - 1) * w + x]!;
  for (let y = 0; y < h; y++) contacto += m.producto[y * w]! + m.producto[y * w + w - 1]!;
  const fraccionContacto = contacto / (2 * (w + h));

  // Un banner/montaje (textos, iconos, varias cajas) no es "un producto sobre fondo liso":
  // recortarlo se comería letras y piezas pequeñas. Se detecta por la cantidad de elementos sueltos.
  // (Las letras de una etiqueta pegada al producto cuentan como piezas cercanas, no como sueltas.)
  const montaje = sueltos >= 6 || (sueltos >= 3 && componentes >= 6);
  let confianza = m.uniformidad;
  if (montaje) confianza *= 0.35;
  else if (sueltos >= 3 || componentes >= 10) confianza *= 0.75;
  if (fuga > 0.12) confianza *= 0.5;
  else if (fuga > 0.06) confianza *= 0.8;
  if (fraccion > 0.93) confianza *= 0.3;
  else if (fraccion > 0.85) confianza *= 0.7;
  if (fraccionContacto > 0.45) confianza *= 0.35;
  else if (fraccionContacto > 0.25) confianza *= 0.7;
  else if (fraccionContacto > 0.12) confianza *= 0.9;
  confianza = Math.round(confianza * 100) / 100;
  let motivo: string | undefined;
  if (montaje) motivo = "La imagen es un montaje (textos o varios elementos sueltos): se usa entera.";
  else if (fuga > 0.12) motivo = "El producto tiene zonas del color del fondo: el recorte no es fiable.";
  else if (fraccion > 0.85) motivo = "El producto ocupa casi toda la foto.";
  else if (fraccionContacto > 0.25) motivo = "El producto está cortado por el borde de la foto.";
  else if (sueltos >= 3 || componentes >= 10) motivo = "Hay elementos sueltos alrededor del producto.";

  // Máscara a resolución de la foto con borde suave; se arma el RGBA a mano
  // (joinChannel de sharp deja 3 canales con fotos JPEG según el espacio de color).
  const mascaraRaw = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) mascaraRaw[p] = m.producto[p] ? 255 : 0;
  // (sharp devuelve 3 canales para un raw de 1 canal salvo que se fuerce b-w; se indexa por `channels` por si acaso.)
  const mk = await sharp(mascaraRaw, { raw: { width: w, height: h, channels: 1 } }).toColourspace("b-w").resize(W, H, { fit: "fill", kernel: "lanczos3" }).blur(Math.max(0.5, 0.9 / escala * 0.5)).raw().toBuffer({ resolveWithObject: true });
  const rgbI = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const cm = mk.info.channels, cr = rgbI.info.channels;
  const rgbaFull = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) { rgbaFull[p * 4] = rgbI.data[p * cr]!; rgbaFull[p * 4 + 1] = rgbI.data[p * cr + 1]!; rgbaFull[p * 4 + 2] = rgbI.data[p * cr + 2]!; rgbaFull[p * 4 + 3] = mk.data[p * cm]!; }
  const conAlfa = await sharp(rgbaFull, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const foto = await base.clone().removeAlpha().jpeg({ quality: 92 }).toBuffer();
  const margen = Math.round((opts.margen ?? 0.03) * Math.max(W, H));
  const cx0 = Math.max(0, Math.round(caja.x / escala) - margen), cy0 = Math.max(0, Math.round(caja.y / escala) - margen);
  const cx1 = Math.min(W, Math.round((caja.x + caja.w) / escala) + margen), cy1 = Math.min(H, Math.round((caja.y + caja.h) / escala) + margen);
  const png = await sharp(conAlfa).extract({ left: cx0, top: cy0, width: Math.max(1, cx1 - cx0), height: Math.max(1, cy1 - cy0) }).png().toBuffer();
  return { png, ancho: cx1 - cx0, alto: cy1 - cy0, caja: { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 }, original: { ancho: W, alto: H }, confianza, fondo: fondoHex, motivo, foto, piezas: { componentes, sueltos, fuga: Math.round(fuga * 100) / 100 } };
}

/** Sombra suave que sigue la silueta (para pegar debajo de un recorte). Devuelve PNG del mismo tamaño + margen. */
export async function sombraDeSilueta(png: Buffer, opts: { desplazamiento?: number; desenfoque?: number; opacidad?: number } = {}): Promise<{ png: Buffer; margen: number }> {
  const margen = 60;
  const meta = await sharp(png).metadata();
  const w = meta.width || 1, h = meta.height || 1;
  const alfa = await sharp(png).ensureAlpha().extractChannel("alpha").toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const ca = alfa.info.channels;
  const op = Math.max(0, Math.min(1, opts.opacidad ?? 0.45));
  const rgba = Buffer.alloc(w * h * 4, 0);
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = Math.round(alfa.data[p * ca]! * op);
  const sombra = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const lienzo = await sharp({ create: { width: w + margen * 2, height: h + margen * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sombra, left: margen, top: margen + (opts.desplazamiento ?? 22) }]).png().toBuffer();
  return { png: await sharp(lienzo).blur(opts.desenfoque ?? 18).png().toBuffer(), margen };
}

/** Máscara para editores de IA (OpenAI): opaco = conservar, transparente = la IA puede pintar. Tamaño de la foto original. */
export async function mascaraDeConservacion(rec: Recorte): Promise<Buffer> {
  const { ancho, alto } = rec.original;
  const alfa = await sharp(rec.png).ensureAlpha().extractChannel("alpha").toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
  const ca = alfa.info.channels;
  // RGBA negro con alfa = silueta (lo opaco se conserva; lo transparente lo puede pintar la IA).
  const rgba = Buffer.alloc(ancho * alto * 4, 0);
  for (let y = 0; y < alfa.info.height; y++) {
    const Y = y + rec.caja.y;
    if (Y < 0 || Y >= alto) continue;
    for (let x = 0; x < alfa.info.width; x++) {
      const X = x + rec.caja.x;
      if (X < 0 || X >= ancho) continue;
      rgba[(Y * ancho + X) * 4 + 3] = alfa.data[(y * alfa.info.width + x) * ca]! > 128 ? 255 : 0;
    }
  }
  return sharp(rgba, { raw: { width: ancho, height: alto, channels: 4 } }).png().toBuffer();
}
