/**
 * Las MANOS de Atlas sobre una landing (23-10-2026).
 *
 * Antes Atlas editaba una landing pasándole una frase a otro modelo
 * (landing_editar) o cambiando el tema: no tenía control. Esto le da las
 * operaciones exactas del editor de bloques, sobre el JSON de secciones que
 * dibujan todos los diseños (premium, estilo y familias): cambiar, agregar,
 * mover, ocultar y borrar secciones, y cambiar el tema o el diseño entero.
 *
 * Como en los creativos: cada operación se aplica o se rechaza con su motivo,
 * las fotos son solo las del producto y ningún texto trae cifras que no
 * estén en la ficha.
 *
 * Módulo PURO.
 */
import { FAMILIAS } from "./design-system";
import { normalizarRetoque } from "../estudio/retoque";

/** Las variantes de renderer-estilo (copiadas: importarlo traería la base a este módulo puro). */
const ESTILOS = ["cleanhome", "urgencia", "clinico", "pro"] as const;

export interface SeccionLanding {
  id: string;
  type: string;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  cta?: string | null;
  image?: string | null;
  images?: string[] | null;
  hidden?: boolean | null;
  [k: string]: unknown;
}

export interface LandingEditable { sections: SeccionLanding[]; design: Record<string, any> }

export interface ReglasLanding {
  fotosPermitidas: string[];
  inventaCifras?: (texto: string) => boolean;
}

/** Los tipos que los diseños saben dibujar (los del editor de bloques). */
export const TIPOS_DE_SECCION = ["hero", "benefits", "features", "problem", "solution", "how-it-works", "steps", "offer", "gallery", "photo-band", "logistics", "guarantee", "testimonials", "faq", "cta", "comparison"] as const;

const CAMPOS = ["title", "subtitle", "body", "cta", "image", "images", "hidden"] as const;

function buscar(secciones: SeccionLanding[], ref: unknown): number {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return -1;
  const i = secciones.findIndex((s) => String(s.id).toLowerCase() === r);
  return i >= 0 ? i : secciones.findIndex((s) => String(s.type).toLowerCase() === r);
}

const nombre = (s: SeccionLanding) => `${s.type}${s.title ? ` "${String(s.title).slice(0, 30)}"` : ""}`;
let n = 0;
const idNuevo = (tipo: string) => `${tipo.replace(/[^a-z]/g, "").slice(0, 8) || "sec"}-${Date.now().toString(36)}${(n = (n + 1) % 1000).toString(36)}`;

function fotoValida(src: unknown, reglas: ReglasLanding): boolean {
  const s = String(src ?? "").trim();
  if (!s) return true; // quitar la foto siempre se puede
  if (s.startsWith("/uploads/") || s.startsWith("/images/products/")) return true;
  const sinQuery = (u: string) => u.split(/[?#]/)[0];
  return reglas.fotosPermitidas.some((f) => f === s || sinQuery(f) === sinQuery(s));
}

/** El motivo por el que estos campos no se pueden poner, o null. */
function motivo(campos: Record<string, unknown>, reglas: ReglasLanding): string | null {
  const fotos = [campos.image, ...(Array.isArray(campos.images) ? campos.images : [])].filter((x) => x !== undefined && x !== null);
  if (fotos.some((f) => !fotoValida(f, reglas))) return "solo se pueden usar las fotos del producto (landing_ver las lista)";
  for (const k of ["title", "subtitle", "body", "cta"]) {
    const t = campos[k];
    if (typeof t === "string" && reglas.inventaCifras?.(t)) return `"${t.slice(0, 40)}" trae una cifra, precio o porcentaje que no está en la ficha`;
  }
  return null;
}

function limpiarCampos(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CAMPOS) {
    if (!(k in props)) continue;
    const v = props[k];
    if (k === "hidden") out[k] = !!v;
    else if (k === "images") out[k] = Array.isArray(v) ? v.map(String).slice(0, 12) : [];
    else out[k] = v === null ? null : String(v ?? "").slice(0, k === "body" ? 2000 : 240);
  }
  return out;
}

/**
 * "premium-ventaspro", "estilo:urgencia" o una familia v3 → el design que lo
 * dibuja. Ojo: "premium" a secas es la FAMILIA v3 "Premium" (existía antes);
 * el diseño Premium VentasPro es "premium-ventaspro" (o "vp:premium").
 */
export function disenoDesdeNombre(nombreDiseno: unknown, previo: Record<string, any>): Record<string, any> | null {
  const d = String(nombreDiseno ?? "").trim().toLowerCase();
  if (d === "premium-ventaspro" || d === "vp:premium") return { ...previo, renderer: "premium", familia: null, style: null };
  if (d.startsWith("estilo:") && (ESTILOS as readonly string[]).includes(d.slice(7))) return { ...previo, renderer: "estilo", style: d.slice(7), familia: null };
  if ((FAMILIAS as readonly string[]).includes(d)) return { ...previo, renderer: null, style: null, familia: d };
  return null;
}

export function aplicarOperacionesLanding(entrada: LandingEditable, operaciones: unknown, reglas: ReglasLanding): { landing: LandingEditable; aplicadas: string[]; rechazadas: string[] } {
  const secciones: SeccionLanding[] = (entrada.sections || []).filter(Boolean).map((s, i) => ({ ...s, id: String(s.id || `${s.type || "sec"}-${i}`) }));
  let design: Record<string, any> = { ...(entrada.design || {}) };
  const aplicadas: string[] = [];
  const rechazadas: string[] = [];
  const lista = Array.isArray(operaciones) ? operaciones.slice(0, 40) : [];
  if (!lista.length) rechazadas.push("no llegó ninguna operación");

  for (const raw of lista) {
    const o = (raw && typeof raw === "object" ? raw : {}) as any;
    const op = String(o.op || "").toLowerCase();
    if (op === "seccion_cambiar") {
      const i = buscar(secciones, o.seccion);
      if (i < 0) { rechazadas.push(`seccion_cambiar: no existe "${o.seccion}"`); continue; }
      const campos = limpiarCampos(o.props || {});
      if (!Object.keys(campos).length) { rechazadas.push(`seccion_cambiar ${nombre(secciones[i]!)}: sin campos válidos (${CAMPOS.join(", ")})`); continue; }
      const m = motivo(campos, reglas);
      if (m) { rechazadas.push(`seccion_cambiar ${nombre(secciones[i]!)}: ${m}`); continue; }
      secciones[i] = { ...secciones[i]!, ...campos };
      aplicadas.push(`${nombre(secciones[i]!)}: ${Object.keys(campos).join(", ")}`);
    } else if (op === "seccion_agregar") {
      const tipo = String(o.tipo || "").toLowerCase();
      if (!(TIPOS_DE_SECCION as readonly string[]).includes(tipo)) { rechazadas.push(`seccion_agregar: tipo "${o.tipo}" no existe (${TIPOS_DE_SECCION.join(", ")})`); continue; }
      if (tipo === "testimonials" || tipo === "guarantee") {
        // Testimonios y garantía SOLO del dueño: los diseños los toman de la ficha.
        rechazadas.push(`seccion_agregar ${tipo}: salen de lo que el dueño cargó en la ficha, no se escriben`);
        continue;
      }
      const campos = limpiarCampos(o);
      const m = motivo(campos, reglas);
      if (m) { rechazadas.push(`seccion_agregar ${tipo}: ${m}`); continue; }
      const nueva: SeccionLanding = { id: idNuevo(tipo), type: tipo, ...campos };
      const j = o.despuesDe ? buscar(secciones, o.despuesDe) : -1;
      if (j >= 0) secciones.splice(j + 1, 0, nueva); else secciones.push(nueva);
      aplicadas.push(`agregada ${nombre(nueva)} [${nueva.id}]`);
    } else if (op === "seccion_mover") {
      const i = buscar(secciones, o.seccion);
      if (i < 0) { rechazadas.push(`seccion_mover: no existe "${o.seccion}"`); continue; }
      const [s] = secciones.splice(i, 1);
      const destino = typeof o.a === "number" ? Math.max(0, Math.min(secciones.length, Math.round(o.a)))
        : o.a === "inicio" ? 0 : o.a === "final" ? secciones.length : o.a === "arriba" ? Math.max(0, i - 1) : Math.min(secciones.length, i + 1);
      secciones.splice(destino, 0, s!);
      aplicadas.push(`${nombre(s!)} → posición ${destino + 1}`);
    } else if (op === "seccion_borrar") {
      const i = buscar(secciones, o.seccion);
      if (i < 0) { rechazadas.push(`seccion_borrar: no existe "${o.seccion}"`); continue; }
      const [s] = secciones.splice(i, 1);
      aplicadas.push(`borrada ${nombre(s!)}`);
    } else if (op === "tema") {
      if (o.quitar) { design = { ...design, retoque: null }; aplicadas.push("tema quitado"); continue; }
      const t = normalizarRetoque({ ...(design.retoque || {}), ...o });
      if (!t) { rechazadas.push("tema: nada válido (acento #RRGGBB, titulos/texto con id de fuente, radio 0-40)"); continue; }
      design = { ...design, retoque: t };
      aplicadas.push(`tema ${JSON.stringify(t)}`);
    } else if (op === "diseno") {
      const nuevo = disenoDesdeNombre(o.diseno, design);
      if (!nuevo) { rechazadas.push(`diseno: "${o.diseno}" no existe (premium-ventaspro, estilo:${ESTILOS.join("|estilo:")}, o una familia: ${FAMILIAS.join(", ")})`); continue; }
      design = nuevo;
      aplicadas.push(`diseño ${o.diseno}`);
    } else {
      rechazadas.push(`operación "${o.op}" no existe (seccion_cambiar, seccion_agregar, seccion_mover, seccion_borrar, tema, diseno)`);
    }
  }
  return { landing: { sections: secciones, design }, aplicadas, rechazadas };
}

/** La landing contada para un modelo: secciones en orden con id y textos. */
export function describirLanding(l: LandingEditable): string {
  const d = l.design || {};
  const disenoActual = d.renderer === "premium" ? "premium-ventaspro" : d.renderer === "estilo" ? `estilo:${d.style || "auto"}` : d.familia || "automático";
  const lineas = (l.sections || []).map((s, i) => {
    const partes = [s.title && `título "${String(s.title).slice(0, 70)}"`, s.subtitle && `subtítulo "${String(s.subtitle).slice(0, 70)}"`, s.body && `texto "${String(s.body).replace(/\n/g, " / ").slice(0, 140)}"`, s.cta && `botón "${s.cta}"`, s.image && "con foto", s.hidden && "OCULTA"].filter(Boolean);
    return `${i + 1}. [${s.id}] ${s.type}: ${partes.join(" · ") || "(vacía)"}`;
  });
  return `Diseño: ${disenoActual}${d.retoque ? ` · tema ${JSON.stringify(d.retoque)}` : ""}\nSecciones en orden:\n${lineas.join("\n") || "(sin secciones: el diseño usa los datos de la ficha)"}`;
}
