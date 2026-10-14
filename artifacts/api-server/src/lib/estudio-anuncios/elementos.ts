/**
 * Elementos decorativos del Estudio: emojis, iconos, logos de marcas y formas.
 *
 * Vienen como SVG de colecciones abiertas que llegan por npm (formato
 * Iconify: un JSON con el `body` de cada icono):
 *   - emoji  → @iconify-json/fluent-emoji-flat (Microsoft, MIT)   ~3.100
 *   - iconos → @iconify-json/tabler            (Tabler, MIT)      ~6.200
 *   - marcas → @iconify-json/simple-icons      (CC0)              ~3.700
 *   - formas → dibujadas acá (estrellas, sellos, flechas, cintas…)
 *
 * El mismo SVG lo pinta sharp en el servidor y Fabric en el panel, así los
 * stickers del editor salen idénticos en la imagen final y en el vídeo. Los
 * JSON se cargan perezosamente (son grandes) y solo la primera vez.
 */
import { createRequire } from "node:module";
import path from "node:path";

export type Coleccion = "emoji" | "iconos" | "marcas" | "formas";

export interface Elemento {
  /** Referencia estable: `coleccion:nombre` (p. ej. `emoji:red-heart`, `formas:estrella`). */
  ref: string;
  nombre: string;
  coleccion: Coleccion;
  /** true si el color se puede cambiar (iconos, marcas, formas); los emojis traen el suyo. */
  coloreable: boolean;
}

interface JsonIconify {
  width?: number;
  height?: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
}

const PAQUETES: Record<Exclude<Coleccion, "formas">, string> = {
  emoji: "@iconify-json/fluent-emoji-flat/icons.json",
  iconos: "@iconify-json/tabler/icons.json",
  marcas: "@iconify-json/simple-icons/icons.json",
};

export const COLECCIONES: Record<Coleccion, { nombre: string; licencia: string }> = {
  emoji: { nombre: "Emojis y stickers", licencia: "Fluent Emoji (Microsoft, MIT)" },
  iconos: { nombre: "Iconos", licencia: "Tabler Icons (MIT)" },
  marcas: { nombre: "Logos de marcas", licencia: "Simple Icons (CC0)" },
  formas: { nombre: "Formas", licencia: "VentasPro" },
};

const cache = new Map<string, JsonIconify | null>();
let requireLocal: NodeRequire | null = null;

function cargarJson(coleccion: Exclude<Coleccion, "formas">): JsonIconify | null {
  if (cache.has(coleccion)) return cache.get(coleccion)!;
  let json: JsonIconify | null = null;
  try {
    if (!requireLocal) requireLocal = createRequire(import.meta.url);
    json = requireLocal(PAQUETES[coleccion]) as JsonIconify;
  } catch {
    try { json = createRequire(path.join(process.cwd(), "artifacts/api-server/package.json"))(PAQUETES[coleccion]) as JsonIconify; } catch { json = null; }
  }
  cache.set(coleccion, json);
  return json;
}

// ─── Formas propias (viewBox 0 0 100 100, rellenas con currentColor) ─────────

const FORMAS: Record<string, { nombre: string; body: string; ancho?: number; alto?: number }> = {
  estrella: { nombre: "Estrella", body: `<path fill="currentColor" d="M50 2l14.7 31.3L99 38.2 74.5 61.9l5.8 34.1L50 79.6 19.7 96l5.8-34.1L1 38.2l34.3-4.9z"/>` },
  "sello-12": { nombre: "Sello dentado", body: `<path fill="currentColor" d="M50 0l9.6 9.3 12.9-3.6 4.6 12.6 13.3 2.4-1.3 13.4L100 42l-8.3 10.6 4.6 12.7-12.1 5.9.4 13.5-13.4 1.3L66.5 98.3 55 91.3 45 100l-10-8.7-11.5 7-4.7-12.3-13.4-1.3.4-13.5-12.1-5.9 4.6-12.7L0 42l10.9-7.9L9.6 20.7l13.3-2.4 4.6-12.6L40.4 9.3z"/>` },
  "sello-20": { nombre: "Sello explosión", body: `<path fill="currentColor" d="M50 0l6.2 8.6 9.3-5 3.6 10 10.5-1.6.6 10.6 10.4 1.8-2.4 10.3 9.4 4.9-5.2 9.2 7.6 7.4-7.6 7.4 5.2 9.2-9.4 4.9 2.4 10.3-10.4 1.8-.6 10.6-10.5-1.6-3.6 10-9.3-5L50 100l-6.2-8.6-9.3 5-3.6-10-10.5 1.6-.6-10.6-10.4-1.8 2.4-10.3-9.4-4.9 5.2-9.2L0 50l7.6-7.4-5.2-9.2 9.4-4.9-2.4-10.3 10.4-1.8.6-10.6 10.5 1.6 3.6-10 9.3 5z"/>` },
  circulo: { nombre: "Círculo", body: `<circle cx="50" cy="50" r="50" fill="currentColor"/>` },
  anillo: { nombre: "Anillo", body: `<circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-width="16"/>` },
  triangulo: { nombre: "Triángulo", body: `<path fill="currentColor" d="M50 4L98 94H2z"/>` },
  hexagono: { nombre: "Hexágono", body: `<path fill="currentColor" d="M50 0l43.3 25v50L50 100 6.7 75V25z"/>` },
  rombo: { nombre: "Rombo", body: `<path fill="currentColor" d="M50 0l50 50-50 50L0 50z"/>` },
  corazon: { nombre: "Corazón", body: `<path fill="currentColor" d="M50 92S6 64 6 33C6 18 17 8 29 8c9 0 16 5 21 12 5-7 12-12 21-12 12 0 23 10 23 25 0 31-44 59-44 59z"/>` },
  "flecha-der": { nombre: "Flecha", body: `<path fill="currentColor" d="M0 36h58V14l42 36-42 36V64H0z"/>` },
  "flecha-curva": { nombre: "Flecha curva", body: `<path fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" d="M10 85C14 45 40 22 78 20"/><path fill="currentColor" d="M66 6l30 14-24 22z"/>` },
  "flecha-garabato": { nombre: "Flecha a mano", body: `<path fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M8 20c20 30 40 50 70 58M78 78l-20-6M78 78l-4-20"/>` },
  burbuja: { nombre: "Burbuja de diálogo", body: `<path fill="currentColor" d="M50 6C23 6 4 22 4 42c0 11 6 21 16 28l-4 22 24-13c3 .5 6 .8 10 .8 27 0 46-16 46-37S77 6 50 6z"/>` },
  cinta: { nombre: "Cinta", body: `<path fill="currentColor" d="M0 25h100l-10 25 10 25H0l10-25z"/>` },
  "cinta-doblada": { nombre: "Cinta doblada", body: `<path fill="currentColor" d="M12 22h76l12 28-12 28H12L0 50z"/><path fill="currentColor" opacity=".35" d="M12 22L0 50l12 28V22zM88 22l12 28-12 28V22z"/>` },
  etiqueta: { nombre: "Etiqueta de precio", body: `<path fill="currentColor" d="M4 4h40l52 52-40 40L4 44z"/><circle cx="22" cy="22" r="8" fill="#fff"/>` },
  rayo: { nombre: "Rayo", body: `<path fill="currentColor" d="M58 0L14 56h26l-8 44 54-62H58z"/>` },
  check: { nombre: "Check", body: `<path fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" d="M12 54l24 24L90 20"/>` },
  "check-circulo": { nombre: "Check en círculo", body: `<circle cx="50" cy="50" r="50" fill="currentColor"/><path fill="none" stroke="#fff" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" d="M28 52l15 15 30-34"/>` },
  destello: { nombre: "Destello", body: `<path fill="currentColor" d="M50 0c3 28 22 47 50 50-28 3-47 22-50 50-3-28-22-47-50-50 28-3 47-22 50-50z"/>` },
  "destello-4": { nombre: "Chispa", body: `<path fill="currentColor" d="M50 0l8 42 42 8-42 8-8 42-8-42-42-8 42-8z"/>` },
  blob1: { nombre: "Mancha orgánica", body: `<path fill="currentColor" d="M83 18c14 13 20 36 12 54S64 100 44 98 6 82 2 62 12 22 30 10s39-5 53 8z"/>` },
  blob2: { nombre: "Mancha suave", body: `<path fill="currentColor" d="M72 6c19 6 30 28 27 48s-18 38-38 44-42-3-54-20S2 36 14 20 53 0 72 6z"/>` },
  onda: { nombre: "Onda", body: `<path fill="currentColor" d="M0 60c17 0 17-20 33-20s17 20 33 20 17-20 34-20v60H0z"/>`, ancho: 100, alto: 100 },
  "linea-garabato": { nombre: "Subrayado a mano", body: `<path fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" d="M4 60c20-14 40-14 60-6s24 4 32-4"/>`, ancho: 100, alto: 100 },
  "subrayado": { nombre: "Subrayado", body: `<path fill="currentColor" d="M0 40h100v20H0z"/>` },
  "marco": { nombre: "Marco", body: `<rect x="5" y="5" width="90" height="90" rx="6" fill="none" stroke="currentColor" stroke-width="6"/>` },
  "esquina": { nombre: "Esquina", body: `<path fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" d="M8 60V8h52"/>` },
  "puntos": { nombre: "Puntos", body: `<g fill="currentColor"><circle cx="15" cy="15" r="7"/><circle cx="50" cy="15" r="7"/><circle cx="85" cy="15" r="7"/><circle cx="15" cy="50" r="7"/><circle cx="50" cy="50" r="7"/><circle cx="85" cy="50" r="7"/><circle cx="15" cy="85" r="7"/><circle cx="50" cy="85" r="7"/><circle cx="85" cy="85" r="7"/></g>` },
  "porcentaje": { nombre: "Porcentaje", body: `<path fill="currentColor" d="M22 6a16 16 0 110 32 16 16 0 010-32zm0 10a6 6 0 100 12 6 6 0 000-12zm56 46a16 16 0 110 32 16 16 0 010-32zm0 10a6 6 0 100 12 6 6 0 000-12zM78 4l12 7-68 86-12-7z"/>` },
};

/** Palabras en español → términos de los nombres (en inglés) de las colecciones. */
const SINONIMOS: Record<string, string[]> = {
  corazon: ["heart"], amor: ["heart", "love", "kiss", "rose"], estrella: ["star"], fuego: ["fire", "flame"], regalo: ["gift", "present"],
  flecha: ["arrow"], carrito: ["cart", "shopping"], compra: ["shopping", "cart", "bag"], envio: ["truck", "delivery", "package"], camion: ["truck"],
  caja: ["package", "box"], dinero: ["money", "cash", "dollar", "coin"], plata: ["money", "cash", "coin"], descuento: ["discount", "percentage", "percent", "tag"],
  oferta: ["discount", "tag", "label", "fire"], precio: ["tag", "price", "label"], etiqueta: ["tag", "label"], telefono: ["phone", "telephone"], celular: ["mobile", "phone", "device-mobile"],
  reloj: ["clock", "watch", "alarm"], tiempo: ["clock", "hourglass", "timer"], ubicacion: ["map-pin", "pin", "location", "pushpin"], mapa: ["map"], casa: ["home", "house"], hogar: ["home", "house", "sofa"],
  corona: ["crown"], trofeo: ["trophy", "award", "medal"], premio: ["trophy", "award", "medal"], sol: ["sun"], luna: ["moon", "crescent"], planta: ["plant", "leaf", "seedling", "potted"],
  cafe: ["coffee", "hot-beverage", "cup"], pizza: ["pizza"], comida: ["food", "fork", "knife", "pizza", "burger", "hamburger", "taco"], hamburguesa: ["hamburger", "burger"], torta: ["cake", "cupcake"],
  ropa: ["shirt", "dress", "t-shirt", "jeans"], vestido: ["dress"], zapato: ["shoe", "sneaker", "boot", "high-heeled"], tenis: ["running-shoe", "sneaker"], bolso: ["handbag", "purse", "bag"],
  computador: ["laptop", "computer", "desktop"], portatil: ["laptop"], tecnologia: ["laptop", "mobile", "device", "cpu", "robot"], bebe: ["baby"], nino: ["child", "boy", "girl", "baby"], juguete: ["teddy", "toy", "game"],
  perro: ["dog"], gato: ["cat"], mascota: ["dog", "cat", "paw"], huella: ["paw"], mujer: ["woman"], hombre: ["man"], navidad: ["christmas", "santa", "snow", "gift", "wrapped-gift", "bell"],
  halloween: ["jack-o-lantern", "ghost", "spider", "skull", "pumpkin"], fiesta: ["party", "confetti", "balloon", "tada"], cumpleanos: ["birthday", "cake", "balloon"], verano: ["sun", "beach", "palm", "umbrella", "sunglasses"],
  playa: ["beach", "palm", "umbrella"], vacaciones: ["beach", "airplane", "luggage", "palm"], viaje: ["airplane", "luggage", "world", "map"], deporte: ["soccer", "ball", "trophy", "running", "bicycle", "dumbbell"], futbol: ["soccer"],
  gimnasio: ["biceps", "weight", "lifting", "running-shoe", "barbell"], fitness: ["biceps", "weight", "lifting", "running"], salud: ["heart", "pill", "stethoscope", "medical"], belleza: ["lipstick", "nail-polish", "sparkles", "mirror", "perfume"],
  maquillaje: ["lipstick", "nail-polish"], brillo: ["sparkles", "star", "dizzy", "glowing"], magia: ["sparkles", "magic", "wand"], check: ["check"], listo: ["check"], correcto: ["check"], si: ["check"], no: ["cross", "prohibited", "x"],
  alerta: ["warning", "alert", "exclamation"], atencion: ["warning", "alert", "megaphone", "loudspeaker"], anuncio: ["megaphone", "loudspeaker"], nuevo: ["new", "sparkles"], rapido: ["rocket", "bolt", "zap", "high-voltage", "fast"],
  rayo: ["bolt", "zap", "high-voltage", "lightning"], cohete: ["rocket"], seguridad: ["shield", "lock", "key"], garantia: ["shield", "certificate", "badge", "rosette"], calidad: ["award", "medal", "certificate", "rosette", "diamond"], diamante: ["diamond", "gem"],
  joya: ["ring", "gem", "diamond", "crown"], anillo: ["ring"], musica: ["music", "note", "headphone", "microphone"], camara: ["camera"], foto: ["camera", "photo"], video: ["video", "movie", "clapper", "film"], juego: ["game", "joystick", "controller"],
  libro: ["book"], escuela: ["school", "backpack", "books", "pencil", "graduation"], estudio: ["book", "graduation", "pencil"], curso: ["graduation", "book", "school"], herramienta: ["wrench", "hammer", "tool", "screwdriver"],
  carro: ["car", "automobile"], moto: ["motorcycle", "motor-scooter"], bici: ["bicycle", "bike"], llave: ["key", "wrench"], candado: ["lock", "padlock"], mano: ["hand", "pointing", "thumbs", "clap", "wave"], ok: ["ok-hand", "thumbs-up"],
  pulgar: ["thumbs"], aplauso: ["clap"], ojo: ["eye", "eyes"], boca: ["mouth", "lips", "kiss"], cara: ["face", "smiling"], feliz: ["smiling", "grinning", "star-struck"], sorpresa: ["astonished", "exploding", "flushed"],
  whatsapp: ["whatsapp"], instagram: ["instagram"], facebook: ["facebook"], tiktok: ["tiktok"], youtube: ["youtube"], correo: ["mail", "envelope", "e-mail"], mensaje: ["message", "speech", "chat", "comment"], chat: ["message", "speech", "chat"],
  tarjeta: ["credit-card", "card"], pago: ["credit-card", "cash", "money", "receipt"], factura: ["receipt", "invoice"], calendario: ["calendar"], grafico: ["chart", "trending"], crecer: ["trending-up", "chart-increasing", "growth"],
  mundo: ["world", "globe", "earth"], avion: ["airplane"], flor: ["flower", "blossom", "tulip", "rose", "sunflower", "hibiscus", "bouquet"], hoja: ["leaf"], arbol: ["tree"], natural: ["leaf", "plant", "herb", "seedling"],
  agua: ["droplet", "water", "wave"], gota: ["droplet"], hielo: ["ice", "snowflake"], nieve: ["snow"], lluvia: ["rain", "umbrella"], bebida: ["beverage", "cocktail", "beer", "wine", "cup", "tropical-drink"], cerveza: ["beer"], vino: ["wine"],
  chocolate: ["chocolate"], dulce: ["candy", "lollipop", "cake", "cookie", "doughnut"], fruta: ["apple", "banana", "strawberry", "watermelon", "lemon", "grapes", "cherries"], pan: ["bread", "croissant", "baguette"],
  limpieza: ["soap", "sponge", "broom", "bubbles", "shower"], cocina: ["cooking", "kitchen", "pot", "fork"], cama: ["bed"], sofa: ["couch", "sofa"], lampara: ["lamp", "bulb"], idea: ["bulb", "light-bulb"], luz: ["bulb", "flashlight", "sun"],
  robot: ["robot"], ia: ["robot", "sparkles"], medalla: ["medal"], cien: ["hundred"], top: ["top", "hundred", "crown"], mejor: ["crown", "trophy", "hundred", "medal"], circulo: ["circle"], cuadrado: ["square"], triangulo: ["triangle"],
  sello: ["sello", "badge", "rosette"], explosion: ["sello", "collision", "boom"], mancha: ["blob"], subrayado: ["subrayado", "linea"], marco: ["marco", "frame"], burbuja: ["burbuja", "speech"], cinta: ["cinta", "ribbon"],
};

const normalizar = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const SUGERIDOS: Record<Coleccion, string[]> = {
  emoji: ["fire", "sparkles", "red-heart", "star", "glowing-star", "party-popper", "wrapped-gift", "shopping-bags", "money-bag", "delivery-truck", "package", "check-mark-button", "thumbs-up", "clapping-hands", "backhand-index-pointing-down", "backhand-index-pointing-right", "eyes", "megaphone", "alarm-clock", "hundred-points", "collision", "rocket", "trophy", "crown", "gem-stone", "sun", "palm-tree", "christmas-tree", "jack-o-lantern", "bouquet", "smiling-face-with-heart-eyes", "star-struck", "high-voltage", "mobile-phone", "credit-card", "shopping-cart", "balloon", "birthday-cake", "ribbon", "light-bulb", "paw-prints", "dog-face", "cat-face", "lipstick", "flexed-biceps", "pizza", "hot-beverage", "house"],
  iconos: ["star-filled", "heart-filled", "circle-check-filled", "check", "arrow-right", "arrow-big-right-filled", "truck-delivery", "discount-2", "percentage", "tag", "gift", "shopping-cart", "cash", "credit-card", "clock", "map-pin", "package", "crown", "bolt", "flame", "rosette-discount-check-filled", "badge", "sparkles", "award", "medal", "shield-check", "phone", "message-circle", "thumb-up", "rocket", "trending-up", "certificate", "leaf", "diamond", "hand-click", "pointer", "confetti", "balloon"],
  marcas: ["whatsapp", "instagram", "facebook", "tiktok", "youtube", "messenger", "telegram", "visa", "mastercard", "paypal", "mercadopago", "shopify", "woocommerce", "pinterest", "x", "threads", "linkedin", "gmail", "google", "amazon", "applepay", "googlepay", "americanexpress", "spotify"],
  formas: Object.keys(FORMAS),
};

function existe(col: Exclude<Coleccion, "formas">, nombre: string): boolean {
  const j = cargarJson(col);
  return !!j && (!!j.icons[nombre] || !!j.aliases?.[nombre]);
}

/** Busca por nombre (acepta español) en una o todas las colecciones. */
export function buscarElementos(q: string, opts: { coleccion?: Coleccion | null; limite?: number } = {}): Elemento[] {
  const limite = Math.max(1, Math.min(200, opts.limite ?? 60));
  const colecciones: Coleccion[] = opts.coleccion ? [opts.coleccion] : ["emoji", "iconos", "formas", "marcas"];
  const palabras = normalizar(q).split(/[\s,]+/).filter(Boolean);
  const terminos = new Set<string>();
  for (const p of palabras) {
    terminos.add(p);
    for (const t of SINONIMOS[p] || []) terminos.add(t);
    // plurales simples
    if (p.endsWith("es")) { terminos.add(p.slice(0, -2)); for (const t of SINONIMOS[p.slice(0, -2)] || []) terminos.add(t); }
    if (p.endsWith("s")) { terminos.add(p.slice(0, -1)); for (const t of SINONIMOS[p.slice(0, -1)] || []) terminos.add(t); }
  }
  const out: Elemento[] = [];
  const puntaje = (nombre: string): number => {
    if (!terminos.size) return 1;
    let s = 0;
    for (const t of terminos) {
      if (nombre === t) s += 10;
      else if (nombre.startsWith(`${t}-`) || nombre.endsWith(`-${t}`)) s += 6;
      else if (nombre.includes(t)) s += 3;
    }
    return s;
  };
  for (const col of colecciones) {
    const candidatos: Array<{ nombre: string; s: number }> = [];
    if (col === "formas") {
      for (const [nombre, f] of Object.entries(FORMAS)) {
        const s = Math.max(puntaje(nombre), puntaje(normalizar(f.nombre).replace(/\s+/g, "-")));
        if (s > 0) candidatos.push({ nombre, s });
      }
    } else {
      const j = cargarJson(col);
      if (!j) continue;
      if (!terminos.size) {
        for (const nombre of SUGERIDOS[col]) if (existe(col, nombre)) candidatos.push({ nombre, s: 1 });
      } else {
        for (const nombre of Object.keys(j.icons)) {
          const s = puntaje(nombre);
          if (s > 0) candidatos.push({ nombre, s });
        }
      }
    }
    candidatos.sort((a, b) => b.s - a.s || a.nombre.length - b.nombre.length || a.nombre.localeCompare(b.nombre));
    for (const c of candidatos.slice(0, limite)) out.push({ ref: `${col}:${c.nombre}`, nombre: c.nombre, coleccion: col, coloreable: col !== "emoji" });
  }
  // Mezcla por puntaje global cuando se buscó en todas: primero lo más exacto de cada colección.
  return out.slice(0, opts.coleccion ? limite : limite * 2);
}

export interface SvgDeElemento { svg: string; ancho: number; alto: number; coloreable: boolean }

/**
 * SVG completo de un elemento. `color` reemplaza `currentColor` (iconos,
 * marcas, formas). `ref` también admite `svg:<markup>` para formas importadas
 * de otros editores (se sanea: nada de scripts ni enlaces externos).
 */
export function svgDeElemento(ref: string, color?: string | null): SvgDeElemento | null {
  const r = String(ref || "").trim();
  if (r.startsWith("svg:")) {
    const limpio = sanearSvg(r.slice(4));
    if (!limpio) return null;
    const vb = /viewBox="([\d.\s-]+)"/.exec(limpio)?.[1]?.split(/\s+/).map(Number) || [0, 0, 100, 100];
    return { svg: color ? limpio.replace(/currentColor/g, color) : limpio, ancho: vb[2] || 100, alto: vb[3] || 100, coloreable: /currentColor/.test(limpio) };
  }
  const i = r.indexOf(":");
  if (i < 1) return null;
  const col = r.slice(0, i) as Coleccion, nombre = r.slice(i + 1);
  if (!/^[a-z0-9-]+$/i.test(nombre)) return null;
  const fill = color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : color && /^rgba?\([\d.,\s]+\)$/i.test(color) ? color : "#111827";
  if (col === "formas") {
    const f = FORMAS[nombre];
    if (!f) return null;
    const w = f.ancho ?? 100, h = f.alto ?? 100;
    return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${f.body.replace(/currentColor/g, fill)}</svg>`, ancho: w, alto: h, coloreable: true };
  }
  if (!(col in PAQUETES)) return null;
  const j = cargarJson(col as Exclude<Coleccion, "formas">);
  if (!j) return null;
  const real = j.icons[nombre] ? nombre : j.aliases?.[nombre]?.parent;
  const ic = real ? j.icons[real] : undefined;
  if (!ic) return null;
  const w = ic.width ?? j.width ?? 24, h = ic.height ?? j.height ?? 24;
  const coloreable = col !== "emoji";
  const body = coloreable ? ic.body.replace(/currentColor/g, fill) : ic.body;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`, ancho: w, alto: h, coloreable };
}

/** Deja solo SVG inofensivo: sin scripts, eventos, enlaces ni imágenes externas. */
export function sanearSvg(markup: string): string | null {
  const s = String(markup || "").trim();
  if (!s || s.length > 60_000 || !/^<svg[\s>]/i.test(s)) return null;
  const limpio = s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/<(image|a|use|iframe|video|audio)[\s\S]*?(\/>|<\/\1>)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/\s(href|xlink:href)\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/url\(\s*['"]?\s*(https?:|data:)[^)]*\)/gi, "none");
  if (!/viewBox=/.test(limpio)) return null;
  return limpio;
}

/** Nombre legible para listas y para Atlas. */
export function nombreDeElemento(ref: string): string {
  const [col, nombre] = ref.split(":");
  if (col === "formas") return FORMAS[nombre || ""]?.nombre || nombre || ref;
  return (nombre || ref).replace(/-/g, " ");
}

export function existeElemento(ref: string): boolean {
  return !!svgDeElemento(ref);
}

export function resumenDeColecciones(): Array<{ id: Coleccion; nombre: string; licencia: string; cantidad: number }> {
  return (Object.keys(COLECCIONES) as Coleccion[]).map((id) => {
    const cantidad = id === "formas" ? Object.keys(FORMAS).length : Object.keys(cargarJson(id)?.icons || {}).length;
    return { id, nombre: COLECCIONES[id].nombre, licencia: COLECCIONES[id].licencia, cantidad };
  });
}
