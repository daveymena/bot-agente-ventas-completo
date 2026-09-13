/**
 * Clonar el ESTILO de una landing real (una URL de internet).
 *
 * Pedido del dueño (13-09-2026): "¿pero sí clona landing pages reales?".
 *
 * Lo que se clona es el ESTILO y la ESTRUCTURA, nunca el contenido:
 *   - colores (fondo, acento), tipografías (las de Google Fonts que declare),
 *     esquinas, modo claro/oscuro;
 *   - el orden de bloques que se reconoce por sus encabezados (beneficios,
 *     cómo funciona, testimonios, FAQ, oferta, garantía, formulario…);
 *   - el tono de los llamados a la acción (largo, si usa urgencia).
 *
 * Lo que NO se toma, a propósito: textos, fotos ni marcas. Copiar eso de
 * otra web es plagio y las fotos ajenas no son publicables (regla del
 * proyecto). El contenido lo genera VentasPro para el producto del negocio.
 */
import { elegirFamilia, type FamiliaVisual, FAMILIAS } from "./design-system";

export interface EstiloDetectado {
  url: string;
  titulo: string;
  colores: { fondo: string | null; acento: string | null; texto: string | null; oscuro: boolean };
  fuentes: { display: string | null; texto: string | null };
  radio: string | null;
  encabezados: string[];
  bloques: string[];
  ctas: string[];
  familiaSugerida: FamiliaVisual;
  /** Lo que se aplica sobre los tokens de la familia. */
  ajustes: Record<string, string>;
  advertencias: string[];
}

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi;

function normalizarHex(h: string): string {
  const x = h.toLowerCase();
  if (x.length === 4) return `#${x[1]}${x[1]}${x[2]}${x[2]}${x[3]}${x[3]}`;
  return x;
}
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function saturacion(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
function contarColores(texto: string): Map<string, number> {
  const c = new Map<string, number>();
  for (const m of texto.match(HEX) || []) {
    const h = normalizarHex(m);
    c.set(h, (c.get(h) || 0) + 1);
  }
  return c;
}
function sinEtiquetas(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const BLOQUES: Array<{ tipo: string; re: RegExp }> = [
  { tipo: "hero", re: /^(?:hero)$/ },
  { tipo: "problem", re: /te pasa|te ha pasado|cansad|problema|dolor|frustra|dificil|difícil|sin resultados/i },
  { tipo: "benefits", re: /beneficio|ventaja|por qu[eé] (elegir|comprar)|lo que (obtienes|logras|consigues)|qu[eé] incluye|caracter[ií]stica/i },
  { tipo: "how_it_works", re: /c[oó]mo funciona|paso a paso|as[ií] de f[aá]cil|en \d+ pasos|c[oó]mo (se usa|lo uso)/i },
  { tipo: "testimonials", re: /testimoni|opinion|opini[oó]n|clientes? (felices|satisfech)|lo que dicen|rese[ñn]a/i },
  { tipo: "gallery", re: /galer[ií]a|fotos|im[aá]genes|mir[aá]lo/i },
  { tipo: "offer", re: /oferta|precio|promoci[oó]n|descuento|solo por hoy|cupos|plan(es)?$/i },
  { tipo: "guarantee", re: /garant[ií]a|devoluci[oó]n|sin riesgo|reembolso/i },
  { tipo: "faq", re: /preguntas frecuentes|faq|dudas/i },
  { tipo: "logistics", re: /env[ií]o|entrega|contraentrega|despacho|pago al recibir/i },
  { tipo: "cta", re: /pedir|comprar|quiero|empez|comienza|reserv|apartar|contact|ll[aá]manos|escr[ií]benos/i },
];

/** Analiza una página real. Sin navegador: HTML + CSS inline/embebido alcanzan para colores, fuentes y estructura. */
export async function analizarEstiloDeUrl(url: string): Promise<EstiloDetectado> {
  const advertencias: string[] = [];
  let u: URL;
  try { u = new URL(url); } catch { throw new Error("La URL no es válida."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Solo http(s).");
  // Nada de redes internas.
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(u.hostname)) throw new Error("URL no permitida.");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  let html = "";
  try {
    const r = await fetch(u.toString(), { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; VentasProBot/1.0)", Accept: "text/html" }, redirect: "follow" });
    if (!r.ok) throw new Error(`La página respondió ${r.status}.`);
    html = (await r.text()).slice(0, 1_500_000);
  } finally { clearTimeout(t); }

  // Hojas de estilo externas del mismo sitio (hasta 3, para los colores).
  const hojas = [...html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]).slice(0, 3);
  let cssExterno = "";
  for (const h of hojas) {
    try {
      const abs = new URL(h, u).toString();
      if (!/^https?:/.test(abs)) continue;
      const c2 = new AbortController(); const t2 = setTimeout(() => c2.abort(), 8_000);
      try {
        const r = await fetch(abs, { signal: c2.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; VentasProBot/1.0)" } });
        if (r.ok) cssExterno += "\n" + (await r.text()).slice(0, 400_000);
      } finally { clearTimeout(t2); }
    } catch { advertencias.push(`No pude leer la hoja de estilo ${h}.`); }
  }

  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 120);

  // ── Colores ──────────────────────────────────────────────────────────────
  const conteo = contarColores(html + cssExterno);
  const ordenados = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  const claros = ordenados.filter((h) => luminancia(h) > 0.9);
  const oscuros = ordenados.filter((h) => luminancia(h) < 0.15);
  const vivos = ordenados.filter((h) => saturacion(h) > 0.45 && luminancia(h) > 0.2 && luminancia(h) < 0.85);
  // ¿Modo oscuro? Si el body/html declara un fondo oscuro, o los oscuros dominan sin claros.
  const fondoDeclarado = (html + cssExterno).match(/(?:html|body)\s*\{[^}]*background(?:-color)?\s*:\s*(#[0-9a-f]{3,6})/i)?.[1];
  const oscuro = fondoDeclarado ? luminancia(normalizarHex(fondoDeclarado)) < 0.3 : (oscuros.length > 0 && claros.length === 0);
  const fondo = fondoDeclarado ? normalizarHex(fondoDeclarado) : (oscuro ? oscuros[0] || "#0b0b0f" : claros[0] || "#ffffff");
  const acento = vivos[0] || null;
  const texto = oscuro ? "#f5f5f7" : (oscuros[0] || "#111111");

  // ── Fuentes ──────────────────────────────────────────────────────────────
  const familiasGoogle = [...(html + cssExterno).matchAll(/fonts\.googleapis\.com\/css2?\?[^"'>)]*family=([^&"'>)]+)/gi)]
    .flatMap((m) => decodeURIComponent(m[1]).split("|").map((f) => f.split(":")[0].replace(/\+/g, " ").trim()))
    .filter(Boolean);
  const fontFamily = [...(html + cssExterno).matchAll(/font-family\s*:\s*([^;}]+)/gi)].map((m) => m[1].split(",")[0].replace(/["']/g, "").trim())
    .filter((f) => f && !/^(inherit|initial|sans-serif|serif|system-ui|-apple-system|monospace|var\()/i.test(f));
  const display = familiasGoogle[0] || fontFamily[0] || null;
  const fuenteTexto = familiasGoogle[1] || fontFamily.find((f) => f !== display) || display;

  // ── Esquinas ─────────────────────────────────────────────────────────────
  const radios = [...(html + cssExterno).matchAll(/border-radius\s*:\s*(\d+(?:\.\d+)?)(px|rem)/gi)].map((m) => (m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])));
  const radioPx = radios.length ? Math.round(radios.sort((a, b) => a - b)[Math.floor(radios.length / 2)]) : null;
  const radio = radioPx == null ? null : `${Math.min(radioPx, 32)}px`;

  // ── Estructura por encabezados y botones ─────────────────────────────────
  const encabezados = [...html.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((m) => sinEtiquetas(m[1]).trim()).filter((x) => x.length > 2 && x.length < 140).slice(0, 25);
  const ctas = [...html.matchAll(/<(?:button|a)[^>]*(?:class=["'][^"']*(?:btn|button|cta)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)]
    .map((m) => sinEtiquetas(m[1]).trim()).filter((x) => x.length > 1 && x.length < 60).slice(0, 8);
  const bloques: string[] = ["hero"];
  const textoPlano = sinEtiquetas(html);
  for (const enc of encabezados) for (const b of BLOQUES) if (b.tipo !== "hero" && b.re.test(enc) && !bloques.includes(b.tipo)) bloques.push(b.tipo);
  for (const b of BLOQUES) if (b.tipo !== "hero" && b.tipo !== "cta" && !bloques.includes(b.tipo) && b.re.test(textoPlano.slice(0, 20_000))) bloques.push(b.tipo);
  if (!bloques.includes("cta")) bloques.push("cta");

  // ── Familia más parecida ─────────────────────────────────────────────────
  let familiaSugerida: FamiliaVisual = oscuro ? "oscura" : "respuesta-directa";
  const pistas = `${titulo} ${encabezados.join(" ")}`.toLowerCase();
  if (!oscuro) {
    if (/gym|fitness|entren|abdom|cuerpo|rutina/.test(pistas)) familiaSugerida = "fitness";
    else if (/piel|cabello|belleza|skin|maquill|est[eé]tic/.test(pistas)) familiaSugerida = "belleza";
    else if (/curso|aprend|clase|academ|m[oó]dulo|certific/.test(pistas)) familiaSugerida = "educacion";
    else if (/app|software|tecnolog|ia\b|inteligencia|autom/.test(pistas)) familiaSugerida = "tecnologia";
    else if (/ni[ñn]o|beb[eé]|familia|mascota|hogar/.test(pistas)) familiaSugerida = "familiar";
    else if (/tienda|env[ií]o|contraentrega|producto/.test(pistas)) familiaSugerida = "ecommerce";
    else {
      try { familiaSugerida = elegirFamilia({ nombre: titulo, descripcion: encabezados.join(". "), tipo: "digital" } as any).familia; } catch { /* respaldo */ }
    }
  }
  if (!FAMILIAS.includes(familiaSugerida)) familiaSugerida = "respuesta-directa";

  const ajustes: Record<string, string> = {};
  if (acento) { ajustes.acento = acento; ajustes.sobreAcento = luminancia(acento) > 0.6 ? "#111111" : "#ffffff"; }
  if (fondo) ajustes.fondo = fondo;
  if (texto) ajustes.texto = texto;
  if (display) ajustes.fuenteDisplay = display;
  if (fuenteTexto) ajustes.fuenteTexto = fuenteTexto;
  if (radio) ajustes.radio = radio;
  if (!acento) advertencias.push("No encontré un color de acento claro: se usa el de la familia.");
  if (!display) advertencias.push("No encontré tipografías declaradas: se usan las de la familia.");

  return {
    url: u.toString(), titulo, colores: { fondo, acento, texto, oscuro }, fuentes: { display, texto: fuenteTexto },
    radio, encabezados, bloques, ctas, familiaSugerida, ajustes, advertencias,
  };
}
