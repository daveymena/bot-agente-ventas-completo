/**
 * Vista previa de un anuncio tal como se publicará: texto, imagen, botón y la
 * página de destino. Atlas la adjunta a su respuesta para que el dueño la vea
 * en el chat antes de aprobar la publicación.
 *
 * El HTML de la página viaja a un iframe sin scripts (sandbox), así que aquí
 * se quitan scripts, iframes, manejadores on* y URLs javascript: como defensa
 * en profundidad. El frontend vuelve a aplicar el mismo sandbox.
 */

export interface VistaPreviaAnuncio {
  formato: "feed" | "historia" | "landing";
  titulo: string;
  copy: string;
  cta: string;
  imagenUrl: string | null;
  paginaUrl: string | null;
  /** HTML de la página de destino ya saneado, para mostrarla dentro del chat. */
  html: string | null;
  /** Nombre de la página que aparece como remitente del anuncio. */
  pagina: string;
}

const LIMITE = { titulo: 120, copy: 600, cta: 30, pagina: 60 };

function recortar(texto: unknown, max: number): string {
  return String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Solo http(s) o rutas relativas: nada de javascript:, data: ni blob:. */
export function urlSegura(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  return null;
}

/** Quita lo que puede ejecutar código o cargar otra página dentro de la vista previa. */
export function sanearHtmlVistaPrevia(html: unknown): string | null {
  if (typeof html !== "string" || !html.trim()) return null;
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  s = s.replace(/<script\b[^>]*\/?>/gi, "");
  s = s.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "");
  s = s.replace(/<iframe\b[^>]*\/?>/gi, "");
  s = s.replace(/<(object|embed|meta|base)\b[^>]*\/?>/gi, "");
  // Etiquetas de cierre que quedaron sin apertura después del paso anterior.
  s = s.replace(/<\/(object|embed|iframe|script|meta|base)\s*>/gi, "");
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/(href|src|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"');
  return s;
}

export interface EntradaVistaPrevia {
  formato?: "feed" | "historia" | "landing";
  titulo?: unknown;
  copy?: unknown;
  cta?: unknown;
  imagenUrl?: unknown;
  paginaUrl?: unknown;
  html?: unknown;
  pagina?: unknown;
}

/** Construye la vista previa con los límites y saneados aplicados. Puro. */
export function construirVistaPreviaAnuncio(entrada: EntradaVistaPrevia): VistaPreviaAnuncio {
  const copy = recortar(entrada.copy, LIMITE.copy);
  const titulo = recortar(entrada.titulo, LIMITE.titulo);
  return {
    formato: entrada.formato ?? "feed",
    titulo,
    copy,
    cta: recortar(entrada.cta, LIMITE.cta) || "Más información",
    imagenUrl: urlSegura(entrada.imagenUrl),
    paginaUrl: urlSegura(entrada.paginaUrl),
    html: sanearHtmlVistaPrevia(entrada.html),
    pagina: recortar(entrada.pagina, LIMITE.pagina) || "Tu negocio",
  };
}
