/**
 * Genera las imágenes de marketing de la portada (/) A PARTIR de las capturas
 * reales del producto que hay en public/screens/ (las móviles, 780x1534, que
 * son las más legibles; el panel usa la de escritorio porque es la única que
 * existe).
 *
 * Cada imagen es una "escena": fondo degradado con trama + teléfono con marco
 * + la captura recortada (sin la franja blanca de arriba) + un chip con el dato
 * que la propia pantalla muestra. Nada inventado. Salen como WebP en
 * public/screens/gen/.
 *
 *   node artifacts/ventas-pro/scripts/generar-imagenes-portada.mjs
 *
 * Usa puppeteer del workspace raíz (ya trae Chrome). Solo local: el resultado
 * se commitea como cualquier otro asset.
 */
import puppeteer from "puppeteer";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(aqui, "../public");
const outDir = resolve(publicDir, "screens/gen");
mkdirSync(outDir, { recursive: true });

// Capturas móviles: `top` = px de la franja blanca que se corta arriba.
const PANTALLAS = {
  inbox: { src: "m-inbox.jpg", top: 96 },
  atlas: { src: "m-atlas.jpg", top: 96 },
  landing: { src: "m-landing.jpg", top: 0 },
  tienda: { src: "m-tienda.jpg", top: 0 },
};

const PALETAS = {
  indigo: { tinte: ["#eef2ff", "#e0e7ff", "#c7d2fe"], acento: "#4f46e5" },
  violeta: { tinte: ["#f5f3ff", "#ede9fe", "#ddd6fe"], acento: "#7c3aed" },
  ambar: { tinte: ["#fffbeb", "#fef3c7", "#fde68a"], acento: "#d97706" },
  cian: { tinte: ["#ecfeff", "#cffafe", "#a5f3fc"], acento: "#0891b2" },
  esmeralda: { tinte: ["#ecfdf5", "#d1fae5", "#a7f3d0"], acento: "#059669" },
  pizarra: { tinte: ["#f8fafc", "#f1f5f9", "#e2e8f0"], acento: "#334155" },
};

const ESCENAS = [
  // Portada: tres teléfonos contando la cadena Atlas → Sofía → página de venta.
  {
    id: "hero", ancho: 1600, alto: 1100, paleta: PALETAS.indigo,
    telefonos: [
      { pantalla: "atlas", x: 150, y: 230, escala: 0.62, rot: -6, z: 1 },
      { pantalla: "inbox", x: 530, y: 80, escala: 0.74, rot: 0, z: 3 },
      { pantalla: "landing", x: 1010, y: 230, escala: 0.62, rot: 6, z: 1 },
    ],
    chips: [
      { texto: "Atlas arma la campaña", icono: "◆", x: 90, y: 120 },
      { texto: "Sofía cierra la venta", icono: "✓", x: 1150, y: 120 },
      { texto: "Responde con la ficha real del producto", icono: "★", x: 520, y: 980, z: 4 },
    ],
  },
  // Portada en móvil: la misma historia en vertical, un solo teléfono grande.
  {
    id: "hero-m", ancho: 1000, alto: 1250, paleta: PALETAS.indigo,
    telefonos: [{ pantalla: "inbox", x: 150, y: 110, escala: 0.94, rot: 0 }],
    chips: [
      { texto: "Sofía cierra la venta", icono: "✓", x: 40, y: 40 },
      { texto: "Responde con la ficha real del producto", icono: "★", x: 300, y: 1130 },
    ],
  },
  // Pilares: un teléfono grande por escena.
  {
    id: "sofia", ancho: 1200, alto: 1400, paleta: PALETAS.esmeralda,
    telefonos: [{ pantalla: "inbox", x: 250, y: 70, escala: 0.94, rot: 0 }],
    chips: [
      { texto: "Presenta el curso con la ficha real", icono: "1", x: 40, y: 330 },
      { texto: "Tomás el control cuando querés", icono: "✓", x: 560, y: 1200 },
    ],
  },
  {
    id: "tienda", ancho: 1200, alto: 1400, paleta: PALETAS.cian,
    telefonos: [{ pantalla: "tienda", x: 250, y: 70, escala: 0.94, rot: 0 }],
    chips: [
      { texto: "84 productos · catálogo en vivo", icono: "▤", x: 40, y: 330 },
      { texto: "Te atendemos por WhatsApp", icono: "✓", x: 600, y: 1200 },
    ],
  },
  // Sección de Atlas: el chat y la página que salió de él, lado a lado.
  {
    id: "atlas-duo", ancho: 1600, alto: 1150, paleta: PALETAS.violeta,
    telefonos: [
      { pantalla: "atlas", x: 120, y: 90, escala: 0.78, rot: 0 },
      { pantalla: "landing", x: 880, y: 90, escala: 0.78, rot: 0 },
    ],
    chips: [
      { texto: "Paso 3 de 5 · la página de venta", icono: "3", x: 60, y: 30 },
      { texto: "La página que armó, publicada", icono: "★", x: 990, y: 30 },
      { texto: "¿La publico y seguimos con el anuncio?", icono: "?", x: 560, y: 1060 },
    ],
  },
  // Escritorio (marco de navegador): la bandeja para el pilar "Dirigir" y
  // Atlas para su propia sección, así ninguna imagen se repite en la página.
  // El panel real (panel.jpg) muestra $0 y una gráfica vacía: no se usa.
  {
    id: "inbox-web", ancho: 1600, alto: 1000, paleta: PALETAS.pizarra,
    ventana: { src: "inbox.jpg", cropX: 256, cropY: 0, titulo: "Bandeja de entrada" },
    chips: [{ texto: "Tomás el control del chat cuando querés", icono: "✓", x: 56, y: 880 }],
  },
  {
    id: "atlas-web", ancho: 1600, alto: 1000, paleta: PALETAS.violeta,
    ventana: { src: "atlas.jpg", cropX: 256, cropY: 0, titulo: "Atlas · ruta de marketing" },
    chips: [{ texto: "Paso 4 de 5 · el anuncio, con los datos reales del curso", icono: "4", x: 56, y: 880 }],
  },
];

// Teléfono: pantalla de 700x1400 (misma proporción que la captura 780x1534
// menos el corte), bisel de 16 y esquinas de 64. Se escala entero con `escala`.
const TEL_W = 700, TEL_H = 1290, BISEL = 16;

function dataUri(nombre) {
  return `data:image/jpeg;base64,${readFileSync(resolve(publicDir, "screens", nombre)).toString("base64")}`;
}

function telefono(t, acento) {
  const p = PANTALLAS[t.pantalla];
  const escalaImg = TEL_W / 780;
  return `
  <div class="tel" style="left:${t.x}px;top:${t.y}px;z-index:${t.z || 1};transform:scale(${t.escala}) rotate(${t.rot}deg)">
    <div class="isla"></div>
    <div class="pant">
      <div class="status"><b>10:24</b><span>●●● ⌔ ▮</span></div>
      <img src="${dataUri(p.src)}" style="left:0;top:${52 - p.top * escalaImg}px;width:${780 * escalaImg}px;height:${1534 * escalaImg}px">
    </div>
  </div>`;
}

function ventana(v, acento) {
  const anchoVisible = 1440 - v.cropX;
  const escala = 1400 / anchoVisible;
  return `
  <div class="ventana">
    <div class="barra">
      <i style="background:#fca5a5"></i><i style="background:#fcd34d"></i><i style="background:#86efac"></i>
      <div class="pill">🔒 <b>VentasPro</b> · ${v.titulo}</div>
    </div>
    <div class="pantalla-win">
      <img src="${dataUri(v.src)}" style="left:${-v.cropX * escala}px;top:${-v.cropY * escala}px;width:${1440 * escala}px;height:${900 * escala}px">
    </div>
  </div>`;
}

function html(e) {
  const { tinte, acento } = e.paleta;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${e.ancho}px; height: ${e.alto}px; overflow: hidden; }
  body {
    font-family: Inter, "Segoe UI", system-ui, sans-serif; position: relative;
    background:
      radial-gradient(70% 55% at 15% 0%, ${tinte[2]} 0%, transparent 60%),
      radial-gradient(60% 55% at 100% 100%, ${tinte[2]} 0%, transparent 55%),
      linear-gradient(160deg, ${tinte[0]} 0%, ${tinte[1]} 100%);
  }
  .grid { position: absolute; inset: 0;
    background-image: radial-gradient(${acento}26 1.2px, transparent 1.2px);
    background-size: 28px 28px;
    mask-image: linear-gradient(180deg, rgba(0,0,0,.9), rgba(0,0,0,.15)); }
  .halo { position: absolute; left: 50%; top: 55%; width: 70%; height: 60%;
    transform: translate(-50%,-50%); border-radius: 50%;
    background: radial-gradient(closest-side, ${acento}33, transparent); filter: blur(30px); }

  .tel { position: absolute; width: ${TEL_W + BISEL * 2}px; height: ${TEL_H + BISEL * 2}px;
    transform-origin: top left; border-radius: 76px; background: #0f172a; padding: ${BISEL}px;
    box-shadow: 0 0 0 2px #334155 inset, 0 0 0 1px rgba(255,255,255,.35),
      0 40px 90px -30px ${acento}66, 0 70px 140px -40px rgba(15,23,42,.45); }
  .pant { position: relative; width: ${TEL_W}px; height: ${TEL_H}px; border-radius: 60px;
    overflow: hidden; background: #fff; }
  .pant img { position: absolute; }
  .status { position: absolute; z-index: 2; left: 0; right: 0; top: 0; height: 52px;
    display: flex; align-items: center; justify-content: space-between; padding: 0 46px;
    font-size: 22px; color: #0f172a; background: #fff; }
  .status span { letter-spacing: 2px; font-size: 16px; }
  .isla { position: absolute; z-index: 3; left: 50%; top: ${BISEL + 14}px; transform: translateX(-50%);
    width: 150px; height: 34px; border-radius: 20px; background: #0f172a; }

  .ventana { position: absolute; left: 100px; top: 96px; width: 1400px; height: 940px;
    background: #fff; border-radius: 22px; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(15,23,42,.08), 0 30px 80px -20px ${acento}55, 0 60px 120px -40px rgba(15,23,42,.35); }
  .barra { height: 52px; display: flex; align-items: center; gap: 14px; padding: 0 22px;
    background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .barra i { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .pill { margin-left: 14px; flex: 1; max-width: 560px; height: 30px; border-radius: 10px;
    background: #fff; border: 1px solid #e2e8f0; color: #475569; font-size: 14px;
    display: flex; align-items: center; justify-content: center; gap: 8px; }
  .pill b { color: ${acento}; font-weight: 600; }
  .pantalla-win { position: relative; width: 1400px; height: 888px; overflow: hidden; }
  .pantalla-win img { position: absolute; }

  .chip { position: absolute; display: flex; align-items: center; gap: 14px; padding: 16px 24px 16px 16px;
    background: rgba(255,255,255,.94); backdrop-filter: blur(12px);
    border: 1px solid rgba(15,23,42,.08); border-radius: 20px; white-space: nowrap;
    color: #0f172a; font-size: 28px; font-weight: 600; letter-spacing: -.01em;
    box-shadow: 0 24px 60px -20px rgba(15,23,42,.45); }
  .chip span { width: 44px; height: 44px; border-radius: 14px; background: ${acento}; color: #fff;
    display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; }
</style></head>
<body>
  <div class="grid"></div><div class="halo"></div>
  ${(e.telefonos || []).map((t) => telefono(t, acento)).join("")}
  ${e.ventana ? ventana(e.ventana, acento) : ""}
  ${e.chips.map((c) => `<div class="chip" style="left:${c.x}px;top:${c.y}px;z-index:${c.z || 2}"><span>${c.icono}</span>${c.texto}</div>`).join("")}
</body></html>`;
}

// Si puppeteer no tiene su Chrome descargado, se usa el del sistema.
import { existsSync } from "node:fs";
const chromeSistema = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || chromeSistema });
try {
  const page = await browser.newPage();
  for (const e of ESCENAS) {
    await page.setViewport({ width: e.ancho, height: e.alto, deviceScaleFactor: 1 });
    await page.setContent(html(e), { waitUntil: "load" });
    const destino = resolve(outDir, `${e.id}.webp`);
    await page.screenshot({ path: destino, type: "webp", quality: 88 });
    console.log("✓", `screens/gen/${e.id}.webp`);
  }
} finally {
  await browser.close();
}
