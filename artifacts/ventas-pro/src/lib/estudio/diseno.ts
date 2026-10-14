/**
 * Tipos del Estudio de anuncios (espejo de api-server/src/lib/estudio-anuncios/diseno.ts).
 * El servidor es la fuente de verdad; aquí solo se tipa lo que el editor toca.
 */

export type Formato = "cuadrado" | "vertical" | "historia";

export const FORMATOS: Record<Formato, { ancho: number; alto: number; etiqueta: string; uso: string }> = {
  cuadrado: { ancho: 1080, alto: 1080, etiqueta: "1:1", uso: "Feed de Facebook e Instagram" },
  vertical: { ancho: 1080, alto: 1350, etiqueta: "4:5", uso: "Feed (ocupa más pantalla en el móvil)" },
  historia: { ancho: 1080, alto: 1920, etiqueta: "9:16", uso: "Historias y Reels" },
};

export const PLANTILLAS: Record<string, string> = { destacado: "Destacado", oferta: "Oferta", beneficios: "Beneficios", minimal: "Minimal" };

export interface CapaBase { id: string; tipo: string; x: number; y: number; w: number; h: number; rot?: number; opacidad?: number; nombre?: string; bloqueada?: boolean }
export interface CapaFondo extends CapaBase { tipo: "fondo"; relleno: string | { degradado: [string, string]; angulo?: number }; imagen?: string | null; desenfoque?: number; oscurecer?: number }
export interface CapaImagen extends CapaBase { tipo: "imagen"; src: string; ajuste: "contener" | "cubrir"; radio?: number; sombra?: boolean }
export interface CapaRect extends CapaBase { tipo: "rect"; relleno: string; radio?: number; borde?: { color: string; grosor: number } }
export interface CapaCirculo extends CapaBase { tipo: "circulo"; relleno: string }
export interface CapaTexto extends CapaBase { tipo: "texto"; texto: string; tam: number; peso: 400 | 700 | 900; color: string; alinear: "izq" | "centro" | "der"; interlineado?: number; resaltado?: string | null; maxLineas?: number }
export type Capa = CapaFondo | CapaImagen | CapaRect | CapaCirculo | CapaTexto;

export interface Diseno { version: 1; formato: Formato; ancho: number; alto: number; plantilla: string; gancho?: string; capas: Capa[] }

export type Transicion = "fade" | "smoothleft" | "circleopen" | "slideup" | "zoomin" | "fadeblack";
export const TRANSICIONES: Record<Transicion, string> = { fade: "Fundido", smoothleft: "Deslizar", circleopen: "Círculo", slideup: "Subir", zoomin: "Zoom", fadeblack: "A negro" };
export const MOVIMIENTOS: Record<"acercar" | "alejar" | "fijo", string> = { acercar: "Acercar", alejar: "Alejar", fijo: "Fijo" };

export interface Escena { id: string; diseno: Diseno; duracion: number; locucion: string; transicion?: Transicion; movimiento?: "acercar" | "alejar" | "fijo"; editada?: boolean }

export interface ImagenGenerada { id: string; plantilla: string; formato: Formato; ancho: number; alto: number; url: string; urlAbsoluta?: string; en: string; editada?: boolean }
export interface VideoDelEstudio { estado: "pendiente" | "en_curso" | "listo" | "fallo"; url?: string; urlAbsoluta?: string; duracion?: number; tamano?: number; escenas?: number; conVoz?: boolean; conMusica?: boolean; en?: string; error?: string }
export interface Trabajo { estado: "pendiente" | "en_curso" | "listo" | "fallo"; progreso?: number; detalle?: string; posicion?: number; intento?: number; error?: string }

export interface EstadoEstudio {
  producto: { id: number; nombre: string; precio: unknown; imagen: string | null };
  estudio: {
    paquete?: { estado: string; en?: string; error?: string; conIA?: boolean };
    contenido?: { fotos: string[]; marca: string; color: string; precio: string | null; cta: string; ganchos: string[]; puntos: string[]; sellos: string[] };
    imagenes: ImagenGenerada[];
    disenos: Record<string, Diseno>;
    escenas?: Escena[];
    video?: VideoDelEstudio;
    archivos?: Array<{ url: string; en: string; nombre?: string }>;
  };
  trabajos: { paquete: Trabajo | null; video: Trabajo | null };
}

export interface ProductoDelEstudio {
  id: number; nombre: string; precio: unknown; moneda?: string; imagen: string | null; activo: boolean; fotos: number;
  estudio: { paquete: string | null; imagenes: number; video: string | null; videoUrl: string | null; portada: string | null; en: string | null } | null;
}

/** Fotos remotas pasan por el servidor para que el canvas pueda exportarse (CORS). */
export function proxyDeImagen(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/uploads/") || src.startsWith("/images/")) return src;
  return `/api/estudio-anuncios/imagen?src=${encodeURIComponent(src)}`;
}

export const nuevoId = (p = "c") => `${p}${Math.random().toString(36).slice(2, 8)}`;

export const AMARILLO = "#FFD60A";
export const VERDE_WA = "#25D366";

export async function apiEstudio<T = any>(ruta: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`/api/estudio-anuncios${ruta}`, { credentials: "include", ...init, headers: init.body instanceof Blob ? init.headers : { "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    let detalle = "";
    try { detalle = JSON.parse(raw).error || JSON.parse(raw).message || ""; } catch { detalle = raw.slice(0, 160); }
    throw new Error(detalle || `Error ${r.status}`);
  }
  const tipo = r.headers.get("content-type") || "";
  return (tipo.includes("application/json") ? r.json() : r.blob()) as Promise<T>;
}
