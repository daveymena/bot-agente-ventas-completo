// Logo de VentasPro (30-09-2026) — fuente única para SVG y PNG.
// Símbolo: globo de chat (atiende por WhatsApp/Messenger) con una línea de
// crecimiento y flecha (vende más) y un destello (la IA). NO es una letra:
// antes era una "V" al lado de "VentasPro" → se leía "V VentasPro".
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const AQUI = path.dirname(fileURLToPath(import.meta.url));
// sharp viene instalado en el api-server.
const require = createRequire(path.join(AQUI, "../../api-server/package.json"));
const sharp = require("sharp");
const PUB = path.join(AQUI, "../public") + "/";

const DEFS = `<defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366F1"/>
      <stop offset="0.55" stop-color="#4F46E5"/>
      <stop offset="1" stop-color="#7C3AED"/>
    </linearGradient>
    <radialGradient id="brillo" cx="0.25" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.26"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

// Dibujo en 512×512. `inset` achica el símbolo (para la versión maskable).
function simbolo({ fondo = true, color = "#FFFFFF", trazo = "#4F46E5", inset = 0 } = {}) {
  const s = (512 - inset * 2) / 512;
  const fondoSvg = fondo
    ? `<rect width="512" height="512" rx="118" fill="url(#g)"/><rect width="512" height="512" rx="118" fill="url(#brillo)"/>`
    : "";
  return `${fondoSvg}
  <g transform="translate(${inset},${inset}) scale(${s})">
    <path d="M168 136 H344 A56 56 0 0 1 400 192 V288 A56 56 0 0 1 344 344 H236 L150 404 L166 344 A56 56 0 0 1 112 288 V192 A56 56 0 0 1 168 136 Z" fill="${color}"/>
    <path d="M168 294 L230 236 L274 270 L340 202" fill="none" stroke="${trazo}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M298 200 H344 V246" fill="none" stroke="${trazo}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M414 58 L427 99 L468 112 L427 125 L414 166 L401 125 L360 112 L401 99 Z" fill="#FDE68A" stroke="${fondo ? "#5547E6" : "none"}" stroke-width="12" paint-order="stroke" stroke-linejoin="round"/>
  </g>`;
}

const marca = (extra = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="VentasPro IA">
  <title>VentasPro IA</title>
  ${DEFS}
  ${simbolo(extra)}
</svg>
`;

// Logo horizontal: símbolo + "VentasPro" + pastilla "IA".
function horizontal({ texto = "#0F172A", pro = "#4F46E5", ia = { bg: "#4F46E5", fg: "#FFFFFF" } } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="214" height="48" viewBox="0 0 214 48" role="img" aria-label="VentasPro IA">
  <title>VentasPro IA</title>
  ${DEFS}
  <g transform="translate(0,4) scale(0.078125)">${simbolo()}</g>
  <text x="52" y="32" font-family="Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="23" font-weight="800" letter-spacing="-0.8" fill="${texto}">Ventas<tspan fill="${pro}">Pro</tspan><tspan dx="3" dy="-9" font-size="13" letter-spacing="0.3" fill="${ia.bg}">IA</tspan></text>
</svg>
`;
}

const archivos = {
  "favicon.svg": marca(),
  "logo-mark.svg": marca(),
  "logo-mark-plano.svg": marca({ fondo: false, color: "#4F46E5", trazo: "#FFFFFF" }),
  // Barra lateral oscura: texto claro.
  "logo-sidebar.svg": horizontal({ texto: "#FFFFFF", pro: "#C7D2FE", ia: { bg: "#FDE68A", fg: "#1E1B4B" } }),
  "logo-white.svg": horizontal({ texto: "#FFFFFF", pro: "#C7D2FE", ia: { bg: "#FDE68A", fg: "#1E1B4B" } }),
  // Fondo claro.
  "logo.svg": horizontal(),
  "logo-simple.svg": horizontal(),
  "logo-minimal.svg": marca(),
};
for (const [n, s] of Object.entries(archivos)) writeFileSync(PUB + n, s);

const png = async (svg, tam, nombre) => sharp(Buffer.from(svg), { density: 384 }).resize(tam, tam).png().toFile(PUB + nombre);
await png(marca(), 180, "icono-180.png");
await png(marca(), 192, "icono-192.png");
await png(marca(), 512, "icono-512.png");
// Maskable: el sistema recorta en círculo, el símbolo va más adentro y el fondo a sangre.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${DEFS}<rect width="512" height="512" fill="url(#g)"/>${simbolo({ fondo: false, inset: 72 })}</svg>`;
await png(maskable, 512, "icono-512-maskable.png");
// Vista previa para revisarlo de un vistazo.
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="300" viewBox="0 0 760 300">
<rect width="760" height="150" fill="#0F172A"/><rect y="150" width="760" height="150" fill="#FFFFFF"/>
<g transform="translate(24,51)">${archivos["logo-sidebar.svg"].replace(/<\?xml[^>]*>/, "")}</g>
<g transform="translate(24,201)">${archivos["logo.svg"]}</g>
<g transform="translate(330,22) scale(0.21)">${marca()}</g>
<g transform="translate(470,40) scale(0.14)">${marca()}</g>
<g transform="translate(570,60) scale(0.0625)">${marca()}</g>
<g transform="translate(330,172) scale(0.21)">${marca({ fondo: false, color: "#4F46E5", trazo: "#FFFFFF" })}</g>
<g transform="translate(470,190) scale(0.14)">${maskable}</g>
<g transform="translate(570,214) scale(0.03125)">${marca()}</g>
</svg>`;
await sharp(Buffer.from(preview), { density: 144 }).png().toFile(path.join(AQUI, "logo-preview.png"));
console.log("ok");
