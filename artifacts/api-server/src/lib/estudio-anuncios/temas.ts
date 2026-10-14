/**
 * Temas: decoración por ocasión o nicho (Navidad, Amor y Amistad, mascotas…).
 *
 * Un tema no cambia la maqueta ni la paleta: suma stickers (elementos.ts) en
 * las esquinas libres y, si aplica, una cinta corta ("Navidad"). La cinta es
 * el nombre de la ocasión, no una promesa: nada de "50 % dto." inventado, eso
 * lo decide el dueño en el editor si existe de verdad.
 */
import { existeElemento } from "./elementos";
import { icono, nuevoId, texto, zonaSegura, type Capa, type Entrada, type Formato } from "./esquema";
import type { EstiloResuelto } from "./estilos";

export type PosicionDecoracion = "arriba-izq" | "arriba-der" | "abajo-izq" | "abajo-der" | "arriba-centro";

export interface Decoracion {
  icono: string;
  pos: PosicionDecoracion;
  /** Tamaño como fracción del ancho del lienzo. */
  tam: number;
  rot?: number;
  opacidad?: number;
  anim?: Entrada;
}

export interface Tema {
  id: string;
  nombre: string;
  tags: string[];
  decoraciones: Decoracion[];
  /** Cinta corta arriba (nombre de la ocasión). */
  cinta?: string;
  /** Sugerencia de tipografía de titular para esta ocasión. */
  fuenteTitular?: string;
}

const D = (icono: string, pos: PosicionDecoracion, tam = 0.14, extra: Partial<Decoracion> = {}): Decoracion => ({ icono, pos, tam, ...extra });

export const TEMAS: Tema[] = [
  { id: "ninguno", nombre: "Sin tema", tags: ["basico"], decoraciones: [] },
  { id: "navidad", nombre: "Navidad", tags: ["temporada", "diciembre", "regalos"], cinta: "Navidad", fuenteTitular: "lobster", decoraciones: [D("emoji:christmas-tree", "arriba-der", 0.16, { rot: 8, anim: "rebote" }), D("emoji:wrapped-gift", "abajo-izq", 0.14, { rot: -10, anim: "zoom" }), D("emoji:snowflake", "arriba-izq", 0.08, { opacidad: 0.9 })] },
  { id: "amor", nombre: "Amor y Amistad", tags: ["temporada", "septiembre", "san-valentin", "pareja"], cinta: "Amor y Amistad", fuenteTitular: "dancing", decoraciones: [D("emoji:red-heart", "arriba-der", 0.13, { rot: 12, anim: "rebote" }), D("emoji:sparkling-heart", "abajo-izq", 0.11, { rot: -8, anim: "zoom" }), D("emoji:rose", "arriba-izq", 0.1)] },
  { id: "madre", nombre: "Día de la Madre", tags: ["temporada", "mayo", "regalos", "mama"], cinta: "Día de la Madre", fuenteTitular: "dancing", decoraciones: [D("emoji:bouquet", "arriba-der", 0.15, { rot: 6, anim: "zoom" }), D("emoji:sparkling-heart", "abajo-izq", 0.11, { anim: "rebote" }), D("emoji:hibiscus", "arriba-izq", 0.09)] },
  { id: "padre", nombre: "Día del Padre", tags: ["temporada", "junio", "regalos", "papa"], cinta: "Día del Padre", fuenteTitular: "oswald", decoraciones: [D("emoji:necktie", "arriba-der", 0.13, { rot: 8 }), D("emoji:wrapped-gift", "abajo-izq", 0.12, { anim: "zoom" }), D("emoji:trophy", "arriba-izq", 0.09)] },
  { id: "halloween", nombre: "Halloween", tags: ["temporada", "octubre", "disfraces", "dulces"], cinta: "Halloween", fuenteTitular: "bangers", decoraciones: [D("emoji:jack-o-lantern", "arriba-der", 0.15, { rot: -8, anim: "rebote" }), D("emoji:ghost", "abajo-izq", 0.13, { rot: 10, anim: "deslizar-izq" }), D("emoji:spider-web", "arriba-izq", 0.12, { opacidad: 0.85 })] },
  { id: "blackfriday", nombre: "Black Friday", tags: ["temporada", "noviembre", "oferta", "descuentos"], cinta: "Black Friday", fuenteTitular: "anton", decoraciones: [D("emoji:fire", "arriba-der", 0.13, { anim: "zoom" }), D("emoji:shopping-bags", "abajo-izq", 0.13, { rot: -6, anim: "rebote" }), D("emoji:label", "arriba-izq", 0.09, { rot: -20 })] },
  { id: "anonuevo", nombre: "Año Nuevo", tags: ["temporada", "diciembre", "enero", "fiesta"], cinta: "Año Nuevo", fuenteTitular: "righteous", decoraciones: [D("emoji:party-popper", "arriba-der", 0.15, { anim: "zoom" }), D("emoji:sparkles", "arriba-izq", 0.1, { anim: "aparecer" }), D("emoji:confetti-ball", "abajo-izq", 0.12, { rot: 10, anim: "rebote" })] },
  { id: "escolar", nombre: "Regreso a clases", tags: ["temporada", "enero", "agosto", "estudiantes", "utiles"], cinta: "Regreso a clases", fuenteTitular: "fredoka", decoraciones: [D("emoji:backpack", "arriba-der", 0.14, { rot: 8, anim: "rebote" }), D("emoji:books", "abajo-izq", 0.12, { rot: -8 }), D("emoji:pencil", "arriba-izq", 0.09, { rot: 30 })] },
  { id: "vacaciones", nombre: "Vacaciones", tags: ["temporada", "verano", "viajes", "playa"], cinta: "Vacaciones", fuenteTitular: "pacifico", decoraciones: [D("emoji:sun", "arriba-der", 0.14, { anim: "zoom" }), D("emoji:palm-tree", "abajo-izq", 0.14, { rot: -6, anim: "deslizar-izq" }), D("emoji:beach-with-umbrella", "arriba-izq", 0.1)] },
  { id: "diasinvia", nombre: "Día sin IVA", tags: ["temporada", "colombia", "oferta", "descuentos"], cinta: "Día sin IVA", fuenteTitular: "archivo", decoraciones: [D("emoji:fire", "arriba-der", 0.12, { anim: "zoom" }), D("emoji:shopping-cart", "abajo-izq", 0.12, { anim: "deslizar-izq" }), D("emoji:alarm-clock", "arriba-izq", 0.09, { rot: -15, anim: "rebote" })] },
  { id: "deportes", nombre: "Deportes", tags: ["nicho", "fitness", "futbol", "energia"], fuenteTitular: "bebas", decoraciones: [D("emoji:soccer-ball", "arriba-der", 0.13, { rot: 15, anim: "rebote" }), D("emoji:trophy", "abajo-izq", 0.12, { anim: "zoom" }), D("emoji:high-voltage", "arriba-izq", 0.09)] },
  { id: "fitness", nombre: "Fitness", tags: ["nicho", "gimnasio", "salud", "energia"], fuenteTitular: "anton", decoraciones: [D("emoji:flexed-biceps", "arriba-der", 0.13, { anim: "zoom" }), D("emoji:fire", "abajo-izq", 0.12, { anim: "rebote" }), D("emoji:running-shoe", "arriba-izq", 0.1, { rot: -20 })] },
  { id: "mascotas", nombre: "Mascotas", tags: ["nicho", "perros", "gatos", "animales"], fuenteTitular: "fredoka", decoraciones: [D("emoji:paw-prints", "arriba-der", 0.13, { rot: 20, anim: "aparecer" }), D("emoji:dog-face", "abajo-izq", 0.12, { anim: "rebote" }), D("emoji:bone", "arriba-izq", 0.09, { rot: -25 })] },
  { id: "belleza", nombre: "Belleza", tags: ["nicho", "maquillaje", "cuidado", "cosmetica"], fuenteTitular: "playfair", decoraciones: [D("emoji:sparkles", "arriba-der", 0.12, { anim: "aparecer" }), D("emoji:lipstick", "abajo-izq", 0.11, { rot: -15, anim: "zoom" }), D("emoji:nail-polish", "arriba-izq", 0.09)] },
  { id: "tecnologia", nombre: "Tecnología", tags: ["nicho", "gadgets", "celulares", "computadores"], fuenteTitular: "roboto", decoraciones: [D("emoji:high-voltage", "arriba-der", 0.11, { anim: "zoom" }), D("emoji:mobile-phone", "abajo-izq", 0.1, { rot: -10 }), D("emoji:sparkles", "arriba-izq", 0.08)] },
  { id: "comida", nombre: "Comida", tags: ["nicho", "restaurante", "reposteria", "cafe"], fuenteTitular: "lobster", decoraciones: [D("emoji:fork-and-knife", "arriba-der", 0.12, { rot: 15, anim: "rebote" }), D("emoji:fire", "abajo-izq", 0.1, { anim: "zoom" }), D("emoji:hot-beverage", "arriba-izq", 0.1)] },
  { id: "hogar", nombre: "Hogar", tags: ["nicho", "decoracion", "cocina", "muebles"], fuenteTitular: "nunito", decoraciones: [D("emoji:house", "arriba-der", 0.12, { anim: "zoom" }), D("emoji:potted-plant", "abajo-izq", 0.12, { anim: "deslizar-abajo" }), D("emoji:sparkles", "arriba-izq", 0.08)] },
  { id: "bebes", nombre: "Bebés y niños", tags: ["nicho", "infantil", "juguetes", "maternidad"], fuenteTitular: "fredoka", decoraciones: [D("emoji:teddy-bear", "arriba-der", 0.13, { rot: 10, anim: "rebote" }), D("emoji:baby-bottle", "abajo-izq", 0.1, { rot: -15 }), D("emoji:star", "arriba-izq", 0.09, { anim: "zoom" })] },
  { id: "fiesta", nombre: "Fiesta y eventos", tags: ["nicho", "cumpleanos", "celebracion"], fuenteTitular: "righteous", decoraciones: [D("emoji:balloon", "arriba-der", 0.13, { rot: 10, anim: "deslizar-abajo" }), D("emoji:birthday-cake", "abajo-izq", 0.12, { anim: "zoom" }), D("emoji:party-popper", "arriba-izq", 0.1, { anim: "rebote" })] },
  { id: "naturaleza", nombre: "Natural y orgánico", tags: ["nicho", "plantas", "eco", "saludable"], fuenteTitular: "caveat", decoraciones: [D("emoji:leaf-fluttering-in-wind", "arriba-der", 0.12, { rot: 20, anim: "deslizar-abajo" }), D("emoji:four-leaf-clover", "abajo-izq", 0.1, { anim: "zoom" }), D("emoji:sunflower", "arriba-izq", 0.1)] },
  { id: "lujo", nombre: "Lujo", tags: ["nicho", "joyeria", "premium", "relojes"], fuenteTitular: "playfair", decoraciones: [D("emoji:gem-stone", "arriba-der", 0.11, { anim: "zoom" }), D("emoji:crown", "abajo-izq", 0.1, { rot: -10, anim: "rebote" }), D("emoji:sparkles", "arriba-izq", 0.08, { anim: "aparecer" })] },
  { id: "envios", nombre: "Envíos y pagos", tags: ["nicho", "confianza", "contraentrega"], decoraciones: [D("emoji:delivery-truck", "arriba-der", 0.13, { anim: "deslizar-der" }), D("emoji:money-bag", "abajo-izq", 0.11, { anim: "rebote" }), D("emoji:check-mark-button", "arriba-izq", 0.09, { anim: "zoom" })] },
];

export const TEMAS_LISTA = TEMAS.map((t) => t.id);

export function temaPorId(id?: string | null): Tema {
  return TEMAS.find((t) => t.id === String(id || "").toLowerCase()) || TEMAS[0]!;
}

type Caja = { x: number; y: number; w: number; h: number };
const seSolapan = (a: Caja, b: Caja, holgura = 6) => a.x < b.x + b.w + holgura && a.x + a.w + holgura > b.x && a.y < b.y + b.h + holgura && a.y + a.h + holgura > b.y;

/**
 * Capas de decoración del tema para un formato (solo los iconos que existen
 * en las colecciones instaladas). Si se pasan las capas de la pieza en
 * `esquivar`, cada sticker se corre hacia adentro (o se achica) hasta no tapar
 * ningún texto, botón ni chip: puede pisar fotos y fondos, nunca la letra.
 */
export function decoracionesDeTema(tema: Tema | string | null | undefined, formato: Formato, opts: { evitar?: PosicionDecoracion[]; conAnimacion?: boolean; esquivar?: Capa[] } = {}): Capa[] {
  const t = typeof tema === "string" || !tema ? temaPorId(tema as string) : tema;
  if (!t.decoraciones.length) return [];
  const z = zonaSegura(formato);
  const evitar = new Set(opts.evitar || []);
  const ocupadas: Caja[] = (opts.esquivar || []).filter((k) => k.tipo === "texto" || k.tipo === "rect" || k.tipo === "circulo" || k.tipo === "icono").map((k) => ({ x: k.x, y: k.y, w: k.w, h: k.h }));
  const capas: Capa[] = [];
  for (const d of t.decoraciones) {
    if (evitar.has(d.pos) || !existeElemento(d.icono)) continue;
    const margen = Math.round(z.m * 0.5);
    const arriba = d.pos.startsWith("arriba");
    let elegido: Caja | null = null;
    // Se prueba a tamaño completo y luego más pequeño; en cada tamaño, de la esquina hacia adentro.
    for (const factor of [1, 0.75, 0.55]) {
      const tam = Math.round(z.W * d.tam * factor);
      const base = {
        "arriba-izq": { x: margen, y: z.top - (formato === "historia" ? 70 : 10) },
        "arriba-der": { x: z.W - margen - tam, y: z.top - (formato === "historia" ? 70 : 10) },
        "abajo-izq": { x: margen, y: z.bottom - tam + (formato === "historia" ? 80 : 20) },
        "abajo-der": { x: z.W - margen - tam, y: z.bottom - tam + (formato === "historia" ? 80 : 20) },
        "arriba-centro": { x: Math.round(z.W / 2 - tam / 2), y: z.top - (formato === "historia" ? 90 : 20) },
      }[d.pos];
      // Primero cerca de la esquina; si todo está ocupado, se recorre el borde
      // entero (de arriba abajo o al revés) antes de achicar el adorno.
      const candidatos: number[] = [0, 0.5, 1, 1.5, 2, 2.5].map((paso) => Math.round(base.y + (arriba ? 1 : -1) * paso * tam));
      if (d.pos !== "arriba-centro") {
        const desde = arriba ? z.top : z.bottom - tam, hasta = arriba ? z.bottom - tam : z.top, salto = Math.max(24, Math.round(tam * 0.5)) * (arriba ? 1 : -1);
        for (let y = desde; arriba ? y <= hasta : y >= hasta; y += salto) candidatos.push(Math.round(y));
      }
      for (const y of candidatos) {
        const caja = { x: base.x, y, w: tam, h: tam };
        if (caja.y < -tam * 0.3 || caja.y + caja.h > z.H + tam * 0.3) continue;
        if (!ocupadas.some((o) => seSolapan(caja, o))) { elegido = caja; break; }
      }
      if (elegido) break;
    }
    if (!elegido) continue;
    ocupadas.push(elegido);
    capas.push(icono(d.icono, elegido.x, elegido.y, elegido.w, elegido.h, { nombre: "Decoración", rot: d.rot, opacidad: d.opacidad, anim: opts.conAnimacion === false ? undefined : d.anim ? { entrada: d.anim, retraso: 0.4 + capas.length * 0.15, duracion: 0.5 } : undefined }));
  }
  return capas;
}

/** Cinta del tema ("Navidad") arriba a la derecha, con el acento del estilo. Vacío si el tema no la tiene. */
export function cintaDeTema(tema: Tema | string | null | undefined, formato: Formato, E: EstiloResuelto, opts: { y?: number; lado?: "izq" | "der" } = {}): Capa[] {
  const t = typeof tema === "string" || !tema ? temaPorId(tema as string) : tema;
  if (!t.cinta) return [];
  const z = zonaSegura(formato);
  const alto = formato === "cuadrado" ? 48 : 54;
  const tam = formato === "cuadrado" ? 24 : 27;
  const ancho = Math.round(Math.min(z.W * 0.5, t.cinta.length * tam * 0.62 + alto * 1.4));
  const y0 = opts.y ?? (formato === "historia" ? z.top - 80 : z.top - 8);
  const x0 = opts.lado === "izq" ? z.m : z.W - z.m - ancho;
  const fondo = E.paleta.acento, color = E.paleta.textoBoton;
  const anim = { entrada: "deslizar-der" as const, retraso: 0.2, duracion: 0.5 };
  const capas: Capa[] = [{ id: nuevoId("r"), tipo: "rect", x: x0, y: y0, w: ancho, h: alto, relleno: fondo, radio: Math.round(alto / 2), nombre: "Cinta del tema", anim }];
  capas.push(texto({ x: x0, y: y0 + Math.round((alto - tam * 1.13) / 2), w: ancho, texto: t.cinta, tam, min: 18, peso: 900, fuente: E.fuentes.cuerpo, color, alinear: "centro", maxLineas: 1, nombre: "Texto de la cinta", anim }).capa);
  return capas;
}

export function resumenDeTemas(): Array<{ id: string; nombre: string; tags: string[]; cinta: string | null; iconos: string[] }> {
  return TEMAS.map((t) => ({ id: t.id, nombre: t.nombre, tags: t.tags, cinta: t.cinta || null, iconos: t.decoraciones.map((d) => d.icono) }));
}
