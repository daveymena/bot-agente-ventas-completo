/**
 * Control EXACTO del Studio para Atlas: lo mismo que el dueño hace con la
 * mano (mover un bloque, ocultarlo, cambiar un texto, mover una capa de un
 * creativo), sin pasar por el modelo.
 *
 * `landing_editar` sigue existiendo para pedidos en lenguaje natural ("hacé el
 * hero más agresivo"), pero ahí un modelo decide las operaciones y a veces
 * entiende otra cosa. Cuando Atlas ya sabe QUÉ tocar (bloque X, capa Y), usa
 * estas operaciones: cada una se puede probar y hace exactamente lo pedido.
 *
 * Módulo PURO.
 */
import { normalizarEscena, type Capa, type Escena } from "./escena";
import { esFuenteValida } from "./fuentes";
import { normalizarHex } from "./retoque";

// ── Bloques de una landing ──────────────────────────────────────────────────

export type OpBloque =
  | { op: "mover"; id: string; a: "arriba" | "abajo" | number }
  | { op: "ocultar" | "mostrar" | "duplicar" | "quitar"; id: string }
  | { op: "texto"; id: string; campo: "title" | "subtitle" | "body" | "cta"; valor: string }
  | { op: "foto"; id: string; url: string | null };

type Seccion = { id: string; type: string; [k: string]: unknown };

export function operarBloque(seccionesCrudas: unknown, o: OpBloque): { ok: true; secciones: Seccion[]; hecho: string } | { ok: false; error: string } {
  const secciones: Seccion[] = (Array.isArray(seccionesCrudas) ? seccionesCrudas : []).filter(Boolean).map((s: any, i) => ({ ...s, id: String(s.id || `${s.type || "sec"}-${i}`) }));
  const i = secciones.findIndex((s) => s.id === o.id);
  if (i < 0) return { ok: false, error: `No hay un bloque con id "${o.id}". Los que hay: ${secciones.map((s) => `${s.id} (${s.type})`).join(", ")}.` };
  const s = secciones[i]!;
  const copia = [...secciones];
  switch (o.op) {
    case "mover": {
      if (s.type === "hero") return { ok: false, error: "La portada va siempre arriba." };
      const destino = o.a === "arriba" ? i - 1 : o.a === "abajo" ? i + 1 : Math.round(Number(o.a));
      if (!Number.isFinite(destino) || destino < 0 || destino >= copia.length) return { ok: false, error: `No se puede mover a la posición ${o.a}.` };
      if (copia[destino]?.type === "hero") return { ok: false, error: "No puede ir antes de la portada." };
      copia.splice(i, 1);
      copia.splice(destino, 0, s);
      return { ok: true, secciones: copia, hecho: `bloque ${s.id} movido a la posición ${destino + 1}` };
    }
    case "ocultar":
    case "mostrar":
      copia[i] = { ...s, hidden: o.op === "ocultar" };
      return { ok: true, secciones: copia, hecho: `bloque ${s.id} ${o.op === "ocultar" ? "oculto" : "visible"}` };
    case "duplicar": {
      let n = 2; while (copia.some((x) => x.id === `${s.id}-${n}`)) n++;
      copia.splice(i + 1, 0, { ...s, id: `${s.id}-${n}` });
      return { ok: true, secciones: copia, hecho: `bloque ${s.id} duplicado como ${s.id}-${n}` };
    }
    case "quitar":
      if (s.type === "hero") return { ok: false, error: "La portada no se quita: sin ella no hay página. Se puede editar." };
      copia.splice(i, 1);
      return { ok: true, secciones: copia, hecho: `bloque ${s.id} quitado` };
    case "texto": {
      const valor = String(o.valor ?? "").replace(/<[^>]*>/g, "").trim().slice(0, o.campo === "body" ? 3000 : 300);
      if (!["title", "subtitle", "body", "cta"].includes(o.campo)) return { ok: false, error: `Campo inválido: ${o.campo}.` };
      copia[i] = { ...s, [o.campo]: valor };
      return { ok: true, secciones: copia, hecho: `${o.campo} del bloque ${s.id} cambiado` };
    }
    case "foto": {
      const url = o.url ? String(o.url).trim() : null;
      if (url && !/^https?:\/\//i.test(url) && !url.startsWith("/uploads/")) return { ok: false, error: "La foto tiene que ser una URL http(s) o una subida (/uploads/...)." };
      copia[i] = { ...s, image: url };
      return { ok: true, secciones: copia, hecho: url ? `foto del bloque ${s.id} cambiada` : `foto del bloque ${s.id} en automático` };
    }
  }
  return { ok: false, error: "Operación desconocida." };
}

/** Resumen legible de los bloques (para que Atlas "vea" la página). */
export function resumenDeBloques(seccionesCrudas: unknown): string {
  const secciones = (Array.isArray(seccionesCrudas) ? seccionesCrudas : []).filter(Boolean) as any[];
  if (!secciones.length) return "(sin bloques)";
  return secciones.map((s, i) => {
    const corto = (v: unknown, n: number) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
    const partes = [`${i + 1}. [${s.id || `${s.type}-${i}`}] ${s.type}${s.hidden ? " (OCULTO)" : ""}`];
    if (s.title) partes.push(`título: "${corto(s.title, 90)}"`);
    if (s.subtitle) partes.push(`subtítulo: "${corto(s.subtitle, 90)}"`);
    if (s.body) partes.push(`texto: "${corto(s.body, 140)}"`);
    if (s.cta) partes.push(`botón: "${corto(s.cta, 40)}"`);
    if (s.image) partes.push(`foto: ${corto(s.image, 80)}`);
    return partes.join(" · ");
  }).join("\n");
}

// ── Capas de un creativo ────────────────────────────────────────────────────

export interface OpCapa {
  op: "cambiar" | "ocultar" | "mostrar" | "borrar" | "traer-adelante" | "llevar-atras" | "duplicar";
  id: string;
  /** Para "cambiar": solo lo que cambia. */
  cambios?: Partial<{
    texto: string; color: string; fondo: string | null; fuente: string; tam: number; peso: number;
    x: number; y: number; w: number; h: number; rot: number; opacidad: number; alinear: "left" | "center" | "right";
    mayus: boolean; sombra: boolean; relleno: string; src: string; ajuste: "cover" | "contain";
  }>;
}

export function operarCapa(escenaCruda: unknown, o: OpCapa): { ok: true; escena: Escena; hecho: string } | { ok: false; error: string } {
  const e = normalizarEscena(escenaCruda);
  const i = e.capas.findIndex((c) => c.id === o.id || (c.nombre || "").toLowerCase() === String(o.id).toLowerCase());
  if (i < 0) return { ok: false, error: `No hay una capa "${o.id}". Las que hay: ${e.capas.map((c) => `${c.id} (${c.nombre || c.tipo})`).join(", ")}.` };
  const c = e.capas[i]!;
  const capas = [...e.capas];
  switch (o.op) {
    case "ocultar": case "mostrar":
      capas[i] = { ...c, oculta: o.op === "ocultar" } as Capa;
      return { ok: true, escena: normalizarEscena({ ...e, capas }), hecho: `capa ${c.nombre || c.id} ${o.op === "ocultar" ? "oculta" : "visible"}` };
    case "borrar":
      capas.splice(i, 1);
      return { ok: true, escena: normalizarEscena({ ...e, capas }), hecho: `capa ${c.nombre || c.id} borrada` };
    case "traer-adelante": case "llevar-atras": {
      const j = o.op === "traer-adelante" ? i + 1 : i - 1;
      if (j < 0 || j >= capas.length) return { ok: false, error: "Ya está en el extremo." };
      [capas[i], capas[j]] = [capas[j]!, capas[i]!];
      return { ok: true, escena: normalizarEscena({ ...e, capas }), hecho: `capa ${c.nombre || c.id} ${o.op === "traer-adelante" ? "adelante" : "atrás"}` };
    }
    case "duplicar": {
      const nueva = { ...c, id: `${c.id}-copia`, x: c.x + 2, y: c.y + 2, nombre: `${c.nombre || c.tipo} (copia)` } as Capa;
      capas.splice(i + 1, 0, nueva);
      return { ok: true, escena: normalizarEscena({ ...e, capas }), hecho: `capa ${c.nombre || c.id} duplicada` };
    }
    case "cambiar": {
      const k = o.cambios || {};
      const patch: Record<string, unknown> = {};
      for (const campo of ["x", "y", "w", "h", "rot", "opacidad", "tam", "peso"] as const) if (k[campo] !== undefined && Number.isFinite(Number(k[campo]))) patch[campo] = Number(k[campo]);
      for (const campo of ["color", "relleno"] as const) if (k[campo] !== undefined) { const h = normalizarHex(k[campo]); if (!h) return { ok: false, error: `Color inválido en ${campo}: ${k[campo]} (usá #RRGGBB).` }; patch[campo] = h; }
      if (k.fondo !== undefined) patch.fondo = k.fondo === null ? null : normalizarHex(k.fondo);
      if (k.fuente !== undefined) { if (!esFuenteValida(k.fuente)) return { ok: false, error: `Fuente inválida: ${k.fuente}.` }; patch.fuente = k.fuente; }
      if (k.texto !== undefined) { if (c.tipo !== "texto") return { ok: false, error: "Esa capa no es de texto." }; patch.texto = String(k.texto).slice(0, 600); }
      if (k.src !== undefined) { if (c.tipo !== "imagen") return { ok: false, error: "Esa capa no es una foto." }; patch.src = String(k.src); }
      for (const campo of ["alinear", "ajuste", "mayus", "sombra"] as const) if (k[campo] !== undefined) patch[campo] = k[campo];
      if (!Object.keys(patch).length) return { ok: false, error: "No vino ningún cambio válido." };
      capas[i] = { ...c, ...patch } as Capa;
      const escena = normalizarEscena({ ...e, capas });
      // normalizarEscena descarta una foto con src inválido: se avisa en vez de perder la capa.
      if (!escena.capas.some((x) => x.id === c.id)) return { ok: false, error: "El cambio dejaba la capa inválida (¿URL de foto mala?)." };
      return { ok: true, escena, hecho: `capa ${c.nombre || c.id}: ${Object.keys(patch).join(", ")}` };
    }
  }
  return { ok: false, error: "Operación desconocida." };
}

/** Las capas en texto, de atrás hacia adelante (para que Atlas "vea" el creativo). */
export function resumenDeCapas(escenaCruda: unknown): string {
  const e = normalizarEscena(escenaCruda);
  return `Formato ${e.formato}, fondo ${e.fondo}. Capas (de atrás hacia adelante):\n` + e.capas.map((c, i) => {
    const pos = `x${c.x.toFixed(0)} y${c.y.toFixed(0)} ${c.w.toFixed(0)}×${c.h.toFixed(0)}%`;
    const extra = c.tipo === "texto" ? `"${c.texto.slice(0, 60)}" ${c.fuente} ${c.tam}% ${c.color}${c.fondo ? ` sobre ${c.fondo}` : ""}`
      : c.tipo === "imagen" ? `foto ${c.src.slice(0, 60)} (${c.ajuste})`
      : c.tipo === "forma" ? `${c.forma} ${c.relleno}` : `degradado ${c.desde}→${c.hasta}`;
    return `${i + 1}. [${c.id}] ${c.nombre || c.tipo}${c.oculta ? " (OCULTA)" : ""} · ${pos} · ${extra}`;
  }).join("\n");
}
