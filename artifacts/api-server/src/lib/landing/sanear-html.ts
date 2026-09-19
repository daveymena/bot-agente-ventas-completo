/**
 * Saneado del HTML que devuelve el modelo al generar o editar una landing.
 *
 * Caso real (19-09-2026, landing 4 "Corrector de Postura"): el admin pidió
 * "regenerá con formulario" y el modelo devolvió la página con la portada dos
 * veces, el formulario de pedido dos veces (mismos campos, mismo total), el
 * bloque de precio repetido y las fotos duplicadas. El prompt dice "conservá
 * todo lo demás exacto", y el modelo lo entendió como "dejá lo viejo y sumá
 * lo nuevo".
 *
 * No hay forma de prohibírselo con más prompt: se sanea a la salida. Reglas,
 * todas conservadoras (ante la duda, no se toca):
 *
 *   1. Dos documentos pegados (dos <html> o dos <body>) → se queda el último
 *      completo, que es el editado.
 *   2. Dos <form> con la misma firma de campos → se queda el primero.
 *   3. Dos <section> (o <article>) con el mismo texto visible → el primero.
 *   4. La misma imagen (mismo src) repetida fuera de header/nav/footer →
 *      queda la primera; un logo arriba y abajo no cuenta como repetición.
 */

export interface ResultadoSaneado {
  html: string;
  /** Qué se quitó, para el log y para que Atlas lo cuente. */
  quitado: string[];
}

const ESPACIOS = /\s+/g;

function textoVisible(fragmento: string): string {
  return fragmento
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(ESPACIOS, " ")
    .trim()
    .toLowerCase();
}

/** Si vienen dos documentos, el último completo es el editado. */
function ultimoDocumento(html: string): { html: string; quitado: string[] } {
  const marcas = [...html.matchAll(/<!doctype\s+html[^>]*>|<html[\s>]/gi)].map((m) => m.index ?? 0);
  // Un doctype seguido de su <html> son el mismo documento: se cuenta por <html>.
  const inicios = [...html.matchAll(/<html[\s>]/gi)].map((m) => m.index ?? 0);
  if (inicios.length < 2) return { html, quitado: [] };
  const desde = inicios[inicios.length - 1];
  // Si justo antes hay un doctype pegado a ese <html>, se conserva.
  const doctypeAntes = marcas.filter((i) => i < desde && /<!doctype/i.test(html.slice(i, i + 9))).pop();
  const inicio = doctypeAntes != null && !html.slice(doctypeAntes, desde).replace(/<!doctype[^>]*>/i, "").trim() ? doctypeAntes : desde;
  return { html: html.slice(inicio), quitado: [`${inicios.length - 1} documento(s) HTML pegado(s) antes del definitivo`] };
}

/** Bloques <tag ...>...</tag> de primer nivel para un tag dado (sin anidar el mismo tag). */
function bloques(html: string, tag: string): Array<{ desde: number; hasta: number; interior: string }> {
  const abre = new RegExp(`<${tag}(\\s[^>]*)?>`, "gi");
  const cierra = new RegExp(`</${tag}\\s*>`, "gi");
  const out: Array<{ desde: number; hasta: number; interior: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = abre.exec(html))) {
    const desde = m.index;
    cierra.lastIndex = abre.lastIndex;
    // Se busca el cierre que balancea aperturas del mismo tag.
    let nivel = 1;
    let pos = abre.lastIndex;
    const interiorAbre = new RegExp(`<${tag}(\\s[^>]*)?>|</${tag}\\s*>`, "gi");
    interiorAbre.lastIndex = pos;
    let fin = -1;
    let t: RegExpExecArray | null;
    while ((t = interiorAbre.exec(html))) {
      if (t[0].startsWith("</")) nivel--; else nivel++;
      if (nivel === 0) { fin = t.index + t[0].length; break; }
    }
    if (fin < 0) break;
    out.push({ desde, hasta: fin, interior: html.slice(abre.lastIndex, fin) });
    abre.lastIndex = fin;
  }
  return out;
}

function quitarRangos(html: string, rangos: Array<{ desde: number; hasta: number }>): string {
  const orden = [...rangos].sort((a, b) => b.desde - a.desde);
  let out = html;
  for (const r of orden) out = out.slice(0, r.desde) + out.slice(r.hasta);
  return out;
}

/** Firma de un formulario: sus campos (name=) ordenados. */
function firmaDeFormulario(interior: string): string {
  const nombres = [...interior.matchAll(/\bname=["']([^"']+)["']/gi)].map((m) => m[1].toLowerCase()).sort();
  return nombres.join("|");
}

function formulariosRepetidos(html: string): { html: string; quitado: string[] } {
  const forms = bloques(html, "form");
  const vistas = new Set<string>();
  const sobran: Array<{ desde: number; hasta: number }> = [];
  for (const f of forms) {
    const firma = firmaDeFormulario(f.interior);
    if (!firma) continue;
    if (vistas.has(firma)) sobran.push(f);
    else vistas.add(firma);
  }
  if (!sobran.length) return { html, quitado: [] };
  return { html: quitarRangos(html, sobran), quitado: [`${sobran.length} formulario(s) repetido(s)`] };
}

function seccionesRepetidas(html: string): { html: string; quitado: string[] } {
  const sobran: Array<{ desde: number; hasta: number }> = [];
  let total = 0;
  for (const tag of ["section", "article"]) {
    const vistas = new Set<string>();
    for (const s of bloques(html, tag)) {
      const texto = textoVisible(s.interior);
      // Una sección sin texto (solo imagen o solo decorativa) no se compara.
      if (texto.length < 40) continue;
      if (vistas.has(texto)) { sobran.push(s); total++; }
      else vistas.add(texto);
    }
  }
  if (!sobran.length) return { html, quitado: [] };
  // Rangos que se solapan (una sección repetida dentro de otra repetida) se
  // quitan de afuera hacia adentro sin romper: se filtran los contenidos.
  const externos = sobran.filter((r) => !sobran.some((o) => o !== r && o.desde <= r.desde && o.hasta >= r.hasta));
  return { html: quitarRangos(html, externos), quitado: [`${total} sección(es) repetida(s)`] };
}

/** ¿Este offset cae dentro de header/nav/footer? Un logo arriba y abajo es normal. */
function dentroDeMarco(html: string, offset: number): boolean {
  for (const tag of ["header", "nav", "footer"]) {
    for (const b of bloques(html, tag)) if (offset >= b.desde && offset < b.hasta) return true;
  }
  return false;
}

function imagenesRepetidas(html: string): { html: string; quitado: string[] } {
  const vistas = new Set<string>();
  const sobran: Array<{ desde: number; hasta: number }> = [];
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = (m[0].match(/\bsrc=["']([^"']+)["']/i)?.[1] || "").trim();
    if (!src || src.startsWith("data:")) continue;
    const i = m.index ?? 0;
    if (dentroDeMarco(html, i)) continue;
    if (vistas.has(src)) sobran.push({ desde: i, hasta: i + m[0].length });
    else vistas.add(src);
  }
  if (!sobran.length) return { html, quitado: [] };
  return { html: quitarRangos(html, sobran), quitado: [`${sobran.length} imagen(es) repetida(s)`] };
}

export function sanearHtmlDeLanding(html: string): ResultadoSaneado {
  if (!html || typeof html !== "string") return { html: html || "", quitado: [] };
  const quitado: string[] = [];
  let actual = html;
  for (const paso of [ultimoDocumento, formulariosRepetidos, seccionesRepetidas, imagenesRepetidas]) {
    const r = paso(actual);
    actual = r.html;
    quitado.push(...r.quitado);
  }
  return { html: actual, quitado };
}
