/**
 * Escenas de la portada (/) con FOTOS REALES + CAPTURAS REALES del producto.
 *
 *   node scripts/portada-fotos.mjs            (todas)
 *   node scripts/portada-fotos.mjs hero sofia (solo esas)
 *
 * Técnica de mockup profesional: una foto de Pexels (uso comercial libre) con
 * la pantalla del celular o la laptop en verde o en blanco. Se detecta la
 * pantalla (relleno por color desde una semilla), se calculan sus 4 esquinas
 * y se pega encima la captura real con la perspectiva exacta (homografía en
 * CSS matrix3d con el Chrome instalado). Lo que no es pantalla (dedos, reflejos
 * del marco) queda de la foto. Arriba van los chips con el estilo de las
 * escenas del 19-09.
 *
 * Por qué (07-10-2026): el dueño pidió imágenes "que impacten y se vean
 * reales". Las de gpt-image-1 inventaban la interfaz (zapatilla a $49, texto
 * en inglés) y las composiciones planas se veían superficiales. Acá la foto es
 * real y lo que muestra la pantalla también: nada inventado.
 *
 * Las fotos se bajan una vez a .cache/portada-fotos/ (ignorado por git).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import sharp from "sharp";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, "..");
const screens = resolve(raiz, "artifacts/ventas-pro/public/screens");
const cache = resolve(raiz, ".cache/portada-fotos");
mkdirSync(cache, { recursive: true });

// ─── Escenas ───────────────────────────────────────────────────────────
// foto: id de Pexels. recorte: región de la foto (en px de la versión de
// 2400 de ancho) que se escala a w×h; sin recorte se centra en la pantalla.
// semilla: punto dentro de la pantalla (px de 2400); sin semilla se busca el
// verde. pantalla: "movil" (barra de estado + captura) o "web" (captura sola).
const ESCENAS = [
  {
    id: "hero", w: 1600, h: 1100, foto: 34691927,
    pantalla: { tipo: "movil", src: "m-inbox.jpg", recorteArriba: 96 },
    chips: [
      { texto: "Sofía cierra la venta por WhatsApp", x: 60, y: 70, simbolo: "✓" },
      { texto: "Responde con la ficha real del producto", x: 60, y: 960, simbolo: "★" },
    ],
  },
  {
    id: "hero-m", w: 1000, h: 1250, foto: 12039537,
    pantalla: { tipo: "movil", src: "m-inbox.jpg", recorteArriba: 96 },
    chips: [{ texto: "Sofía cierra la venta", x: 40, y: 60, simbolo: "✓" }],
  },
  {
    id: "sofia", w: 1200, h: 1400, foto: 36713009,
    pantalla: { tipo: "movil-html", html: "cobro" },
    chips: [
      { texto: "Pasa el precio y el Nequi", x: 40, y: 60, simbolo: "2", color: "#059669" },
      { texto: "Recibe el comprobante para que apruebes", x: 40, y: 1250, simbolo: "✓", color: "#059669" },
    ],
  },
  {
    id: "tienda", w: 1200, h: 1400, foto: 9558710,
    recorte: { left: 640, top: 340, width: 1080, height: 1260 },
    semilla: { x: 813, y: 804 },
    pantalla: { tipo: "movil", src: "m-landing.jpg", recorteArriba: 0 },
    chips: [
      { texto: "Tu página de venta, lista para el anuncio", x: 40, y: 60, simbolo: "★", color: "#d97706" },
      { texto: "Con las fotos reales de tu producto", x: 300, y: 1260, simbolo: "✓", color: "#d97706" },
    ],
  },
  {
    id: "inbox-web", w: 1600, h: 1000, foto: 4884107,
    recorte: { left: 120, top: 0, width: 2160, height: 1350 },
    semilla: { x: 1200, y: 630 },
    pantalla: { tipo: "web", src: "inbox.jpg" },
    chips: [
      { texto: "Todas las conversaciones en vivo", x: 40, y: 40, simbolo: "●", color: "#334155" },
      { texto: "Tomas el control cuando quieras", x: 900, y: 880, simbolo: "✓", color: "#334155" },
    ],
  },
  {
    id: "atlas-duo", w: 1600, h: 1150, foto: 6372917,
    recorte: { left: 700, top: 230, width: 1700, height: 1222 },
    semilla: { x: 1560, y: 720 },
    pantalla: { tipo: "web", src: "atlas.jpg" },
    chips: [
      { texto: "Paso 3 de 5 · la página de venta", x: 40, y: 50, simbolo: "3", color: "#7c3aed" },
      { texto: "Tú apruebas cada paso", x: 40, y: 1020, simbolo: "✓", color: "#7c3aed" },
    ],
  },
];

// ─── Foto ──────────────────────────────────────────────────────────────
async function foto(id) {
  const f = resolve(cache, `${id}.jpg`);
  if (!existsSync(f)) {
    const r = await fetch(`https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=2400`);
    if (!r.ok) throw new Error(`Pexels ${id}: ${r.status}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
  }
  return f;
}

// ─── Detección de la pantalla ─────────────────────────────────────────
const esVerde = (r, g, b) => g > 90 && g - Math.max(r, b) > 40;

/** Componente verde más grande: su centro sirve de semilla. */
function semillaVerde(px, w, h) {
  const visto = new Uint8Array(w * h);
  let mejor = null;
  for (let i = 0; i < w * h; i++) {
    if (visto[i] || !esVerde(px[i * 3], px[i * 3 + 1], px[i * 3 + 2])) continue;
    const cola = [i]; visto[i] = 1; let n = 0, sx = 0, sy = 0;
    while (cola.length) {
      const j = cola.pop(); n++; sx += j % w; sy += (j / w) | 0;
      for (const k of [j - 1, j + 1, j - w, j + w]) {
        if (k < 0 || k >= w * h || visto[k]) continue;
        if (Math.abs((k % w) - (j % w)) > 1) continue;
        if (!esVerde(px[k * 3], px[k * 3 + 1], px[k * 3 + 2])) continue;
        visto[k] = 1; cola.push(k);
      }
    }
    if (!mejor || n > mejor.n) mejor = { n, x: Math.round(sx / n), y: Math.round(sy / n) };
  }
  if (!mejor) throw new Error("No se encontró pantalla verde");
  return mejor;
}

/** Relleno desde la semilla por parecido de color con el color de la semilla. */
function rellenar(px, w, h, sx, sy, tolerancia) {
  // color de referencia: promedio de 9×9 alrededor de la semilla
  let cr = 0, cg = 0, cb = 0, c = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const i = (sy + dy) * w + (sx + dx); cr += px[i * 3]; cg += px[i * 3 + 1]; cb += px[i * 3 + 2]; c++;
  }
  cr /= c; cg /= c; cb /= c;
  const t2 = tolerancia * tolerancia;
  const mascara = new Uint8Array(w * h);
  const cola = [sy * w + sx]; mascara[cola[0]] = 1;
  while (cola.length) {
    const j = cola.pop();
    for (const k of [j - 1, j + 1, j - w, j + w]) {
      if (k < 0 || k >= w * h || mascara[k]) continue;
      if (Math.abs((k % w) - (j % w)) > 1) continue;
      const dr = px[k * 3] - cr, dg = px[k * 3 + 1] - cg, db = px[k * 3 + 2] - cb;
      if (dr * dr + dg * dg + db * db > t2) continue;
      mascara[k] = 1; cola.push(k);
    }
  }
  return mascara;
}

/**
 * Esquinas de la pantalla. Primero extremos de x+y y x−y (aproximadas: con
 * puntas redondeadas quedan hacia adentro); después se ajusta una recta a cada
 * lado con los puntos del borde lejos de las puntas y se cortan entre sí.
 */
function esquinas(mascara, w, h, abrir) {
  let tl, tr, br, bl, mtl = Infinity, mbr = -Infinity, mtr = -Infinity, mbl = Infinity, sx = 0, sy = 0, n = 0;
  const borde = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (!mascara[i]) continue;
    sx += x; sy += y; n++;
    const s = x + y, d = x - y;
    if (s < mtl) { mtl = s; tl = [x, y]; }
    if (s > mbr) { mbr = s; br = [x, y]; }
    if (d > mtr) { mtr = d; tr = [x, y]; }
    if (d < mbl) { mbl = d; bl = [x, y]; }
    if (!mascara[i - 1] || !mascara[i + 1] || !mascara[i - w] || !mascara[i + w]) borde.push([x, y]);
  }
  const aprox = [tl, tr, br, bl];
  const rectas = [];
  for (let k = 0; k < 4; k++) {
    const a = aprox[k], b = aprox[(k + 1) % 4];
    const L = dist(a, b), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    // Normal hacia afuera (lejos del centro). Un dedo encima de la pantalla
    // deja borde hacia ADENTRO; el lado real es el punto más externo de cada
    // tramo. Se ajusta con esos y se descartan los que quedan hundidos.
    let nx = uy, ny = -ux;
    const mxq = (a[0] + b[0]) / 2 - sx / n, myq = (a[1] + b[1]) / 2 - sy / n;
    if (nx * mxq + ny * myq < 0) { nx = -nx; ny = -ny; }
    const tramos = new Array(40).fill(null);
    for (const [x, y] of borde) {
      const t = ((x - a[0]) * ux + (y - a[1]) * uy) / L;
      const d = (x - a[0]) * nx + (y - a[1]) * ny;
      if (t <= 0.12 || t >= 0.88 || Math.abs(d) > L * 0.08) continue;
      const k2 = Math.min(39, Math.floor(t * 40));
      if (!tramos[k2] || d > tramos[k2].d) tramos[k2] = { x, y, d };
    }
    let pts = tramos.filter(Boolean);
    if (pts.length >= 6) {
      const dMax = Math.max(...pts.map((q) => q.d));
      pts = pts.filter((q) => q.d > dMax - 6);
    }
    pts = pts.map((q) => [q.x, q.y]);
    if (pts.length < 4) { rectas.push({ p: a, u: [ux, uy] }); continue; }
    // recta por PCA
    let mx = 0, my = 0;
    for (const [x, y] of pts) { mx += x; my += y; }
    mx /= pts.length; my /= pts.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); syy += (y - my) ** 2; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    rectas.push({ p: [mx, my], u: [Math.cos(ang), Math.sin(ang)] });
  }
  const cortar = (r1, r2) => {
    const det = r1.u[0] * r2.u[1] - r1.u[1] * r2.u[0];
    const t = ((r2.p[0] - r1.p[0]) * r2.u[1] - (r2.p[1] - r1.p[1]) * r2.u[0]) / det;
    return [r1.p[0] + t * r1.u[0], r1.p[1] + t * r1.u[1]];
  };
  // esquina k = corte del lado anterior con el lado k
  const quad0 = [0, 1, 2, 3].map((k) => cortar(rectas[(k + 3) % 4], rectas[k]));
  const cx = sx / n, cy = sy / n;
  const ab = (p) => [cx + (p[0] - cx) * abrir, cy + (p[1] - cy) * abrir];
  return { quad: quad0.map(ab), area: n };
}

// ─── Homografía → CSS matrix3d ────────────────────────────────────────
function resolver(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / A[i][i];
  }
  return x;
}
function matrix3d(w, h, quad) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = quad[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
  }
  const [a0, a1, a2, a3, a4, a5, a6, a7] = resolver(A, b);
  return `matrix3d(${[a0, a3, 0, a6, a1, a4, 0, a7, 0, 0, 1, 0, a2, a5, 0, 1].join(",")})`;
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

// ─── Contenido de la pantalla ─────────────────────────────────────────
const b64 = (buf, tipo = "png") => `data:image/${tipo};base64,${buf.toString("base64")}`;
const FUENTES = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=block" rel="stylesheet">`;

async function htmlPantalla(p, cw, ch) {
  const brillo = `<div style="position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,0.16) 0%,rgba(255,255,255,0) 38%);pointer-events:none"></div>`;
  if (p.tipo === "web") {
    const img = await sharp(resolve(screens, p.src)).toBuffer();
    return `<div style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden;background:#fff">
      <img src="${b64(img, "jpeg")}" style="width:100%;height:100%;object-fit:cover;object-position:top left;display:block">${brillo}</div>`;
  }
  const barra = `<div style="height:64px;display:flex;align-items:center;justify-content:space-between;padding:6px 48px 0;background:#fff;font:700 24px Inter,sans-serif;color:#0f172a">
      <span>10:24</span><span style="letter-spacing:2px">••• ▮</span></div>`;
  let cuerpo;
  if (p.tipo === "movil") {
    const meta = await sharp(resolve(screens, p.src)).metadata();
    const img = await sharp(resolve(screens, p.src))
      .extract({ left: 0, top: p.recorteArriba, width: meta.width, height: meta.height - p.recorteArriba })
      .toBuffer();
    cuerpo = `<img src="${b64(img, "jpeg")}" style="width:100%;height:${ch - 64}px;object-fit:cover;object-position:top center;display:block">`;
  } else {
    cuerpo = await chatCobro();
  }
  return `<div style="position:relative;width:${cw}px;height:${ch}px;overflow:hidden;background:#f8fafc">${barra}${cuerpo}${brillo}</div>`;
}

/** Cierre real de la conversación de Camila (textos de screens/inbox.jpg). */
async function chatCobro() {
  const cab = await sharp(resolve(screens, "m-inbox.jpg")).extract({ left: 0, top: 96, width: 780, height: 250 }).png().toBuffer();
  const bot = (txt, hora) => `<div style="align-self:flex-start;max-width:600px;background:#fff;border:2px solid #e0e7ff;border-radius:26px;padding:22px 26px 14px;box-shadow:0 4px 14px -6px rgba(79,70,229,.18)">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px"><b style="font-size:17px;letter-spacing:1.2px;color:#475569">BOT IA</b><span style="font-size:15px;color:#64748b;border:1.5px solid #e2e8f0;border-radius:999px;padding:2px 10px">payment</span></div>
      <div style="font-size:26px;line-height:1.5;color:#0f172a;white-space:pre-line">${txt}</div><div style="text-align:right;font-size:18px;color:#64748b;margin-top:6px">${hora}</div></div>`;
  return `<img src="${b64(cab)}" style="width:100%;display:block">
    <div style="padding:34px 30px;display:flex;flex-direction:column;gap:28px;font-family:Inter,sans-serif">
      ${bot("💰 *$60.000 COP*\n\n🔹 *Nequi:*\n📱 313 6174267\n👤 Tecnovariedades\n\nApenas transfieras, mándame el comprobante por aquí y te activo el acceso 🙌", "19:50")}
      <div style="align-self:flex-end;max-width:520px;background:#4f46e5;color:#fff;border-radius:26px;padding:20px 26px 12px;box-shadow:0 8px 20px -8px rgba(79,70,229,.55)">
        <div style="font-size:26px;line-height:1.5">Listo, ya transferí 📷</div><div style="text-align:right;font-size:18px;color:rgba(255,255,255,.75);margin-top:6px">19:51 ✓</div></div>
      ${bot("¡Recibido! 🙌 Ya lo mandé a validar.\n\nApenas confirmen que entró el pago te paso el acceso por acá.", "19:52")}
    </div>`;
}

function chipHtml({ texto, x, y, simbolo = "✓", color = "#4f46e5" }, escala) {
  const icono = simbolo === "✓"
    ? `<svg width="${26 * escala}" height="${26 * escala}" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : simbolo;
  return `<div style="position:absolute;left:${x}px;top:${y}px;display:flex;align-items:center;gap:${16 * escala}px;background:rgba(255,255,255,.96);
    border-radius:${22 * escala}px;padding:${15 * escala}px ${26 * escala}px ${15 * escala}px ${15 * escala}px;box-shadow:0 18px 44px -12px rgba(15,23,42,.38);
    font:600 ${30 * escala}px Inter,sans-serif;color:#0f172a;white-space:nowrap;backdrop-filter:blur(6px)">
    <span style="width:${48 * escala}px;height:${48 * escala}px;border-radius:${14 * escala}px;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${25 * escala}px">${icono}</span>${texto}</div>`;
}

// ─── Armado ───────────────────────────────────────────────────────────
async function escena(nav, e) {
  const original = await foto(e.foto);
  const meta = await sharp(original).metadata();
  const { w: W, h: H } = e;

  // 1. Región de la foto. Sin recorte: centrada en la pantalla verde.
  let rec = e.recorte;
  if (!rec) {
    const chico = await sharp(original).resize(600).raw().toBuffer({ resolveWithObject: true });
    const s = semillaVerde(chico.data, chico.info.width, chico.info.height);
    const f = meta.width / chico.info.width;
    const cx = s.x * f, cy = s.y * f;
    let rw = meta.width, rh = Math.round(rw * H / W);
    if (rh > meta.height) { rh = meta.height; rw = Math.round(rh * W / H); }
    rec = {
      left: Math.round(Math.min(Math.max(cx - rw / 2, 0), meta.width - rw)),
      top: Math.round(Math.min(Math.max(cy - rh / 2, 0), meta.height - rh)),
      width: rw, height: rh,
    };
  }
  const base = await sharp(original).extract(rec).resize(W, H).removeAlpha().raw().toBuffer();

  // 2. Pantalla: semilla, relleno, esquinas.
  const escala = W / rec.width;
  let sx, sy, tol;
  if (e.semilla) { sx = Math.round((e.semilla.x - rec.left) * escala); sy = Math.round((e.semilla.y - rec.top) * escala); }
  else ({ x: sx, y: sy } = semillaVerde(base, W, H));
  const r0 = base[(sy * W + sx) * 3], g0 = base[(sy * W + sx) * 3 + 1], b0 = base[(sy * W + sx) * 3 + 2];
  tol = esVerde(r0, g0, b0) ? 120 : 60;
  const mascara = rellenar(base, W, H, sx, sy, tol);
  const { quad, area } = esquinas(mascara, W, H, 1.012);
  // Reflejo verde en el marco y los dedos: cerca de la pantalla se baja el
  // verde al nivel del canal más alto de los otros dos.
  if (esVerde(r0, g0, b0)) {
    const cerca = await sharp(Buffer.from(mascara.map((v) => v * 255)), { raw: { width: W, height: H, channels: 1 } })
      .blur(10).raw().toBuffer();
    for (let i = 0; i < W * H; i++) {
      if (!cerca[i] || mascara[i]) continue;
      const m = Math.max(base[i * 3], base[i * 3 + 2]);
      if (base[i * 3 + 1] > m) base[i * 3 + 1] = m;
    }
  }

  // 3. Contenido con la proporción de la pantalla detectada.
  const anchoP = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2;
  const altoP = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
  const cw = e.pantalla.tipo === "web" ? 1440 : e.pantalla.tipo === "movil-html" ? 640 : 780;
  const ch = Math.round(cw * altoP / anchoP);
  const contenido = await htmlPantalla(e.pantalla, cw, ch);

  const pag = await nav.newPage();
  await pag.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">${FUENTES}
    <style>html,body{margin:0;background:transparent}</style></head><body>
    <div style="position:absolute;left:0;top:0;transform-origin:0 0;transform:${matrix3d(cw, ch, quad)}">${contenido}</div></body></html>`,
    { waitUntil: "load", timeout: 90000 });
  await pag.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const capa = await pag.screenshot({ type: "png", omitBackground: true });

  // 4. Máscara suave (un poco dilatada para tapar el borde verde) y mezcla.
  const alfa = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) alfa[i] = mascara[i] ? 255 : 0;
  const masc = await sharp(alfa, { raw: { width: W, height: H, channels: 1 } })
    .blur(2).threshold(50).blur(0.8).toColourspace("b-w").png().toBuffer();
  const pantallaRecortada = await sharp(capa).ensureAlpha()
    .composite([{ input: await sharp(masc).joinChannel(masc).joinChannel(masc).joinChannel(masc).png().toBuffer(), blend: "dest-in" }])
    .png().toBuffer();
  const compuesta = await sharp(base, { raw: { width: W, height: H, channels: 3 } })
    .composite([{ input: pantallaRecortada }]).png().toBuffer();

  // 5. Chips encima, con un leve viñeteado para que resalten.
  const k = W / 1600 < 0.7 ? 1.1 : 1;
  await pag.setContent(`<!doctype html><html><head><meta charset="utf-8">${FUENTES}
    <style>html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}</style></head><body>
    <img src="${b64(compuesta)}" style="position:absolute;inset:0;width:${W}px;height:${H}px">
    <div style="position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 45%,transparent 60%,rgba(15,23,42,.22))"></div>
    ${e.chips.map((c) => chipHtml(c, k)).join("")}</body></html>`, { waitUntil: "load", timeout: 90000 });
  await pag.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const final = await pag.screenshot({ type: "png" });
  await pag.close();
  const out = await sharp(final).webp({ quality: 88 }).toBuffer();
  writeFileSync(resolve(screens, `gen/${e.id}.webp`), out);
  console.log(`OK ${e.id} ${W}x${H} · pantalla ${area} px · ${(out.length / 1024).toFixed(0)} KB`);
}

const pedidas = process.argv.slice(2);
const nav = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  for (const e of ESCENAS) if (!pedidas.length || pedidas.includes(e.id)) await escena(nav, e);
} finally {
  await nav.close();
}
