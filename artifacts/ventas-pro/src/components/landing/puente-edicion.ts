/**
 * Edición directa sobre la vista previa de la landing.
 *
 * La página la arman tres motores distintos (renderer-v3, renderer-estilo y
 * las copias HTML) y ninguno marca qué elemento salió de qué sección. En vez
 * de tocar los tres, acá se hace lo que haría alguien mirando la página: se
 * busca en el documento el elemento cuyo texto ES el título, subtítulo o
 * botón de cada sección, y se lo marca (`data-vp-sec`, `data-vp-campo`). Su
 * contenedor queda como el bloque clickeable (`data-vp-bloque`).
 *
 * Así funciona con cualquier motor presente o futuro, y lo que se edita es
 * el JSON de secciones (la fuente de verdad), no el HTML: al guardar, el
 * servidor vuelve a armar la página y la publicada sale igual.
 */
export type CampoEditable = "title" | "subtitle" | "cta";
const CAMPOS: CampoEditable[] = ["title", "subtitle", "cta"];

export interface SeccionMarcable { id: string; hidden?: boolean | null; title?: unknown; subtitle?: unknown; cta?: unknown }

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[…]+$/, "").trim();

const ESTILO = `
[data-vp-bloque]{cursor:pointer;transition:outline-color .15s}
[data-vp-bloque]:hover{outline:2px dashed rgba(124,58,237,.6);outline-offset:-3px}
[data-vp-sel]{outline:3px solid #7c3aed!important;outline-offset:-3px}
[data-vp-campo]{cursor:text;border-radius:4px}
[data-vp-campo]:hover{box-shadow:0 0 0 2px rgba(124,58,237,.35)}
[data-vp-campo][contenteditable]{outline:2px solid #f59e0b!important;background:rgba(245,158,11,.10);cursor:text}
`;

/** Marca en el documento los elementos que son texto de alguna sección. */
export function etiquetar(doc: Document, secciones: SeccionMarcable[]): number {
  doc.querySelectorAll("[data-vp-sec],[data-vp-bloque]").forEach((el) => {
    el.removeAttribute("data-vp-sec"); el.removeAttribute("data-vp-campo"); el.removeAttribute("data-vp-bloque");
  });
  const candidatos = Array.from(doc.body?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,p,a,button,span,strong,em,summary,li,div,label") || []);
  // Texto normalizado de cada candidato, una sola vez.
  const textos = new Map<HTMLElement, string>();
  for (const el of candidatos) textos.set(el, norm(el.textContent));
  let marcados = 0;
  for (const s of secciones) {
    if (s.hidden) continue;
    for (const campo of CAMPOS) {
      const v = norm(s[campo]);
      if (v.length < 2) continue;
      // El más profundo que coincide (no el <div> que lo envuelve).
      const exactos = candidatos.filter((el) => !el.dataset.vpSec && textos.get(el) === v && !Array.from(el.children).some((h) => norm(h.textContent) === v));
      // Los renderers recortan textos largos ("…"): se acepta el comienzo.
      const lista = exactos.length ? exactos : v.length > 28
        ? candidatos.filter((el) => { const t = textos.get(el) || ""; return !el.dataset.vpSec && t.length >= 20 && t.length <= v.length + 2 && v.startsWith(t.slice(0, Math.min(t.length, 40))) && !Array.from(el.children).some((h) => (textos.get(h as HTMLElement) || norm(h.textContent)) === t); })
        : [];
      for (const el of lista) {
        el.dataset.vpSec = s.id;
        el.dataset.vpCampo = campo;
        marcados++;
        const bloque = el.closest<HTMLElement>("section,header,.hero,[data-bloque]") || el.parentElement;
        if (bloque && !bloque.dataset.vpBloque && bloque !== doc.body) bloque.dataset.vpBloque = s.id;
      }
    }
  }
  return marcados;
}

export interface Manejadores {
  onSeleccionar: (id: string) => void;
  onEditar: (id: string, campo: CampoEditable, valor: string) => void;
}

/** Conecta la edición directa. Devuelve la función que la desconecta. */
export function conectarEdicion(doc: Document, secciones: SeccionMarcable[], m: Manejadores): () => void {
  if (!doc?.body) return () => {};
  let estilo = doc.getElementById("vp-editor-estilo");
  if (!estilo) {
    estilo = doc.createElement("style");
    estilo.id = "vp-editor-estilo";
    estilo.textContent = ESTILO;
    doc.head?.appendChild(estilo);
  }
  etiquetar(doc, secciones);

  const editando = { el: null as HTMLElement | null, antes: "" };
  const terminar = (guardar: boolean) => {
    const el = editando.el;
    if (!el) return;
    editando.el = null;
    el.removeAttribute("contenteditable");
    const valor = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (!guardar || !valor) { el.textContent = editando.antes; return; }
    if (valor !== editando.antes.trim() && el.dataset.vpSec && el.dataset.vpCampo) {
      m.onEditar(el.dataset.vpSec, el.dataset.vpCampo as CampoEditable, valor);
    }
  };

  const alClic = (e: MouseEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (editando.el && editando.el.contains(t)) return;
    // En el editor, un botón o enlace de la página no navega: se selecciona.
    if (t.closest("a,button,form,summary")) e.preventDefault();
    const bloque = t.closest<HTMLElement>("[data-vp-bloque]");
    if (bloque?.dataset.vpBloque) m.onSeleccionar(bloque.dataset.vpBloque);
  };
  const alDobleClic = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-vp-campo]");
    if (!el) return;
    e.preventDefault();
    terminar(true);
    editando.el = el;
    editando.antes = el.textContent || "";
    try { el.setAttribute("contenteditable", "plaintext-only"); } catch { el.setAttribute("contenteditable", "true"); }
    if (el.getAttribute("contenteditable") !== "plaintext-only") el.setAttribute("contenteditable", "true");
    el.focus();
    const sel = doc.getSelection();
    const rango = doc.createRange();
    rango.selectNodeContents(el);
    sel?.removeAllRanges(); sel?.addRange(rango);
    if (el.dataset.vpSec) m.onSeleccionar(el.dataset.vpSec);
  };
  const alTecla = (e: KeyboardEvent) => {
    if (!editando.el) return;
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); terminar(true); }
    if (e.key === "Escape") { e.preventDefault(); terminar(false); }
  };
  const alSalir = (e: FocusEvent) => { if (editando.el && e.target === editando.el) terminar(true); };
  const alEnviar = (e: Event) => e.preventDefault();

  doc.addEventListener("click", alClic, true);
  doc.addEventListener("dblclick", alDobleClic, true);
  doc.addEventListener("keydown", alTecla, true);
  doc.addEventListener("focusout", alSalir, true);
  doc.addEventListener("submit", alEnviar, true);
  return () => {
    doc.removeEventListener("click", alClic, true);
    doc.removeEventListener("dblclick", alDobleClic, true);
    doc.removeEventListener("keydown", alTecla, true);
    doc.removeEventListener("focusout", alSalir, true);
    doc.removeEventListener("submit", alEnviar, true);
  };
}

/** Refleja en la vista previa un texto cambiado desde el panel, sin recargar. */
export function reflejarTexto(doc: Document | null | undefined, id: string, campo: CampoEditable, valor: string) {
  doc?.querySelectorAll<HTMLElement>(`[data-vp-sec="${CSS.escape(id)}"][data-vp-campo="${campo}"]`).forEach((el) => {
    if (!el.hasAttribute("contenteditable")) el.textContent = valor;
  });
}

/** Resalta el bloque elegido y, si se pide, lo trae a la vista. */
export function marcarSeleccion(doc: Document | null | undefined, id: string | null, desplazar = false) {
  if (!doc) return;
  doc.querySelectorAll("[data-vp-sel]").forEach((el) => el.removeAttribute("data-vp-sel"));
  if (!id) return;
  const el = doc.querySelector<HTMLElement>(`[data-vp-bloque="${CSS.escape(id)}"]`);
  if (!el) return;
  el.setAttribute("data-vp-sel", "");
  if (desplazar) el.scrollIntoView({ behavior: "smooth", block: "center" });
}
