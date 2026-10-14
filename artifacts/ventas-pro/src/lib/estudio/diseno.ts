/**
 * Tipos del Estudio de anuncios (espejo de api-server/src/lib/estudio-anuncios/esquema.ts).
 * El servidor es la fuente de verdad; aquí solo se tipa lo que el editor toca.
 */

export type Formato = "cuadrado" | "vertical" | "historia";

export const FORMATOS: Record<Formato, { ancho: number; alto: number; etiqueta: string; uso: string }> = {
  cuadrado: { ancho: 1080, alto: 1080, etiqueta: "1:1", uso: "Feed de Facebook e Instagram" },
  vertical: { ancho: 1080, alto: 1350, etiqueta: "4:5", uso: "Feed (ocupa más pantalla en el móvil)" },
  historia: { ancho: 1080, alto: 1920, etiqueta: "9:16", uso: "Historias y Reels" },
};

/** Maquetas (la parte "maqueta" de un id maqueta.estilo.tema). */
export const PLANTILLAS: Record<string, string> = {
  destacado: "Destacado", oferta: "Oferta", beneficios: "Beneficios", minimal: "Minimal", pregunta: "Pregunta", lista: "Lista",
  collage: "Collage", etiqueta: "Sello de precio", marco: "Marco", precio: "Precio", banda: "Banda",
};
export const nombreDePlantilla = (id: string) => PLANTILLAS[id] || PLANTILLAS[id.split(".")[0] || ""] || id;

// ─── Animación (vídeo) ───────────────────────────────────────────────────────
export type Entrada = "aparecer" | "deslizar-izq" | "deslizar-der" | "deslizar-arriba" | "deslizar-abajo" | "zoom" | "rebote";
export const ANIMACIONES: Record<Entrada, string> = {
  aparecer: "Aparecer", "deslizar-izq": "Entrar desde la izquierda", "deslizar-der": "Entrar desde la derecha",
  "deslizar-arriba": "Entrar desde arriba", "deslizar-abajo": "Entrar desde abajo", zoom: "Zoom", rebote: "Rebote",
};
/** Movimiento continuo de una capa dentro del cuadro (el producto "vive" en el vídeo). */
export type Movimiento = "flotar" | "latido" | "balancear" | "deriva" | "orbita" | "brillo" | "ninguno";
export const MOVIMIENTOS_CAPA: Record<Movimiento, string> = {
  ninguno: "Quieto", flotar: "Flotar (sube y baja)", latido: "Latido (crece y encoge)", balancear: "Balancearse", deriva: "Deriva lateral", orbita: "Órbita suave", brillo: "Brillo que pasa",
};
export interface Animacion { entrada?: Entrada | null; retraso?: number; duracion?: number; salida?: "desvanecer" | null; movimiento?: Movimiento | null; intensidad?: 1 | 2 | 3 }

// ─── Tipografías (espejo de tipografia.ts; el servidor sirve los mismos archivos en /fuentes.css) ───
export const FUENTES: Array<{ id: string; nombre: string; categoria: "sans" | "display" | "serif" | "script" | "manuscrita"; pesos: Array<400 | 700 | 900> }> = [
  { id: "inter", nombre: "Inter", categoria: "sans", pesos: [400, 700, 900] },
  { id: "montserrat", nombre: "Montserrat", categoria: "sans", pesos: [400, 700, 900] },
  { id: "poppins", nombre: "Poppins", categoria: "sans", pesos: [400, 700, 900] },
  { id: "nunito", nombre: "Nunito", categoria: "sans", pesos: [400, 700, 900] },
  { id: "raleway", nombre: "Raleway", categoria: "sans", pesos: [400, 700, 900] },
  { id: "roboto", nombre: "Roboto", categoria: "sans", pesos: [400, 700, 900] },
  { id: "bebas", nombre: "Bebas Neue", categoria: "display", pesos: [400] },
  { id: "anton", nombre: "Anton", categoria: "display", pesos: [400] },
  { id: "oswald", nombre: "Oswald", categoria: "display", pesos: [400, 700] },
  { id: "archivo", nombre: "Archivo Black", categoria: "display", pesos: [400] },
  { id: "bangers", nombre: "Bangers", categoria: "display", pesos: [400] },
  { id: "righteous", nombre: "Righteous", categoria: "display", pesos: [400] },
  { id: "fredoka", nombre: "Fredoka", categoria: "display", pesos: [400, 700] },
  { id: "playfair", nombre: "Playfair Display", categoria: "serif", pesos: [400, 700, 900] },
  { id: "abril", nombre: "Abril Fatface", categoria: "serif", pesos: [400] },
  { id: "lobster", nombre: "Lobster", categoria: "script", pesos: [400] },
  { id: "pacifico", nombre: "Pacifico", categoria: "script", pesos: [400] },
  { id: "dancing", nombre: "Dancing Script", categoria: "script", pesos: [700] },
  { id: "caveat", nombre: "Caveat", categoria: "manuscrita", pesos: [700] },
  { id: "marker", nombre: "Permanent Marker", categoria: "manuscrita", pesos: [400] },
];
export const fuentePorId = (id?: string | null) => FUENTES.find((f) => f.id === id) || FUENTES[0]!;
export const idDeFuente = (familia?: string | null): string | undefined => {
  const n = String(familia || "").split(",")[0]!.replace(/['"]/g, "").trim().toLowerCase();
  const f = FUENTES.find((x) => x.nombre.toLowerCase() === n || x.id === n);
  return f && f.id !== "inter" ? f.id : undefined;
};
export const familiaCss = (id?: string | null) => `"${fuentePorId(id).nombre}", Inter, system-ui, sans-serif`;

export const PATRONES: Record<string, string> = {
  puntos: "Puntos", "puntos-finos": "Puntos finos", diagonales: "Líneas diagonales", cuadricula: "Cuadrícula", ondas: "Ondas", circulos: "Círculos",
  zigzag: "Zigzag", cruces: "Cruces", triangulos: "Triángulos", confeti: "Confeti", rombos: "Rombos", estrellas: "Estrellitas", corazones: "Corazoncitos",
};

// ─── Capas ───────────────────────────────────────────────────────────────────
export interface CapaBase { id: string; tipo: string; x: number; y: number; w: number; h: number; rot?: number; opacidad?: number; nombre?: string; bloqueada?: boolean; anim?: Animacion | null }
export interface RellenoPatron { patron: string; color: string; fondo: string; escala?: number }
export type RellenoFondo = string | { degradado: [string, string]; angulo?: number } | RellenoPatron;
export interface CapaFondo extends CapaBase { tipo: "fondo"; relleno: RellenoFondo; imagen?: string | null; desenfoque?: number; oscurecer?: number }
export interface CapaImagen extends CapaBase { tipo: "imagen"; src: string; ajuste: "contener" | "cubrir"; radio?: number; sombra?: boolean; /** PNG sin fondo: sombra de silueta y sin esquinas. */ recortada?: boolean; /** Foto original de la que salió el recorte (para volver atrás). */ original?: string }
export interface CapaRect extends CapaBase { tipo: "rect"; relleno: string; radio?: number; borde?: { color: string; grosor: number } }
export interface CapaCirculo extends CapaBase { tipo: "circulo"; relleno: string }
export interface CapaTexto extends CapaBase { tipo: "texto"; texto: string; tam: number; peso: 400 | 700 | 900; fuente?: string; color: string; alinear: "izq" | "centro" | "der"; interlineado?: number; resaltado?: string | null; contorno?: { color: string; grosor: number } | null; maxLineas?: number }
/** Emoji, icono, logo o forma: `icono` es `coleccion:nombre` o `svg:<markup>`. */
export interface CapaIcono extends CapaBase { tipo: "icono"; icono: string; color?: string | null }
export type Capa = CapaFondo | CapaImagen | CapaRect | CapaCirculo | CapaTexto | CapaIcono;

export interface Diseno { version: 1; formato: Formato; ancho: number; alto: number; plantilla: string; estilo?: string; tema?: string; gancho?: string; capas: Capa[] }

export const esDegradado = (r: RellenoFondo): r is { degradado: [string, string]; angulo?: number } => typeof r === "object" && r !== null && "degradado" in r;
export const esPatron = (r: RellenoFondo): r is RellenoPatron => typeof r === "object" && r !== null && "patron" in r;

// ─── Vídeo ───────────────────────────────────────────────────────────────────
export type Transicion = string;
export const TRANSICIONES: Record<string, string> = {
  fade: "Fundido", fadeblack: "A negro", fadewhite: "A blanco", dissolve: "Disolver", smoothleft: "Deslizar suave", smoothup: "Subir suave",
  slideleft: "Deslizar", slideup: "Subir", slidedown: "Bajar", wipeleft: "Barrido", wipeup: "Barrido arriba", circleopen: "Círculo abre", circleclose: "Círculo cierra",
  radial: "Radial", zoomin: "Zoom", pixelize: "Pixelar", hblur: "Desenfoque", diagtl: "Diagonal", squeezeh: "Aplastar", vertopen: "Cortina", fadegrays: "A gris",
};
export type MovimientoCamara = "acercar" | "alejar" | "paneo" | "balanceo" | "respirar" | "giro3d" | "fijo" | "ninguno";
export const MOVIMIENTOS: Record<MovimientoCamara, string> = {
  acercar: "Acercar (zoom lento)", alejar: "Alejar", paneo: "Paneo lateral", balanceo: "Balanceo suave", respirar: "Respirar (zoom que va y vuelve)", giro3d: "Giro 3D sutil", fijo: "Fijo", ninguno: "Sin movimiento",
};
export type Ambiente = "nieve" | "confeti" | "chispas" | "corazones" | "burbujas" | "hojas";
export const AMBIENTES: Record<Ambiente, string> = { nieve: "Nieve", confeti: "Confeti", chispas: "Chispas", corazones: "Corazones", burbujas: "Burbujas", hojas: "Hojas" };

export interface Escena { id: string; diseno: Diseno; duracion: number; locucion: string; transicion?: Transicion; movimiento?: MovimientoCamara; /** Partículas de la escena (null = ninguna; undefined = según el tema). */ ambiente?: Ambiente | null; /** Vídeo de fondo (p. ej. una creación de IA) en vez del fondo pintado. */ clip?: string | null; editada?: boolean }

// ─── Recortes e IA sobre la foto real ────────────────────────────────────────
export interface RecorteGuardado { url: string | null; urlAbsoluta?: string | null; confianza: number; usable: boolean; motivo?: string; fondo?: string; en: string }
export interface CreacionIA {
  id: string; tipo: "imagen" | "video"; estado: "pendiente" | "en_curso" | "lista" | "fallo"; foto: string; instruccion: string;
  proveedor?: string; modelo?: string; url?: string; urlAbsoluta?: string; ancho?: number; alto?: number; duracion?: number;
  fidelidad?: "protegida" | "verificada" | "baja" | "no_verificable"; nota?: string; en: string; error?: string;
}
export interface ProveedorIA { id: "openai" | "gemini" | "replicate"; nombre: string; variable: string; configurado: boolean; imagen: boolean; video: boolean; conMascara: boolean; modeloImagen: string; modeloVideo: string | null }
export interface EstadoIA { proveedores: ProveedorIA[]; imagen: boolean; video: boolean; configurada: boolean }
export const FIDELIDAD: Record<NonNullable<CreacionIA["fidelidad"]>, { etiqueta: string; tono: "ok" | "aviso" | "neutro" }> = {
  protegida: { etiqueta: "Producto protegido por máscara", tono: "ok" }, verificada: { etiqueta: "Producto verificado y repuesto", tono: "ok" },
  baja: { etiqueta: "La IA alteró el producto: revisar", tono: "aviso" }, no_verificable: { etiqueta: "Revisar a ojo", tono: "neutro" },
};

export interface ImagenGenerada { id: string; plantilla: string; formato: Formato; ancho: number; alto: number; url: string; urlAbsoluta?: string; en: string; editada?: boolean; estilo?: string; tema?: string }
export interface VideoDelEstudio { estado: "pendiente" | "en_curso" | "listo" | "fallo"; url?: string; urlAbsoluta?: string; duracion?: number; tamano?: number; escenas?: number; conVoz?: boolean; conMusica?: boolean; en?: string; error?: string }
export interface Trabajo { estado: "pendiente" | "en_curso" | "listo" | "fallo"; progreso?: number; detalle?: string; posicion?: number; intento?: number; error?: string }

export interface EstadoEstudio {
  producto: { id: number; nombre: string; precio: unknown; imagen: string | null };
  estudio: {
    paquete?: { estado: string; en?: string; error?: string; conIA?: boolean; estilo?: string; tema?: string; guion?: string };
    contenido?: { nombre?: string; fotos: string[]; marca: string; color: string; precio: string | null; cta: string; ganchos: string[]; puntos: string[]; sellos: string[]; recortes?: Record<string, { url: string; confianza: number }> };
    imagenes: ImagenGenerada[];
    disenos: Record<string, Diseno>;
    escenas?: Escena[];
    video?: VideoDelEstudio;
    archivos?: Array<{ url: string; en: string; nombre?: string }>;
    recortes?: Record<string, RecorteGuardado>;
    ia?: CreacionIA[];
  };
  ia?: EstadoIA;
  trabajos: { paquete: Trabajo | null; video: Trabajo | null; ia?: Record<string, Trabajo> };
}

export interface ProductoDelEstudio {
  id: number; nombre: string; precio: unknown; moneda?: string; imagen: string | null; activo: boolean; fotos: number;
  estudio: { paquete: string | null; imagenes: number; video: string | null; videoUrl: string | null; portada: string | null; en: string | null } | null;
}

// ─── Catálogo de plantillas (GET /plantillas, /plantillas/buscar) ────────────
export interface ResumenEstilo { id: string; nombre: string; tags: string[]; fondo: string; acento: string; texto: string; titular: string; cuerpo: string }
export interface ResumenTema { id: string; nombre: string; tags: string[]; cinta: string | null; iconos: string[] }
export interface ResumenGuion { id: string; nombre: string; descripcion: string; duracion: string }
export interface PlantillaPersonal { id: string; nombre: string; formato: Formato; creadoEn: string; origen?: string }
export interface CatalogoEstudio {
  plantillas: Record<string, { nombre: string; descripcion: string; categoria: string; tags: string[]; fotos: number }>;
  estilos: ResumenEstilo[]; temas: ResumenTema[]; guiones: ResumenGuion[]; total: number; personales: PlantillaPersonal[];
}
export interface PlantillaCatalogo { id: string; nombre: string; maqueta: string; estilo: string; tema: string; categoria: string; tags: string[]; descripcion: string; vistaPrevia: string }
export interface Elemento { ref: string; nombre: string; coleccion: "emoji" | "iconos" | "marcas" | "formas"; coloreable: boolean; svg: string }

/** Fotos remotas pasan por el servidor para que el canvas pueda exportarse (CORS). */
export function proxyDeImagen(src: string): string {
  if (!src) return src;
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;
  if (src.startsWith("/uploads/") || src.startsWith("/images/") || src.startsWith("/api/")) return src;
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
