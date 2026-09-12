/**
 * Texto que se PUBLICA tiene que ser texto.
 *
 * El dueño vio en un anuncio, textual: "type doc content type paragraph attrs
 * align null indent null content type text text ..." (12-09-2026). Es la
 * forma serializada de un editor de texto enriquecido (ProseMirror/TipTap:
 * doc → paragraph → text) que entró pegada desde otra herramienta y nadie la
 * desarmó. Acá se detecta y se extrae SOLO el texto, en cualquier punto por el
 * que salga algo hacia afuera: anuncios, posts, landings.
 */

/** ¿Parece un documento de editor serializado (objeto o su JSON/volcado)? */
export function pareceDocumentoDeEditor(v: unknown): boolean {
  if (v && typeof v === "object") {
    const o: any = v;
    return o.type === "doc" && Array.isArray(o.content);
  }
  const t = String(v ?? "");
  if (/"type"\s*:\s*"doc"/.test(t) && /"content"/.test(t)) return true;
  // El volcado "aplanado" que vio el dueño: las claves sin comillas ni llaves.
  return /\btype\s+doc\s+content\s+type\s+paragraph\b/i.test(t);
}

function textoDeNodo(n: any, out: string[]): void {
  if (!n || typeof n !== "object") return;
  if (n.type === "text" && typeof n.text === "string") { out.push(n.text); return; }
  if (n.type === "hardBreak" || n.type === "hard_break") { out.push("\n"); return; }
  const hijos: any[] = Array.isArray(n.content) ? n.content : [];
  const esBloque = /^(paragraph|heading|listItem|list_item|blockquote|codeBlock|code_block)$/.test(String(n.type || ""));
  for (const h of hijos) textoDeNodo(h, out);
  // Un párrafo termina con línea en blanco, como en WhatsApp.
  if (esBloque) out.push("\n\n");
}

/**
 * Devuelve el texto plano. Si no era un documento de editor, devuelve lo
 * mismo que entró (como string), sin tocarlo.
 */
export function aTextoPlano(v: unknown): string {
  if (v && typeof v === "object" && pareceDocumentoDeEditor(v)) {
    const out: string[] = [];
    textoDeNodo(v, out);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  }
  const t = String(v ?? "");
  if (!pareceDocumentoDeEditor(t)) return t;
  // JSON serializado dentro del string.
  try {
    const i = t.indexOf("{"); const j = t.lastIndexOf("}");
    if (i >= 0 && j > i) {
      const doc = JSON.parse(t.slice(i, j + 1));
      if (pareceDocumentoDeEditor(doc)) return aTextoPlano(doc);
    }
  } catch { /* no era JSON válido: se limpia el volcado aplanado */ }
  // Volcado aplanado: se quitan las claves conocidas y quedan las palabras del texto.
  return t
    .replace(/\b(type|doc|content|paragraph|attrs|align|indent|null|text|hardBreak|heading|level|marks|bold|italic)\b/g, " ")
    .replace(/[{}\[\]":,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
