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

/**
 * <video> sin ninguna fuente real: el modelo arma la sección "Míralo en
 * acción" con `<source src="">` y de póster la foto de la portada. Es una
 * foto repetida más y un reproductor que no reproduce nada (landing 21).
 */
function videosVacios(html: string): { html: string; quitado: string[] } {
  const sobran: Array<{ desde: number; hasta: number }> = [];
  for (const v of bloques(html, "video")) {
    const tag = html.slice(v.desde, v.hasta);
    const fuentes = [...tag.matchAll(/\bsrc=["']([^"']*)["']/gi)].map((m) => m[1].trim()).filter((s) => s && !/^data:/i.test(s));
    // El poster no es una fuente.
    const poster = tag.match(/\bposter=["']([^"']*)["']/i)?.[1]?.trim();
    const reales = fuentes.filter((s) => s !== poster);
    if (!reales.length) sobran.push(v);
  }
  if (!sobran.length) return { html, quitado: [] };
  // Se quita la <section> que lo contiene si es solo el video; si no, el video.
  const rangos = sobran.map((v) => {
    const sec = bloques(html, "section").find((s) => s.desde <= v.desde && s.hasta >= v.hasta);
    if (sec && textoVisible(sec.interior).length < 120) return sec;
    return v;
  });
  return { html: quitarRangos(html, rangos), quitado: [`${sobran.length} video(s) sin fuente`] };
}

export function sanearHtmlDeLanding(html: string): ResultadoSaneado {
  if (!html || typeof html !== "string") return { html: html || "", quitado: [] };
  const quitado: string[] = [];
  let actual = html;
  for (const paso of [ultimoDocumento, formulariosRepetidos, seccionesRepetidas, videosVacios, imagenesRepetidas]) {
    const r = paso(actual);
    actual = r.html;
    quitado.push(...r.quitado);
  }
  actual = sinContenedoresVacios(actual);
  return { html: actual, quitado };
}

// ─── Contenedores vacíos y garantías sin definir ─────────────────────────────

/**
 * Al quitar una foto repetida queda su `<figure>` o `<div class="media">`
 * vacío: un hueco en la galería (landing 8, 19-09). Se quitan los
 * contenedores de imagen que quedaron sin nada adentro.
 */
export function sinContenedoresVacios(html: string): string {
  let out = String(html || "");
  for (let i = 0; i < 3; i++) {
    out = out
      .replace(/<figure\b[^>]*>\s*<\/figure>/gi, "")
      .replace(/<div\b[^>]*class=["'][^"']*\b(?:media|img|image|foto|gallery-item|hero-img|problem-img)\b[^"']*["'][^>]*>\s*<\/div>/gi, "");
  }
  return out;
}

const MENCIONA_GARANTIA = /garant[ií]a|devoluci[oó]n|reembolso|te devolvemos|satisfacci[oó]n garantizada/i;

/**
 * Cuando el negocio NO tiene garantía cargada, ninguna promesa de garantía
 * puede salir en la página: se quitan los chips, ítems de lista y párrafos
 * cortos que la mencionan (medido 19-09: "↩️ Garantía de devolución" en el
 * hero, inventado). Los títulos y párrafos largos no se tocan: se prefiere
 * dejar una frase a romper una sección.
 */
export function sinGarantiaInventada(html: string): { html: string; quitado: string[] } {
  let n = 0;
  const out = String(html || "").replace(
    /<(li|span|p|div)\b([^>]*)>([^<]{0,160}?)<\/\1>/gi,
    (todo, tag, attrs, texto) => {
      if (!MENCIONA_GARANTIA.test(texto)) return todo;
      // Solo elementos "hoja" cortos: chips, viñetas, notas.
      if (tag === "div" && !/chip|badge|pill|tag|note|nota/i.test(attrs)) return todo;
      n++;
      return "";
    },
  );
  return { html: n ? sinContenedoresVacios(out) : out, quitado: n ? [`${n} promesa(s) de garantía sin definir`] : [] };
}

// ─── Formulario de pedido con respuesta ──────────────────────────────────────

/**
 * El formulario que escribe el modelo es un POST plano: al enviarlo el
 * navegador navega al endpoint y el cliente no ve nada. Este script (que se
 * inyecta al servir cualquier landing con formulario de pedido) bloquea el
 * botón, muestra "Registrando…", manda el pedido por fetch y pinta la
 * confirmación en la misma página. Si JS falla, el POST plano sigue
 * funcionando y el servidor contesta una página de confirmación.
 */
export const SCRIPT_FORMULARIO_DE_PEDIDO = `<script>(function(){
  var forms = document.querySelectorAll('form[action*="/pedido"]');
  Array.prototype.forEach.call(forms, function (f) {
    if (f.__vp) return; f.__vp = true;
    var enviando = false;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enviando) return;
      enviando = true;
      var btn = f.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
      var txt = btn ? (btn.tagName === 'INPUT' ? btn.value : btn.textContent) : '';
      if (btn) { btn.disabled = true; if (btn.tagName === 'INPUT') btn.value = 'Registrando tu pedido…'; else btn.textContent = 'Registrando tu pedido…'; }
      var d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      fetch(f.action, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) {
          if (x.ok && x.j && x.j.ok) {
            if (x.j.gracias) { window.location.href = x.j.gracias; return; }
            f.innerHTML = '<div style="text-align:center;padding:28px 12px"><div style="font-size:44px">✅</div><h3 style="margin:8px 0">¡Felicidades! Tu pedido quedó registrado</h3><p style="color:#555">Pronto estaremos en contacto para confirmar la entrega.</p><p style="font-weight:700">Pedido #' + (x.j.pedidoId || '') + '</p></div>';
          } else {
            throw new Error((x.j && x.j.error) || 'No se pudo registrar el pedido');
          }
        })
        .catch(function (err) {
          enviando = false;
          if (btn) { btn.disabled = false; if (btn.tagName === 'INPUT') btn.value = txt; else btn.textContent = txt; }
          var p = f.querySelector('.vp-error');
          if (!p) { p = document.createElement('p'); p.className = 'vp-error'; p.style.cssText = 'color:#B91C1C;font-weight:600;margin-top:10px'; f.appendChild(p); }
          p.textContent = err.message || 'No se pudo registrar el pedido';
        });
    });
  });
})();</script>`;

/** Inyecta el script una sola vez, antes de </body>, solo si hay formulario de pedido. */
export function conFormularioQueResponde(html: string): string {
  const h = String(html || "");
  if (!/<form\b[^>]*action=["'][^"']*\/pedido["']/i.test(h)) return h;
  if (h.includes("f.__vp")) return h;
  return /<\/body>/i.test(h) ? h.replace(/<\/body>/i, `${SCRIPT_FORMULARIO_DE_PEDIDO}</body>`) : h + SCRIPT_FORMULARIO_DE_PEDIDO;
}

// ─── Iconos SVG seguros (topbar / announcement bar) ─────────────────────────

/**
 * Caso real (02-10-2026, /l/ab-roller-fitness-wheel-mur2rjh6): la landing
 * guardada por OpenCode trae `<div class="topbar">` con 3 <svg> SIN width ni
 * height y SIN regla CSS que los limite (solo había regla para
 * `.trust span svg`). El SVG por defecto mide 300×150 y se desborda justo
 * ANTES del header. En local (renderer-v3) no se ve porque el renderer no
 * usa topbar: solo afecta al HTML guardado que sirve la nube.
 *
 * No se puede confiar en que el modelo lo escriba bien: se normaliza al
 * servir. Reglas conservadoras (ante la duda, no se toca):
 *   1. Si hay <svg> sin width/height dentro de topbar/ann-bar, se les pone
 *      width="15" height="15" + aria-hidden.
 *   2. Se inyecta un <style> que limita TODOS los svg del topbar/ann-bar a
 *      15px, con flex y overflow controlados, una sola vez.
 */
const CSS_ICONOS_SEGUROS = `<style id="vp-iconos-seguros">.topbar{overflow:hidden}.topbar-in{display:flex;justify-content:center;gap:8px 26px;flex-wrap:wrap;text-align:center;align-items:center}.topbar-in span{display:inline-flex;align-items:center;gap:7px;min-width:0;max-width:100%;white-space:normal}.topbar svg,.ann-bar svg,[class*="announce"] svg{width:15px!important;height:15px!important;flex:none;flex-shrink:0}svg:not([width]):not([height]){max-width:24px;max-height:24px}</style>`;

export function conIconosSeguros(html: string): string {
  let h = String(html || "");
  if (!h) return h;
  // 1. SVGs sin tamaño dentro del topbar/ann-bar → 15px.
  h = h.replace(/<svg\b([^>]*?)>/gi, (todo, attrs) => {
    if (/width\s*=/i.test(attrs) && /height\s*=/i.test(attrs)) return todo;
    // Solo se tocan los que están en una barra superior; el resto lo cubre el CSS.
    return `<svg${attrs} width="15" height="15" aria-hidden="true">`;
  });
  // 2. CSS de contención, una sola vez.
  if (!h.includes("vp-iconos-seguros")) {
    if (/<\/head>/i.test(h)) h = h.replace(/<\/head>/i, `${CSS_ICONOS_SEGUROS}</head>`);
    else if (/<\/body>/i.test(h)) h = h.replace(/<\/body>/i, `${CSS_ICONOS_SEGUROS}</body>`);
    else h += CSS_ICONOS_SEGUROS;
  }
  return h;
}
