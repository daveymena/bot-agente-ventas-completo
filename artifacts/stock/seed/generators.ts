/**
 * Generadores procedimentales para el catálogo de demostración:
 * vectores/ilustraciones/plantillas en SVG y pistas de audio sintetizadas (WAV).
 * Todo es determinista (PRNG con semilla) y se produce localmente, sin descargas.
 */

export interface SvgSeed {
  slug: string;
  type: "vector" | "illustration" | "template";
  title: string;
  description: string;
  keywords: string[];
  category: string;
  width: number;
  height: number;
  svg: string;
  free?: boolean;
  featured?: boolean;
  premium?: boolean;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const FONT = "font-family=\"Inter, 'Segoe UI', Helvetica, Arial, sans-serif\"";

function doc(w: number, h: number, body: string, defs = "") {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ""}${body}</svg>`;
}

function hsl(h: number, s: number, l: number) { return `hsl(${Math.round(((h % 360) + 360) % 360)},${Math.round(s)}%,${Math.round(l)}%)`; }

// ── Diseños ─────────────────────────────────────────────────────────────────

function meshGradient(): SvgSeed {
  const w = 1920, h = 1080, rnd = mulberry32(11);
  const blobs = [[300, 250, 520, 262], [1500, 300, 600, 292], [900, 900, 650, 20], [1700, 950, 480, 330], [250, 950, 420, 200]];
  const body = blobs.map(([cx, cy, r, hue], i) => `<circle cx="${cx + rnd() * 60}" cy="${cy}" r="${r}" fill="${hsl(hue, 85, 62)}" filter="url(#b${i % 2})" opacity="0.9"/>`).join("");
  const defs = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1140"/><stop offset="1" stop-color="#3b1a6b"/></linearGradient><filter id="b0" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="120"/></filter><filter id="b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="170"/></filter>`;
  return { slug: "fondo-degradado-malla-aurora", type: "vector", width: w, height: h, free: true, featured: true, category: "fondos", title: "Fondo abstracto de degradado malla estilo aurora en morado, rosa y azul", description: "Fondo vectorial editable con degradados difuminados tipo mesh gradient. Ideal para webs, presentaciones, portadas y redes sociales.", keywords: ["fondo", "degradado", "malla", "aurora", "abstracto", "morado", "rosa", "azul", "difuminado", "moderno", "web", "presentación", "vector", "editable", "background", "gradient", "mesh", "blur", "abstract", "purple", "modern", "wallpaper"], svg: doc(w, h, `<rect width="${w}" height="${h}" fill="url(#bg)"/>${body}`, defs) };
}

function trianglePattern(): SvgSeed {
  const w = 1600, h = 1600, cell = 100, rnd = mulberry32(7);
  const palette = ["#0f172a", "#1e3a8a", "#2563eb", "#38bdf8", "#f8fafc", "#f59e0b"];
  let body = `<rect width="${w}" height="${h}" fill="#0b1220"/>`;
  for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
    const a = palette[Math.floor(rnd() * palette.length)], b = palette[Math.floor(rnd() * palette.length)];
    const flip = rnd() > 0.5;
    body += flip
      ? `<polygon points="${x},${y} ${x + cell},${y} ${x},${y + cell}" fill="${a}"/><polygon points="${x + cell},${y} ${x + cell},${y + cell} ${x},${y + cell}" fill="${b}"/>`
      : `<polygon points="${x},${y} ${x + cell},${y} ${x + cell},${y + cell}" fill="${a}"/><polygon points="${x},${y} ${x + cell},${y + cell} ${x},${y + cell}" fill="${b}"/>`;
  }
  return { slug: "patron-geometrico-triangulos-azul", type: "vector", width: w, height: h, category: "fondos", title: "Patrón geométrico de triángulos en azul marino, celeste y ámbar", description: "Patrón vectorial repetible de triángulos. Perfecto para fondos de marca, empaques, textiles y papelería corporativa.", keywords: ["patrón", "geométrico", "triángulos", "azul", "ámbar", "mosaico", "repetible", "textura", "fondo", "empaque", "textil", "corporativo", "vector", "pattern", "geometric", "triangles", "seamless", "navy", "texture", "background", "abstract"], svg: doc(w, h, body) };
}

function waveLines(): SvgSeed {
  const w = 1920, h = 1080;
  let body = `<rect width="${w}" height="${h}" fill="#04111f"/>`;
  for (let i = 0; i < 48; i++) {
    const y = 180 + i * 16;
    const d = `M-50 ${y} C 400 ${y - 200 + i * 6}, 800 ${y + 260 - i * 4}, 1200 ${y - 80 + i * 2} S 1800 ${y + 150}, 2000 ${y - 40}`;
    body += `<path d="${d}" fill="none" stroke="url(#g)" stroke-width="2.2" opacity="${(0.25 + (i / 48) * 0.75).toFixed(2)}"/>`;
  }
  const defs = `<linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="0.5" stop-color="#a78bfa"/><stop offset="1" stop-color="#f472b6"/></linearGradient>`;
  return { slug: "fondo-ondas-lineas-neon", type: "vector", width: w, height: h, featured: true, category: "tecnologia", title: "Fondo tecnológico de líneas onduladas neón sobre azul oscuro", description: "Líneas fluidas con degradado cian, violeta y rosa. Fondo vectorial para tecnología, fintech, música electrónica y presentaciones.", keywords: ["fondo", "ondas", "líneas", "neón", "tecnología", "digital", "futurista", "flujo", "datos", "azul oscuro", "cian", "violeta", "música", "presentación", "vector", "background", "waves", "lines", "neon", "technology", "futuristic", "flow", "abstract"], svg: doc(w, h, body, defs) };
}

const ICONS: Record<string, string> = {
  inicio: `<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`,
  usuario: `<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>`,
  buscar: `<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/>`,
  favorito: `<path d="M12 21s-7-4.5-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.5-9 9-9 9z"/>`,
  estrella: `<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/>`,
  correo: `<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>`,
  telefono: `<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>`,
  ajustes: `<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>`,
  camara: `<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>`,
  musica: `<path d="M9 18V6l11-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  video: `<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3z"/>`,
  nube: `<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9H7z"/>`,
  candado: `<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  campana: `<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>`,
  chat: `<path d="M4 5h16v11H9l-5 4z"/>`,
  calendario: `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>`,
  ubicacion: `<path d="M12 22s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>`,
  etiqueta: `<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>`,
  regalo: `<rect x="3" y="9" width="18" height="12"/><path d="M3 13h18M12 9v12M12 9c-2 0-5-1-5-3.5S9 3 12 9zM12 9c2 0 5-1 5-3.5S15 3 12 9z"/>`,
  camion: `<path d="M1 6h13v10H1zM14 10h5l3 3v3h-8z"/><circle cx="5" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>`,
  billetera: `<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 14h3"/>`,
  grafica: `<path d="M3 21h18M6 17v-7M11 17V5M16 17v-7"/>`,
  verificado: `<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>`,
  carrito: `<path d="M3 4h2l2.5 11h11L21 7H7"/><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>`,
  descargar: `<path d="M12 3v12M6 10l6 6 6-6M4 21h16"/>`,
  mundo: `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>`,
  escudo: `<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>`,
  rayo: `<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>`,
  ojo: `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
  papelera: `<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>`,
  bolsa: `<path d="M6 8h12l1 13H5zM9 8a3 3 0 0 1 6 0"/>`,
  tarjeta: `<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20M6 15h4"/>`,
  caja: `<path d="M12 3l9 4.5v9L12 21l-9-4.5v-9zM3 7.5l9 4.5 9-4.5M12 12v9"/>`,
  porcentaje: `<path d="M5 19L19 5"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>`,
  tienda: `<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 20v-6h6v6"/>`,
  moneda: `<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9.5 9h3.5a1.5 1.5 0 0 1 0 3h-2a1.5 1.5 0 0 0 0 3H15"/>`,
  recibo: `<path d="M5 3h14v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L7 21l-2-1.5zM8 8h8M8 12h8M8 16h5"/>`,
  soporte: `<path d="M4 13a8 8 0 0 1 16 0M4 13v5a2 2 0 0 0 2 2h2v-7H4M20 13v5a2 2 0 0 1-2 2h-2v-7h4"/>`,
  devolucion: `<path d="M3 10h12a5 5 0 0 1 0 10H9M3 10l4-4M3 10l4 4"/>`,
  envio: `<path d="M3 7h11v10H3zM14 11h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/><path d="M3 10H1M3 13H0"/>`,
};

function iconSheet(slug: string, names: string[], opts: { title: string; description: string; keywords: string[]; stroke: string; bg: string; label: string; free?: boolean; featured?: boolean }): SvgSeed {
  const cols = 8, size = 160, pad = 90, w = cols * size + pad * 2, rows = Math.ceil(names.length / cols), h = rows * size + pad * 2 + 80;
  let body = `<rect width="${w}" height="${h}" fill="${opts.bg}"/>`;
  body += `<text x="${pad}" y="${pad - 24}" ${FONT} font-size="34" font-weight="700" fill="${opts.stroke}">${esc(opts.label)}</text>`;
  names.forEach((n, i) => {
    const x = pad + (i % cols) * size, y = pad + 20 + Math.floor(i / cols) * size;
    body += `<g transform="translate(${x + 32} ${y + 20}) scale(4)" fill="none" stroke="${opts.stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</g>`;
    body += `<text x="${x + 80}" y="${y + 140}" ${FONT} font-size="15" text-anchor="middle" fill="${opts.stroke}" opacity="0.7">${esc(n)}</text>`;
  });
  return { slug, type: "vector", width: w, height: h, category: "iconos", free: opts.free, featured: opts.featured, title: opts.title, description: opts.description, keywords: opts.keywords, svg: doc(w, h, body) };
}

function skyline(): SvgSeed {
  const w = 1920, h = 1080, rnd = mulberry32(21);
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1a5e"/><stop offset="0.55" stop-color="#d9486b"/><stop offset="1" stop-color="#ffb86b"/></linearGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="url(#sky)"/><circle cx="1320" cy="640" r="170" fill="#ffd36e"/>`;
  const layers = [["#6d2e6b", 0.6, 560], ["#4a1f55", 0.8, 640], ["#2a1238", 1, 740]] as const;
  layers.forEach(([color, scale, base], li) => {
    let x = -40;
    while (x < w + 40) {
      const bw = (60 + rnd() * 120) * scale, bh = (120 + rnd() * 320) * scale;
      body += `<rect x="${x}" y="${base - bh + 340}" width="${bw}" height="${bh + 200}" fill="${color}"/>`;
      if (li === 2) for (let wy = base - bh + 360; wy < base + 300; wy += 26) for (let wx = x + 10; wx < x + bw - 10; wx += 22) if (rnd() > 0.55) body += `<rect x="${wx}" y="${wy}" width="8" height="12" fill="#ffd36e" opacity="0.85"/>`;
      if (rnd() > 0.8) body += `<rect x="${x + bw / 2 - 3}" y="${base - bh + 280}" width="6" height="70" fill="${color}"/>`;
      x += bw + 10 + rnd() * 20;
    }
  });
  body += `<rect x="0" y="1000" width="${w}" height="80" fill="#180a22"/>`;
  return { slug: "ilustracion-skyline-ciudad-atardecer", type: "illustration", width: w, height: h, featured: true, category: "ciudades", title: "Ilustración plana de skyline urbano al atardecer con sol naranja", description: "Ilustración vectorial en estilo flat de una ciudad con rascacielos en capas y cielo degradado. Para banners, portadas y contenido inmobiliario o de viajes.", keywords: ["ilustración", "ciudad", "skyline", "atardecer", "rascacielos", "urbano", "plano", "flat", "edificios", "sol", "degradado", "banner", "viajes", "inmobiliaria", "silueta", "illustration", "city", "skyline", "sunset", "skyscrapers", "flat design", "urban", "buildings", "silhouette"], svg: doc(w, h, body, defs) };
}

function minimalMountains(): SvgSeed {
  const w = 1920, h = 1080;
  const defs = `<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#fef3c7"/></linearGradient>`;
  const ridge = (y: number, amp: number, color: string, seed: number) => { const r = mulberry32(seed); let d = `M0 ${h}`; for (let x = 0; x <= w; x += 80) d += ` L${x} ${y - amp * (0.3 + r())}`; return `<path d="${d} L${w} ${h}Z" fill="${color}"/>`; };
  let body = `<rect width="${w}" height="${h}" fill="url(#s)"/><circle cx="560" cy="380" r="120" fill="#fb923c" opacity="0.9"/>`;
  body += ridge(700, 260, "#94a3b8", 3) + ridge(780, 220, "#64748b", 5) + ridge(860, 180, "#334155", 9) + ridge(960, 120, "#0f172a", 13);
  body += `<g fill="none" stroke="#0f172a" stroke-width="4" stroke-linecap="round"><path d="M1200 300q20-20 40 0q20-20 40 0"/><path d="M1300 260q15-15 30 0q15-15 30 0"/><path d="M1130 350q12-12 24 0q12-12 24 0"/></g>`;
  return { slug: "ilustracion-montanas-minimalista-pastel", type: "illustration", width: w, height: h, free: true, category: "naturaleza", title: "Ilustración minimalista de montañas en capas con sol y aves", description: "Paisaje vectorial minimalista en tonos pastel, con capas de montañas y un sol naranja. Perfecta para fondos de app, afiches y papelería.", keywords: ["ilustración", "montañas", "minimalista", "pastel", "paisaje", "sol", "aves", "capas", "naturaleza", "aventura", "senderismo", "afiche", "fondo", "vector", "illustration", "mountains", "minimal", "landscape", "sun", "birds", "layers", "nature", "poster"], svg: doc(w, h, body, defs) };
}

function igPost(): SvgSeed {
  const w = 1080, h = 1080;
  const defs = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#ec4899"/></linearGradient>`;
  const body = `<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="930" cy="150" r="220" fill="#fff" opacity="0.12"/><circle cx="120" cy="960" r="260" fill="#fff" opacity="0.12"/>
  <rect x="90" y="90" width="900" height="900" rx="40" fill="#fff"/>
  <text x="140" y="250" ${FONT} font-size="40" font-weight="600" fill="#6366f1" letter-spacing="6">SOLO ESTA SEMANA</text>
  <text x="140" y="420" ${FONT} font-size="150" font-weight="800" fill="#0f172a">OFERTA</text>
  <text x="140" y="600" ${FONT} font-size="210" font-weight="900" fill="#ec4899">-50%</text>
  <text x="140" y="690" ${FONT} font-size="38" fill="#475569">en toda la colección de temporada</text>
  <rect x="140" y="770" width="420" height="110" rx="55" fill="#0f172a"/>
  <text x="350" y="840" ${FONT} font-size="38" font-weight="700" fill="#fff" text-anchor="middle">COMPRAR AHORA</text>
  <text x="140" y="950" ${FONT} font-size="26" fill="#94a3b8">www.tutienda.com · Código: VENTAS50</text>`;
  return { slug: "plantilla-post-instagram-oferta-50", type: "template", width: w, height: h, featured: true, category: "redes-sociales", title: "Plantilla de publicación para Instagram: oferta 50 % con degradado violeta y rosa", description: "Plantilla editable (SVG) de post cuadrado 1080×1080 para promociones. Cambiá textos, colores y logo en segundos.", keywords: ["plantilla", "instagram", "post", "oferta", "descuento", "promoción", "redes sociales", "degradado", "violeta", "rosa", "venta", "ecommerce", "marketing", "cuadrado", "editable", "template", "social media", "sale", "discount", "promo", "gradient", "square"], svg: doc(w, h, body, defs) };
}

function storyTemplate(): SvgSeed {
  const w = 1080, h = 1920;
  const defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#1e3a8a"/></linearGradient><radialGradient id="p" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#0ea5e9" stop-opacity="0"/></radialGradient>`;
  const body = `<rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="540" cy="820" r="420" fill="url(#p)"/>
  <circle cx="540" cy="820" r="300" fill="#f8fafc"/><text x="540" y="845" ${FONT} font-size="40" fill="#94a3b8" text-anchor="middle">tu producto aquí</text>
  <text x="540" y="300" ${FONT} font-size="44" font-weight="600" fill="#38bdf8" text-anchor="middle" letter-spacing="10">LANZAMIENTO</text>
  <text x="540" y="430" ${FONT} font-size="120" font-weight="800" fill="#fff" text-anchor="middle">NUEVO</text>
  <text x="540" y="1330" ${FONT} font-size="52" font-weight="700" fill="#fff" text-anchor="middle">Disponible desde hoy</text>
  <text x="540" y="1400" ${FONT} font-size="34" fill="#cbd5e1" text-anchor="middle">Envío gratis en tu primer pedido</text>
  <rect x="290" y="1560" width="500" height="120" rx="60" fill="#38bdf8"/><text x="540" y="1636" ${FONT} font-size="40" font-weight="700" fill="#0f172a" text-anchor="middle">Desliza hacia arriba</text>`;
  return { slug: "plantilla-historia-lanzamiento-producto", type: "template", width: w, height: h, category: "redes-sociales", title: "Plantilla de historia vertical para lanzamiento de producto, azul oscuro y celeste", description: "Historia 1080×1920 editable con espacio circular para foto de producto, titular y botón. Lista para Instagram, TikTok y WhatsApp.", keywords: ["plantilla", "historia", "story", "vertical", "lanzamiento", "producto", "instagram", "tiktok", "whatsapp", "azul", "celeste", "nuevo", "ecommerce", "marketing", "editable", "template", "launch", "product", "social media", "mobile"], svg: doc(w, h, body, defs) };
}

function flyerA4(): SvgSeed {
  const w = 1240, h = 1754;
  const defs = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#db2777"/></linearGradient>`;
  let body = `<rect width="${w}" height="${h}" fill="#0b0b12"/>`;
  const r = mulberry32(33);
  for (let i = 0; i < 90; i++) body += `<circle cx="${r() * w}" cy="${r() * h * 0.6}" r="${1 + r() * 3}" fill="#fff" opacity="${0.3 + r() * 0.6}"/>`;
  body += `<path d="M0 900 Q620 700 1240 900 L1240 1754 L0 1754Z" fill="url(#g)"/>
  <text x="620" y="260" ${FONT} font-size="40" fill="#fb923c" text-anchor="middle" letter-spacing="14">FESTIVAL DE MÚSICA</text>
  <text x="620" y="470" ${FONT} font-size="190" font-weight="900" fill="#fff" text-anchor="middle">NOCHE</text>
  <text x="620" y="650" ${FONT} font-size="190" font-weight="900" fill="#fff" text-anchor="middle" opacity="0.35">URBANA</text>
  <text x="620" y="780" ${FONT} font-size="48" fill="#e2e8f0" text-anchor="middle">DJ Set · Bandas en vivo · Food trucks</text>
  <text x="620" y="1180" ${FONT} font-size="120" font-weight="800" fill="#fff" text-anchor="middle">24 OCT</text>
  <text x="620" y="1260" ${FONT} font-size="44" fill="#fff" text-anchor="middle">Parque Central · 7:00 PM</text>
  <rect x="420" y="1380" width="400" height="100" rx="50" fill="#fff"/><text x="620" y="1445" ${FONT} font-size="36" font-weight="700" fill="#db2777" text-anchor="middle">ENTRADAS AQUÍ</text>
  <text x="620" y="1640" ${FONT} font-size="28" fill="#fff" text-anchor="middle" opacity="0.8">Patrocinan: tu marca · tu marca · tu marca</text>`;
  return { slug: "plantilla-flyer-evento-festival-a4", type: "template", width: w, height: h, category: "negocios", title: "Plantilla de flyer A4 para festival de música con degradado naranja y rosa", description: "Afiche vertical editable para conciertos, fiestas y eventos. Tipografía bold, degradado vibrante y espacio para patrocinadores.", keywords: ["plantilla", "flyer", "afiche", "cartel", "evento", "festival", "música", "concierto", "fiesta", "a4", "imprimir", "naranja", "rosa", "degradado", "noche", "editable", "template", "poster", "event", "music", "party", "print"], svg: doc(w, h, body, defs) };
}

function organicBlobs(): SvgSeed {
  const w = 1920, h = 1080, rnd = mulberry32(44);
  const colors = ["#fecdd3", "#fde68a", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8"];
  let body = `<rect width="${w}" height="${h}" fill="#fff7ed"/>`;
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * w, cy = rnd() * h, R = 160 + rnd() * 260, pts: string[] = [];
    const n = 8;
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, rr = R * (0.75 + rnd() * 0.5); pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`); }
    let d = ""; for (let k = 0; k < n; k++) { const [x0, y0] = pts[k].split(",").map(Number), [x1, y1] = pts[(k + 1) % n].split(",").map(Number); const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; d += k === 0 ? `M${mx} ${my}` : ""; const [x2, y2] = pts[(k + 2) % n].split(",").map(Number); d += ` Q${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`; }
    body += `<path d="${d}Z" fill="${colors[i % colors.length]}" opacity="0.9"/>`;
  }
  return { slug: "formas-organicas-pastel-fondo", type: "vector", width: w, height: h, free: true, category: "fondos", title: "Fondo de formas orgánicas pastel estilo memphis suave", description: "Manchas orgánicas en colores pastel sobre crema. Vector editable para webs de bienestar, cosmética, infantil y papelería.", keywords: ["formas", "orgánicas", "pastel", "manchas", "blobs", "fondo", "suave", "bienestar", "cosmética", "infantil", "papelería", "crema", "rosa", "amarillo", "verde", "vector", "shapes", "organic", "pastel", "blobs", "background", "soft", "abstract"], svg: doc(w, h, body) };
}

function halftone(): SvgSeed {
  const w = 1920, h = 1080;
  let body = `<rect width="${w}" height="${h}" fill="#111827"/>`;
  for (let y = 20; y < h; y += 34) for (let x = 20; x < w; x += 34) { const t = Math.min(1, Math.max(0, (x / w) * 0.8 + (y / h) * 0.4 - 0.1)); const r = 1 + t * 14; body += `<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="hsl(${Math.round(190 + t * 120)},90%,${Math.round(55 + t * 10)}%)"/>`; }
  return { slug: "fondo-semitono-puntos-degradado", type: "vector", width: w, height: h, category: "fondos", title: "Fondo de semitono con puntos en degradado cian a violeta sobre gris oscuro", description: "Textura de puntos tipo halftone con transición de tamaño y color. Vector para fondos de diseño gráfico, pop art y retro moderno.", keywords: ["semitono", "halftone", "puntos", "degradado", "textura", "fondo", "pop art", "retro", "cian", "violeta", "oscuro", "gráfico", "vector", "dots", "gradient", "texture", "background", "pop", "abstract", "pattern"], svg: doc(w, h, body) };
}

function infographic(): SvgSeed {
  const w = 1600, h = 1200;
  const cols = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4"];
  let body = `<rect width="${w}" height="${h}" fill="#f8fafc"/><text x="80" y="110" ${FONT} font-size="44" font-weight="800" fill="#0f172a">Elementos de infografía</text><text x="80" y="155" ${FONT} font-size="24" fill="#64748b">Gráficos editables para informes y presentaciones</text>`;
  // pie
  const slices = [0.35, 0.25, 0.2, 0.12, 0.08]; let a0 = -Math.PI / 2; const cx = 330, cy = 460, R = 190;
  slices.forEach((s, i) => { const a1 = a0 + s * Math.PI * 2; const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1); body += `<path d="M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 ${s > 0.5 ? 1 : 0} 1 ${x1} ${y1}Z" fill="${cols[i]}" stroke="#f8fafc" stroke-width="6"/>`; a0 = a1; });
  body += `<circle cx="${cx}" cy="${cy}" r="90" fill="#f8fafc"/><text x="${cx}" y="${cy + 14}" ${FONT} font-size="40" font-weight="800" fill="#0f172a" text-anchor="middle">72%</text>`;
  // bars
  const bars = [60, 90, 75, 120, 150, 110, 170];
  bars.forEach((v, i) => body += `<rect x="${640 + i * 70}" y="${640 - v * 2}" width="44" height="${v * 2}" rx="8" fill="${cols[i % 2 === 0 ? 0 : 4]}"/>`);
  body += `<path d="M640 650h500" stroke="#cbd5e1" stroke-width="2"/>`;
  // line
  const pts = [[1200, 600], [1260, 520], [1320, 560], [1380, 430], [1440, 470], [1500, 350]];
  body += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#22c55e" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` + pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="10" fill="#fff" stroke="#22c55e" stroke-width="5"/>`).join("");
  // rings
  [0.82, 0.64, 0.45, 0.3].forEach((p, i) => { const x = 250 + i * 330, y = 940, r = 90, c = 2 * Math.PI * r; body += `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="22"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${cols[i]}" stroke-width="22" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${x} ${y})"/><text x="${x}" y="${y + 14}" ${FONT} font-size="38" font-weight="800" fill="#0f172a" text-anchor="middle">${Math.round(p * 100)}%</text>`; });
  return { slug: "elementos-infografia-graficos-negocios", type: "vector", width: w, height: h, featured: true, category: "negocios", title: "Set de elementos de infografía: gráfico circular, barras, líneas y anillos de porcentaje", description: "Colección vectorial de gráficos limpios y modernos para informes anuales, dashboards y presentaciones corporativas.", keywords: ["infografía", "gráfico", "gráfico circular", "barras", "líneas", "porcentaje", "anillo", "estadísticas", "datos", "informe", "presentación", "negocios", "dashboard", "corporativo", "vector", "infographic", "chart", "pie chart", "bar chart", "statistics", "data", "report", "business"], svg: doc(w, h, body) };
}

function badges(): SvgSeed {
  const w = 1600, h = 1200;
  let body = `<rect width="${w}" height="${h}" fill="#fff"/>`;
  const star = (cx: number, cy: number, R: number, r: number, n: number) => { let d = ""; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R; d += `${i ? "L" : "M"}${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`; } return d + "Z"; };
  const items: [string, string, string][] = [["#ef4444", "OFERTA", "-30%"], ["#f59e0b", "NUEVO", "2026"], ["#22c55e", "ENVÍO", "GRATIS"], ["#6366f1", "TOP", "VENTAS"], ["#ec4899", "HOT", "SALE"], ["#0ea5e9", "ÚLTIMAS", "UNIDADES"]];
  items.forEach(([c, t1, t2], i) => { const cx = 260 + (i % 3) * 540, cy = 260 + Math.floor(i / 3) * 520; body += `<path d="${star(cx, cy, 190, 150, 16)}" fill="${c}"/><text x="${cx}" y="${cy - 10}" ${FONT} font-size="54" font-weight="900" fill="#fff" text-anchor="middle">${t1}</text><text x="${cx}" y="${cy + 60}" ${FONT} font-size="54" font-weight="900" fill="#fff" text-anchor="middle">${t2}</text>`; });
  for (let i = 0; i < 3; i++) { const x = 100 + i * 540, y = 1040, c = ["#0f172a", "#7c3aed", "#dc2626"][i]; body += `<path d="M${x} ${y}h420l-40 50 40 50H${x}z" fill="${c}"/><text x="${x + 200}" y="${y + 62}" ${FONT} font-size="34" font-weight="800" fill="#fff" text-anchor="middle">${["PROMOCIÓN", "EDICIÓN LIMITADA", "2x1 HOY"][i]}</text>`; }
  return { slug: "insignias-etiquetas-oferta-starburst", type: "vector", width: w, height: h, free: true, category: "negocios", title: "Set de insignias starburst y cintas de oferta: descuento, nuevo, envío gratis", description: "Etiquetas vectoriales editables para promociones de ecommerce, catálogos y redes sociales.", keywords: ["insignia", "etiqueta", "oferta", "descuento", "starburst", "cinta", "promoción", "nuevo", "envío gratis", "venta", "ecommerce", "catálogo", "sticker", "sello", "vector", "badge", "label", "sale", "discount", "ribbon", "promo", "sticker"], svg: doc(w, h, body) };
}

function isoCubes(): SvgSeed {
  const w = 1600, h = 1600, s = 70, hh = s * Math.sqrt(3) / 2;
  let body = `<rect width="${w}" height="${h}" fill="#0f172a"/>`;
  const rnd = mulberry32(99);
  for (let row = -2; row < h / (s * 1.5) + 2; row++) for (let col = -2; col < w / (hh * 2) + 2; col++) {
    const cx = col * hh * 2 + (row % 2 ? hh : 0), cy = row * s * 1.5, hue = 200 + rnd() * 80, l = 40 + rnd() * 20;
    body += `<path d="M${cx} ${cy - s}L${cx + hh} ${cy - s / 2}L${cx} ${cy}L${cx - hh} ${cy - s / 2}Z" fill="${hsl(hue, 70, l + 18)}"/><path d="M${cx - hh} ${cy - s / 2}L${cx} ${cy}L${cx} ${cy + s}L${cx - hh} ${cy + s / 2}Z" fill="${hsl(hue, 70, l)}"/><path d="M${cx} ${cy}L${cx + hh} ${cy - s / 2}L${cx + hh} ${cy + s / 2}L${cx} ${cy + s}Z" fill="${hsl(hue, 70, l - 15)}"/>`;
  }
  return { slug: "patron-isometrico-cubos-azul", type: "vector", width: w, height: h, category: "fondos", title: "Patrón isométrico de cubos 3D en tonos azul y violeta", description: "Teselado isométrico vectorial. Útil para fondos tecnológicos, blockchain, logística y empaques.", keywords: ["isométrico", "cubos", "patrón", "3d", "azul", "violeta", "teselado", "geométrico", "tecnología", "blockchain", "logística", "fondo", "vector", "isometric", "cubes", "pattern", "geometric", "technology", "background", "abstract"], svg: doc(w, h, body) };
}

function ecoLogo(): SvgSeed {
  const w = 1200, h = 1200;
  const body = `<rect width="${w}" height="${h}" fill="#fff"/><circle cx="600" cy="500" r="260" fill="#dcfce7"/><path d="M600 300c-170 40-230 200-150 330 150-30 220-170 150-330z" fill="#16a34a"/><path d="M600 300c170 40 230 200 150 330-150-30-220-170-150-330z" fill="#22c55e"/><path d="M600 330v300" stroke="#fff" stroke-width="14" stroke-linecap="round"/><path d="M600 640v120" stroke="#15803d" stroke-width="18" stroke-linecap="round"/><text x="600" y="900" ${FONT} font-size="110" font-weight="800" fill="#14532d" text-anchor="middle" letter-spacing="8">ECOVERDE</text><text x="600" y="970" ${FONT} font-size="34" fill="#4d7c0f" text-anchor="middle" letter-spacing="12">PRODUCTOS NATURALES</text>`;
  return { slug: "logotipo-hoja-eco-verde", type: "vector", width: w, height: h, category: "logos", title: "Logotipo de hoja ecológica con emblema circular verde y tipografía", description: "Plantilla de logotipo vectorial para marcas de productos naturales, orgánicos, jardinería y sostenibilidad.", keywords: ["logotipo", "logo", "hoja", "eco", "ecológico", "verde", "natural", "orgánico", "sostenible", "emblema", "marca", "identidad", "jardinería", "plantilla", "vector", "logo", "leaf", "eco", "green", "organic", "sustainable", "brand", "identity"], svg: doc(w, h, body) };
}

function lowPoly(): SvgSeed {
  const w = 1920, h = 1080, cell = 120, rnd = mulberry32(2024);
  const cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / cell) + 1;
  const pts: number[][][] = [];
  for (let r = 0; r < rows; r++) { pts.push([]); for (let c = 0; c < cols; c++) pts[r].push([c * cell + (c && c < cols - 1 ? (rnd() - 0.5) * cell * 0.9 : 0), r * cell + (r && r < rows - 1 ? (rnd() - 0.5) * cell * 0.9 : 0)]); }
  let body = "";
  const colorAt = (x: number, y: number) => hsl(330 + (x / w) * 60 - (y / h) * 30, 80, 42 + (y / h) * 25 + rnd() * 6);
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = pts[r][c], b = pts[r][c + 1], d = pts[r + 1][c], e = pts[r + 1][c + 1];
    const t1 = [a, b, e], t2 = [a, e, d];
    for (const t of rnd() > 0.5 ? [t1, t2] : [[a, b, d], [b, e, d]]) { const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3; body += `<polygon points="${t.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${colorAt(cx, cy)}" stroke="${colorAt(cx, cy)}" stroke-width="0.6"/>`; }
  }
  return { slug: "fondo-low-poly-rosa-naranja", type: "vector", width: w, height: h, featured: true, category: "fondos", title: "Fondo low poly de triángulos en degradado rosa, magenta y naranja", description: "Fondo poligonal vectorial con facetas. Para portadas, banners web y fondos de presentación con energía.", keywords: ["low poly", "polígonos", "triángulos", "fondo", "degradado", "rosa", "magenta", "naranja", "facetado", "geométrico", "banner", "portada", "moderno", "vector", "polygon", "triangles", "background", "gradient", "pink", "orange", "geometric", "abstract"], svg: doc(w, h, body) };
}

function slideCover(): SvgSeed {
  const w = 1920, h = 1080;
  const body = `<rect width="${w}" height="${h}" fill="#f1f5f9"/><rect x="0" y="0" width="760" height="${h}" fill="#1e293b"/><circle cx="760" cy="540" r="330" fill="#6366f1"/><circle cx="760" cy="540" r="250" fill="#f1f5f9"/>
  <text x="120" y="200" ${FONT} font-size="30" fill="#a5b4fc" letter-spacing="8">INFORME ANUAL 2026</text><text x="120" y="330" ${FONT} font-size="92" font-weight="800" fill="#fff">Resultados</text><text x="120" y="440" ${FONT} font-size="92" font-weight="800" fill="#fff">y estrategia</text><text x="120" y="900" ${FONT} font-size="26" fill="#cbd5e1">Presentado por · Nombre Apellido</text>
  <text x="1180" y="400" ${FONT} font-size="30" fill="#6366f1" letter-spacing="6">AGENDA</text>${["Visión general", "Métricas clave", "Nuevos mercados", "Plan 2027"].map((t, i) => `<text x="1180" y="${480 + i * 80}" ${FONT} font-size="40" font-weight="600" fill="#0f172a">0${i + 1}  ${t}</text>`).join("")}`;
  return { slug: "plantilla-presentacion-portada-corporativa", type: "template", width: w, height: h, category: "negocios", title: "Plantilla de portada de presentación corporativa 16:9 azul oscuro e índigo", description: "Diapositiva de portada editable con bloque de título, agenda y figura geométrica. Combinable con el set de infografía.", keywords: ["plantilla", "presentación", "portada", "diapositiva", "corporativo", "informe", "agenda", "16:9", "azul", "índigo", "empresa", "pitch", "powerpoint", "keynote", "editable", "template", "presentation", "slide", "cover", "corporate", "business", "report"], svg: doc(w, h, body) };
}

function businessCard(): SvgSeed {
  const w = 1800, h = 1200;
  const card = (x: number, y: number, dark: boolean) => `<rect x="${x}" y="${y}" width="1050" height="600" rx="28" fill="${dark ? "#0f172a" : "#fff"}" stroke="#e2e8f0" stroke-width="3"/>` + (dark
    ? `<circle cx="${x + 525}" cy="${y + 300}" r="90" fill="#6366f1"/><text x="${x + 525}" y="${y + 320}" ${FONT} font-size="64" font-weight="800" fill="#fff" text-anchor="middle">VP</text>`
    : `<rect x="${x}" y="${y}" width="24" height="600" rx="12" fill="#6366f1"/><text x="${x + 90}" y="${y + 170}" ${FONT} font-size="56" font-weight="800" fill="#0f172a">Nombre Apellido</text><text x="${x + 90}" y="${y + 225}" ${FONT} font-size="30" fill="#6366f1" letter-spacing="4">DIRECTORA CREATIVA</text><text x="${x + 90}" y="${y + 380}" ${FONT} font-size="28" fill="#475569">+57 300 000 0000</text><text x="${x + 90}" y="${y + 430}" ${FONT} font-size="28" fill="#475569">hola@tumarca.com</text><text x="${x + 90}" y="${y + 480}" ${FONT} font-size="28" fill="#475569">www.tumarca.com · Cali, Colombia</text>`);
  const body = `<rect width="${w}" height="${h}" fill="#f8fafc"/>${card(90, 60, true)}${card(660, 540, false)}`;
  return { slug: "plantilla-tarjeta-presentacion-minimal", type: "template", width: w, height: h, free: true, category: "negocios", title: "Plantilla de tarjeta de presentación minimalista en índigo, anverso y reverso", description: "Tarjeta de visita 90×50 mm con monograma y datos de contacto editables. Lista para imprimir.", keywords: ["tarjeta", "tarjeta de presentación", "tarjeta de visita", "plantilla", "minimalista", "índigo", "monograma", "contacto", "imprimir", "papelería", "identidad", "marca", "corporativo", "editable", "template", "business card", "minimal", "stationery", "branding", "print"], svg: doc(w, h, body) };
}

function remoteWork(): SvgSeed {
  const w = 1920, h = 1080;
  const body = `<rect width="${w}" height="${h}" fill="#fdf4ff"/><rect x="1180" y="120" width="520" height="420" rx="24" fill="#bae6fd"/><rect x="1180" y="120" width="520" height="420" rx="24" fill="none" stroke="#fff" stroke-width="18"/><path d="M1440 120v420M1180 330h520" stroke="#fff" stroke-width="18"/><circle cx="1560" cy="230" r="46" fill="#fde68a"/>
  <rect x="0" y="820" width="${w}" height="260" fill="#e9d5ff"/><rect x="420" y="700" width="1000" height="40" rx="12" fill="#a855f7"/><rect x="470" y="740" width="40" height="300" fill="#7e22ce"/><rect x="1330" y="740" width="40" height="300" fill="#7e22ce"/>
  <rect x="980" y="560" width="300" height="150" rx="16" fill="#1e293b"/><rect x="1000" y="580" width="260" height="110" rx="8" fill="#38bdf8"/><rect x="930" y="700" width="400" height="18" rx="9" fill="#0f172a"/>
  <rect x="520" y="620" width="90" height="80" rx="12" fill="#f97316"/><path d="M565 620c-60-60-110-10-60-10 20-40 70-50 60 10zM565 620c60-60 110-10 60-10-20-40-70-50-60 10z" fill="#22c55e"/>
  <circle cx="760" cy="420" r="70" fill="#fcd9b6"/><path d="M690 410c0-70 140-70 140 0-20-30-120-30-140 0z" fill="#3b2a1a"/><rect x="690" y="500" width="140" height="210" rx="40" fill="#6366f1"/><rect x="640" y="520" width="60" height="180" rx="30" fill="#6366f1" transform="rotate(20 670 520)"/><rect x="820" y="520" width="60" height="190" rx="30" fill="#6366f1" transform="rotate(-35 850 520)"/><rect x="700" y="690" width="120" height="130" rx="20" fill="#1e293b"/>
  <circle cx="300" cy="300" r="140" fill="#fde68a" opacity="0.7"/><text x="300" y="312" ${FONT} font-size="40" font-weight="700" fill="#92400e" text-anchor="middle">home office</text>`;
  return { slug: "ilustracion-trabajo-remoto-home-office", type: "illustration", width: w, height: h, featured: true, category: "negocios", title: "Ilustración plana de persona trabajando desde casa con portátil, planta y ventana", description: "Ilustración vectorial estilo flat de home office. Para blogs, landing pages y presentaciones sobre teletrabajo y productividad.", keywords: ["ilustración", "trabajo remoto", "home office", "teletrabajo", "persona", "portátil", "escritorio", "planta", "ventana", "productividad", "freelance", "flat", "plano", "lila", "vector", "illustration", "remote work", "laptop", "desk", "character", "flat design", "work from home"], svg: doc(w, h, body) };
}

export function svgSeeds(): SvgSeed[] {
  return [
    meshGradient(), trianglePattern(), waveLines(),
    iconSheet("set-iconos-lineales-interfaz-ui", ["inicio", "usuario", "buscar", "favorito", "estrella", "correo", "telefono", "ajustes", "camara", "musica", "video", "nube", "candado", "campana", "chat", "calendario", "ubicacion", "etiqueta", "regalo", "camion", "billetera", "grafica", "verificado", "carrito", "descargar", "mundo", "escudo", "rayo", "ojo", "papelera", "bolsa", "tarjeta"], { label: "Iconos de interfaz · 32 trazos", stroke: "#0f172a", bg: "#ffffff", free: true, featured: true, title: "Set de 32 iconos lineales de interfaz: inicio, usuario, búsqueda, correo, ajustes y más", description: "Iconos vectoriales de trazo uniforme (estilo outline) para apps, webs y presentaciones. Totalmente editables.", keywords: ["iconos", "icono", "set de iconos", "interfaz", "ui", "lineal", "outline", "trazo", "app", "web", "usuario", "buscar", "correo", "ajustes", "minimalista", "vector", "icons", "icon set", "line icons", "interface", "ux", "minimal"] }),
    iconSheet("set-iconos-comercio-electronico", ["carrito", "bolsa", "tarjeta", "caja", "camion", "etiqueta", "porcentaje", "regalo", "tienda", "billetera", "moneda", "recibo", "estrella", "favorito", "buscar", "usuario", "candado", "verificado", "rayo", "mundo", "campana", "chat", "descargar", "soporte", "devolucion", "envio", "calendario", "ubicacion", "telefono", "correo", "ajustes", "grafica"], { label: "Iconos ecommerce · 32 trazos", stroke: "#f8fafc", bg: "#1e293b", title: "Set de 32 iconos de comercio electrónico: carrito, pago, envío, tienda y soporte", description: "Iconos vectoriales lineales en blanco sobre azul pizarra, pensados para tiendas online, apps de delivery y fintech.", keywords: ["iconos", "ecommerce", "comercio electrónico", "tienda online", "carrito", "pago", "envío", "tarjeta", "caja", "descuento", "soporte", "fintech", "delivery", "lineal", "vector", "icons", "e-commerce", "shopping", "payment", "shipping", "store", "line icons"] }),
    skyline(), minimalMountains(), igPost(), storyTemplate(), flyerA4(), organicBlobs(), halftone(), infographic(), badges(), isoCubes(), ecoLogo(), lowPoly(), slideCover(), businessCard(), remoteWork(),
  ];
}

// ── Audio sintetizado ───────────────────────────────────────────────────────

export interface AudioSeed { slug: string; title: string; description: string; keywords: string[]; category: string; wav: Buffer; bpm: number | null; genre: string; mood: string; featured?: boolean; free?: boolean; hue: number }

const SR = 22050;
const note = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

function wavFrom(samples: Float32Array): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  let peak = 0; for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), 44 + i * 2);
  return buf;
}

function pluck(out: Float32Array, start: number, freq: number, dur: number, amp: number, bright = 0.5) {
  const n = Math.min(out.length - start, Math.floor(dur * SR));
  for (let i = 0; i < n; i++) { const t = i / SR, env = Math.exp(-t * (4 / dur)) * Math.min(1, i / 60); out[start + i] += amp * env * (Math.sin(2 * Math.PI * freq * t) + bright * 0.5 * Math.sin(4 * Math.PI * freq * t) + bright * 0.2 * Math.sin(6 * Math.PI * freq * t)); }
}
function pad(out: Float32Array, start: number, freqs: number[], dur: number, amp: number) {
  const n = Math.min(out.length - start, Math.floor(dur * SR));
  for (let i = 0; i < n; i++) { const t = i / SR, env = Math.min(1, t / 1.2) * Math.min(1, (dur - t) / 1.5); let v = 0; for (const f of freqs) v += Math.sin(2 * Math.PI * f * t + 0.3 * Math.sin(2 * Math.PI * 0.2 * t)) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t); out[start + i] += amp * env * v / freqs.length; }
}
function kick(out: Float32Array, start: number, amp: number) { const n = Math.floor(0.35 * SR); for (let i = 0; i < n && start + i < out.length; i++) { const t = i / SR; out[start + i] += amp * Math.exp(-t * 9) * Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-t * 25)) * t); } }
function hat(out: Float32Array, start: number, amp: number, rnd: () => number, dur = 0.05) { const n = Math.floor(dur * SR); for (let i = 0; i < n && start + i < out.length; i++) out[start + i] += amp * Math.exp(-(i / SR) * 60) * (rnd() * 2 - 1); }
function snare(out: Float32Array, start: number, amp: number, rnd: () => number) { const n = Math.floor(0.2 * SR); for (let i = 0; i < n && start + i < out.length; i++) { const t = i / SR; out[start + i] += amp * Math.exp(-t * 18) * ((rnd() * 2 - 1) * 0.7 + 0.3 * Math.sin(2 * Math.PI * 180 * t)); } }

function corporate(): AudioSeed {
  const dur = 16, out = new Float32Array(dur * SR), bpm = 112, beat = 60 / bpm, rnd = mulberry32(1);
  const prog = [[60, 64, 67], [67, 71, 74], [69, 72, 76], [65, 69, 72]]; // C G Am F
  for (let bar = 0; bar < 8; bar++) { const ch = prog[bar % 4]; const s = Math.floor(bar * 4 * beat * SR);
    pad(out, s, ch.map((n) => note(n - 12)), 4 * beat, 0.18);
    for (let k = 0; k < 8; k++) { const n = ch[k % 3] + (k >= 4 ? 12 : 0); pluck(out, s + Math.floor(k * beat / 2 * SR), note(n), 0.6, 0.35, 0.8); }
    for (let b = 0; b < 4; b++) { kick(out, s + Math.floor(b * beat * SR), 0.5); hat(out, s + Math.floor((b + 0.5) * beat * SR), 0.12, rnd); }
  }
  return { slug: "corporativo-optimista-ukelele-palmas", title: "Corporativo optimista: arpegios brillantes y ritmo ligero", description: "Pista alegre y motivadora para vídeos corporativos, explicativos y presentaciones de producto. Loop limpio de 16 segundos a 112 BPM.", keywords: ["corporativo", "optimista", "alegre", "motivador", "arpegio", "pop", "explicativo", "presentación", "startup", "fondo musical", "loop", "música", "corporate", "upbeat", "happy", "motivational", "background music", "explainer", "pop"], category: "musica", wav: wavFrom(out), bpm, genre: "Corporativo", mood: "Optimista", featured: true, hue: 45 };
}
function ambient(): AudioSeed {
  const dur = 18, out = new Float32Array(dur * SR);
  const chords = [[50, 57, 65, 69], [48, 55, 64, 67], [53, 60, 65, 69], [45, 52, 60, 64]];
  chords.forEach((c, i) => pad(out, Math.floor(i * 4.5 * SR), c.map((n) => note(n)), 5.2, 0.5));
  const rnd = mulberry32(5); for (let i = 0; i < 24; i++) pluck(out, Math.floor(rnd() * (dur - 2) * SR), note([74, 77, 81, 84, 86][Math.floor(rnd() * 5)]), 2.5, 0.08, 0.1);
  return { slug: "ambiente-relajante-pad-etereo", title: "Ambiente relajante: pad etéreo con campanas lejanas", description: "Atmósfera suave y envolvente para meditación, spa, documentales de naturaleza y fondos de bienestar. 18 segundos, sin pulso.", keywords: ["ambiente", "ambient", "relajante", "meditación", "spa", "pad", "etéreo", "calma", "bienestar", "naturaleza", "documental", "atmósfera", "fondo musical", "música", "relaxing", "calm", "meditation", "wellness", "atmospheric", "chill"], category: "musica", wav: wavFrom(out), bpm: null, genre: "Ambient", mood: "Relajante", free: true, hue: 190 };
}
function lofi(): AudioSeed {
  const dur = 16, out = new Float32Array(dur * SR), bpm = 84, beat = 60 / bpm, rnd = mulberry32(9);
  const prog = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]];
  for (let bar = 0; bar < 7; bar++) { const ch = prog[bar % 4]; const s = Math.floor(bar * 4 * beat * SR);
    pad(out, s, ch.map((n) => note(n)), 4 * beat, 0.22);
    for (let b = 0; b < 4; b++) { if (b === 0 || b === 2) kick(out, s + Math.floor((b + (b === 2 ? 0.5 : 0)) * beat * SR), 0.6); if (b === 1 || b === 3) snare(out, s + Math.floor(b * beat * SR), 0.3, rnd); for (let k = 0; k < 2; k++) hat(out, s + Math.floor((b + k * 0.5 + 0.02 * rnd()) * beat * SR), 0.08, rnd, 0.04); pluck(out, s + Math.floor(b * beat * SR), note(ch[0] - 24), beat, 0.4, 0.2); }
  }
  return { slug: "lofi-beat-chill-estudio", title: "Lo-fi beat relajado para estudiar y trabajar", description: "Ritmo lo-fi hip hop a 84 BPM con acordes cálidos y batería suave. Ideal para vlogs, streams, tutoriales y cafeterías.", keywords: ["lofi", "lo-fi", "beat", "hip hop", "chill", "relajado", "estudiar", "trabajar", "vlog", "stream", "tutorial", "cafetería", "ritmo", "fondo musical", "música", "lofi beat", "chillhop", "study", "relaxed", "background music"], category: "musica", wav: wavFrom(out), bpm, genre: "Lo-fi", mood: "Chill", featured: true, hue: 25 };
}
function cinematic(): AudioSeed {
  const dur = 14, out = new Float32Array(dur * SR), rnd = mulberry32(13);
  for (let i = 0; i < out.length; i++) { const t = i / SR, rise = Math.min(1, t / 11); out[i] += 0.25 * rise * (Math.sin(2 * Math.PI * 55 * t) + 0.5 * Math.sin(2 * Math.PI * 110 * t) + 0.25 * Math.sin(2 * Math.PI * 165 * t)); out[i] += 0.18 * rise * rise * (rnd() * 2 - 1) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.25 * t)); }
  for (let k = 0; k < 10; k++) kick(out, Math.floor((1 + k * 1.1 - k * k * 0.03) * SR), 0.6 + k * 0.04);
  pad(out, Math.floor(11 * SR), [note(38), note(45), note(50), note(57), note(62)], 3, 1.2);
  return { slug: "cinematico-epico-crescendo-trailer", title: "Cinemático épico: crescendo con drones graves e impactos", description: "Transición de tensión creciente con golpes rítmicos y acorde final. Para tráilers, intros, reels de impacto y anuncios.", keywords: ["cinemático", "épico", "crescendo", "tráiler", "intro", "tensión", "impacto", "drone", "golpes", "dramático", "anuncio", "reel", "suspenso", "fondo musical", "música", "cinematic", "epic", "trailer", "riser", "dramatic", "impact"], category: "efectos-de-sonido", wav: wavFrom(out), bpm: null, genre: "Cinemático", mood: "Épico", hue: 350 };
}
function jingle(): AudioSeed {
  const dur = 5, out = new Float32Array(dur * SR);
  [72, 76, 79, 84].forEach((n, i) => pluck(out, Math.floor(i * 0.18 * SR), note(n), 1.8, 0.5, 0.3));
  pad(out, Math.floor(0.8 * SR), [note(60), note(64), note(67), note(72)], 3.5, 0.5);
  return { slug: "logo-sonoro-campanas-ascendente", title: "Logo sonoro: campanas ascendentes con acorde cálido", description: "Identificador sonoro de 5 segundos para intros, notificaciones y cierres de vídeo. Limpio y positivo.", keywords: ["logo sonoro", "jingle", "intro", "campanas", "ascendente", "notificación", "cierre", "identidad sonora", "marca", "corto", "positivo", "efecto", "música", "sound logo", "ident", "bells", "intro", "sting", "notification"], category: "efectos-de-sonido", wav: wavFrom(out), bpm: null, genre: "Jingle", mood: "Positivo", free: true, hue: 140 };
}

export function audioSeeds(): AudioSeed[] { return [corporate(), ambient(), lofi(), cinematic(), jingle()]; }

/** Portada SVG para audio: degradado + barras de onda. */
export function audioCoverSvg(a: AudioSeed): string {
  const w = 1600, h = 900, rnd = mulberry32(a.hue);
  let bars = "";
  for (let i = 0; i < 64; i++) { const bh = 60 + rnd() * 320; bars += `<rect x="${140 + i * 20.5}" y="${(h - bh) / 2}" width="12" rx="6" height="${bh}" fill="#fff" opacity="${0.55 + rnd() * 0.45}"/>`; }
  return doc(w, h, `<rect width="${w}" height="${h}" fill="url(#g)"/>${bars}<text x="80" y="820" ${FONT} font-size="44" font-weight="700" fill="#fff" opacity="0.9">${esc(a.genre)} · ${esc(a.mood)}${a.bpm ? ` · ${a.bpm} BPM` : ""}</text>`, `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hsl(a.hue, 70, 30)}"/><stop offset="1" stop-color="${hsl(a.hue + 40, 80, 50)}"/></linearGradient>`);
}
