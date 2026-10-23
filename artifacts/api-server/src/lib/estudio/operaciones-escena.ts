/**
 * Las MANOS de Atlas sobre un creativo (23-10-2026).
 *
 * Hasta acá Atlas solo podía elegir una maqueta y cambiar tres textos: no
 * diseñaba. Esto le da las mismas operaciones que el dueño tiene en el
 * editor de /creativos, sobre la misma escena JSON (escena.ts): agregar,
 * cambiar, mover, alinear, duplicar, ordenar y borrar capas, y cambiar el
 * fondo o el formato. Un creativo hecho así se sigue editando a mano.
 *
 * Cada operación se aplica o se rechaza con su motivo, y Atlas recibe las
 * dos listas: así puede corregir en la siguiente vuelta en vez de creer que
 * todo salió. Lo que no se negocia (CLAUDE.md):
 *   - Fotos: solo las del producto o las subidas al sistema (/uploads),
 *     nunca una imagen cualquiera de internet.
 *   - Textos: ninguna cifra, precio o porcentaje que no esté en la ficha
 *     (el mismo filtro que los ganchos de la IA, `cifrasPermitidas`).
 *
 * Módulo PURO: lo prueba vitest sin base ni navegador.
 */
import { FORMATOS, colorSeguro, idNuevo, normalizarEscena, type Capa, type Escena, type Formato } from "./escena";

export type OperacionEscena =
  | { op: "agregar"; capa: Record<string, unknown>; despuesDe?: string }
  | { op: "cambiar"; capa: string; props: Record<string, unknown> }
  | { op: "borrar"; capa: string }
  | { op: "duplicar"; capa: string; dx?: number; dy?: number }
  | { op: "orden"; capa: string; a: "frente" | "fondo" | "arriba" | "abajo" }
  | { op: "alinear"; capas: string[]; eje: "izquierda" | "centro" | "derecha" | "arriba" | "medio" | "abajo" }
  | { op: "fondo"; color: string }
  | { op: "formato"; formato: Formato };

export interface ReglasDeDiseno {
  /** Fotos que se pueden usar (las del producto). /uploads/ siempre vale. */
  fotosPermitidas: string[];
  /** ¿Este texto trae una cifra que no está en la ficha? */
  inventaCifras?: (texto: string) => boolean;
}

export interface ResultadoOperaciones {
  escena: Escena;
  aplicadas: string[];
  rechazadas: string[];
}

const CAMPOS_PROHIBIDOS = new Set(["id", "tipo"]);
const etiqueta = (c: Capa) => `${c.tipo} "${c.nombre || (c.tipo === "texto" ? c.texto.slice(0, 24) : c.id)}"`;

function buscar(capas: Capa[], ref: string): number {
  const r = String(ref || "").trim().toLowerCase();
  if (!r) return -1;
  // Por id, o por nombre de capa ("Gancho", "Foto"), que es como las nombra la maqueta.
  const i = capas.findIndex((c) => c.id.toLowerCase() === r);
  return i >= 0 ? i : capas.findIndex((c) => (c.nombre || "").toLowerCase() === r);
}

function fotoValida(src: unknown, reglas: ReglasDeDiseno): boolean {
  const s = String(src ?? "").trim();
  if (!s) return false;
  if (s.startsWith("/uploads/")) return true;
  const sinQuery = (u: string) => u.split(/[?#]/)[0];
  return reglas.fotosPermitidas.some((f) => f === s || sinQuery(f) === sinQuery(s));
}

/** Revisa lo que una capa (nueva o cambiada) traería; devuelve el motivo si no se puede. */
function motivoDeRechazo(capa: Record<string, unknown>, reglas: ReglasDeDiseno): string | null {
  if (capa.tipo === "imagen" && !fotoValida(capa.src, reglas)) {
    return "solo se pueden usar las fotos del producto (creativo_ver las lista) o imágenes subidas al sistema";
  }
  if (capa.tipo === "texto" && typeof capa.texto === "string" && reglas.inventaCifras?.(capa.texto)) {
    return `el texto "${String(capa.texto).slice(0, 40)}" trae una cifra, precio o porcentaje que no está en la ficha`;
  }
  return null;
}

export function aplicarOperaciones(escenaEntrada: Escena, operaciones: unknown, reglas: ReglasDeDiseno): ResultadoOperaciones {
  let e = normalizarEscena(escenaEntrada);
  const capas: Capa[] = [...e.capas];
  const aplicadas: string[] = [];
  const rechazadas: string[] = [];
  const lista = Array.isArray(operaciones) ? operaciones.slice(0, 40) : [];
  if (!lista.length) rechazadas.push("no llegó ninguna operación");

  for (const raw of lista) {
    const o = (raw && typeof raw === "object" ? raw : {}) as any;
    const op = String(o.op || "").toLowerCase();
    try {
      if (op === "agregar") {
        const nueva = { ...(o.capa || {}) } as Record<string, unknown>;
        if (!["texto", "imagen", "forma", "degradado"].includes(String(nueva.tipo))) { rechazadas.push(`agregar: tipo "${nueva.tipo}" no existe (texto, imagen, forma o degradado)`); continue; }
        const motivo = motivoDeRechazo(nueva, reglas);
        if (motivo) { rechazadas.push(`agregar: ${motivo}`); continue; }
        nueva.id = idNuevo(String(nueva.tipo).slice(0, 1));
        const normal = normalizarEscena({ ...e, capas: [nueva] }).capas[0];
        if (!normal) { rechazadas.push("agregar: la capa no es válida"); continue; }
        const j = o.despuesDe ? buscar(capas, o.despuesDe) : -1;
        if (j >= 0) capas.splice(j + 1, 0, normal); else capas.push(normal);
        aplicadas.push(`agregada ${etiqueta(normal)} [${normal.id}]`);
      } else if (op === "cambiar") {
        const i = buscar(capas, o.capa);
        if (i < 0) { rechazadas.push(`cambiar: no existe la capa "${o.capa}"`); continue; }
        const actual = capas[i]!;
        const props = Object.fromEntries(Object.entries(o.props || {}).filter(([k]) => !CAMPOS_PROHIBIDOS.has(k)));
        if (!Object.keys(props).length) { rechazadas.push(`cambiar ${etiqueta(actual)}: sin cambios`); continue; }
        const combinada = { ...actual, ...props } as Record<string, unknown>;
        const motivo = motivoDeRechazo(combinada, reglas);
        if (motivo) { rechazadas.push(`cambiar ${etiqueta(actual)}: ${motivo}`); continue; }
        const normal = normalizarEscena({ ...e, capas: [combinada] }).capas[0];
        if (!normal) { rechazadas.push(`cambiar ${etiqueta(actual)}: quedaría inválida`); continue; }
        capas[i] = normal;
        aplicadas.push(`cambiada ${etiqueta(normal)}: ${Object.keys(props).join(", ")}`);
      } else if (op === "borrar") {
        const i = buscar(capas, o.capa);
        if (i < 0) { rechazadas.push(`borrar: no existe la capa "${o.capa}"`); continue; }
        const [fuera] = capas.splice(i, 1);
        aplicadas.push(`borrada ${etiqueta(fuera!)}`);
      } else if (op === "duplicar") {
        const i = buscar(capas, o.capa);
        if (i < 0) { rechazadas.push(`duplicar: no existe la capa "${o.capa}"`); continue; }
        const orig = capas[i]!;
        const copia = { ...orig, id: idNuevo(orig.tipo.slice(0, 1)), x: orig.x + (Number(o.dx) || 3), y: orig.y + (Number(o.dy) || 3) } as Capa;
        capas.splice(i + 1, 0, copia);
        aplicadas.push(`duplicada ${etiqueta(orig)} → [${copia.id}]`);
      } else if (op === "orden") {
        const i = buscar(capas, o.capa);
        if (i < 0) { rechazadas.push(`orden: no existe la capa "${o.capa}"`); continue; }
        const [c] = capas.splice(i, 1);
        const destino = o.a === "frente" ? capas.length : o.a === "fondo" ? 0 : o.a === "arriba" ? Math.min(capas.length, i + 1) : Math.max(0, i - 1);
        capas.splice(destino, 0, c!);
        aplicadas.push(`${etiqueta(c!)} al ${o.a === "frente" ? "frente" : o.a === "fondo" ? "fondo" : o.a === "arriba" ? "una capa arriba" : "una capa abajo"}`);
      } else if (op === "alinear") {
        const idx = (Array.isArray(o.capas) ? o.capas : []).map((r: string) => buscar(capas, r)).filter((i: number) => i >= 0);
        if (!idx.length) { rechazadas.push("alinear: ninguna de esas capas existe"); continue; }
        for (const i of idx) {
          const c = { ...capas[i]! };
          // Con una sola capa se alinea al lienzo; con varias, a la primera.
          const ref = idx.length > 1 && i !== idx[0] ? capas[idx[0]!]! : { x: 0, y: 0, w: 100, h: 100 };
          if (o.eje === "izquierda") c.x = ref.x;
          else if (o.eje === "derecha") c.x = ref.x + ref.w - c.w;
          else if (o.eje === "centro") c.x = ref.x + (ref.w - c.w) / 2;
          else if (o.eje === "arriba") c.y = ref.y;
          else if (o.eje === "abajo") c.y = ref.y + ref.h - c.h;
          else if (o.eje === "medio") c.y = ref.y + (ref.h - c.h) / 2;
          else { rechazadas.push(`alinear: eje "${o.eje}" no existe`); break; }
          capas[i] = c;
        }
        aplicadas.push(`alineadas ${idx.length} capa(s) a ${o.eje}`);
      } else if (op === "fondo") {
        const color = colorSeguro(o.color, "");
        if (!color) { rechazadas.push(`fondo: "${o.color}" no es un color válido (#RRGGBB)`); continue; }
        e = { ...e, fondo: color };
        aplicadas.push(`fondo ${color}`);
      } else if (op === "formato") {
        if (!(o.formato in FORMATOS)) { rechazadas.push(`formato: "${o.formato}" no existe (4:5, 1:1, 9:16, 1.91:1)`); continue; }
        e = { ...e, formato: o.formato };
        aplicadas.push(`formato ${o.formato} (las capas van en %, revisa que todo siga entrando)`);
      } else {
        rechazadas.push(`operación "${o.op}" no existe (agregar, cambiar, borrar, duplicar, orden, alinear, fondo, formato)`);
      }
    } catch (err: any) {
      rechazadas.push(`${op || "?"}: ${err?.message || "error"}`);
    }
  }
  return { escena: normalizarEscena({ ...e, capas }), aplicadas, rechazadas };
}

/**
 * La escena contada para un modelo: cada capa con su id y lo que importa
 * para diseñar (posición y tamaño en %, letra, color). Compacta a propósito:
 * va en el contexto de Atlas.
 */
export function describirEscena(e: Escena): string {
  const { ancho, alto } = FORMATOS[e.formato];
  const r = (v: number | undefined) => Math.round((v ?? 0) * 10) / 10;
  const lineas = e.capas.map((c, i) => {
    const caja = `x${r(c.x)} y${r(c.y)} w${r(c.w)} h${r(c.h)}${c.rot ? ` rot${c.rot}` : ""}${c.opacidad !== undefined && c.opacidad < 1 ? ` op${c.opacidad}` : ""}${c.oculta ? " OCULTA" : ""}`;
    if (c.tipo === "texto") return `${i}. [${c.id}] texto${c.nombre ? ` "${c.nombre}"` : ""} ${caja} · "${c.texto.slice(0, 80)}" · ${c.fuente} ${c.tam}% peso${c.peso} ${c.color}${c.fondo ? ` cartel ${c.fondo}` : ""}${c.alinear !== "left" ? ` ${c.alinear}` : ""}${c.mayus ? " MAYÚS" : ""}${c.contorno ? ` contorno ${c.contorno}` : ""}${c.sombra ? " sombra" : ""}`;
    if (c.tipo === "imagen") return `${i}. [${c.id}] imagen${c.nombre ? ` "${c.nombre}"` : ""} ${caja} · ${c.ajuste} foco ${c.focoX},${c.focoY}${c.radio ? ` radio${c.radio}` : ""}${c.sombra ? " sombra" : ""} · ${c.src.slice(0, 70)}`;
    if (c.tipo === "forma") return `${i}. [${c.id}] forma ${c.forma}${c.nombre ? ` "${c.nombre}"` : ""} ${caja} · ${c.relleno}${c.borde ? ` borde ${c.borde}` : ""}${c.radio ? ` radio${c.radio}` : ""}`;
    return `${i}. [${c.id}] degradado ${caja} · ${c.desde} → ${c.hasta} ${c.angulo}°`;
  });
  return `Formato ${e.formato} (${ancho}×${alto}px), fondo ${e.fondo}. Capas de atrás hacia adelante (posición y tamaño en % del lienzo; letra en % del ancho):\n${lineas.join("\n")}`;
}
