/**
 * Editar una landing con una instrucción en lenguaje natural.
 *
 * Lo que había: `POST /:id/command` pedía al modelo una lista de
 * operaciones y la devolvía; la pantalla contestaba "Cambio aplicado.
 * Preview actualizada" y recargaba la vista previa... sin que NADIE aplicara
 * ni guardara las operaciones (12-09-2026). Un "hacé el hero más agresivo"
 * no cambiaba nada y el admin leía que sí.
 *
 * Acá se calcula, se APLICA y se GUARDA, en el servidor, y lo usan tanto la
 * pantalla como Atlas (`landing_editar`).
 */
import { eq } from "drizzle-orm";
import { db, landingPages } from "@workspace/db";
import { callMarketingAI } from "../marketing-team/ai";
import { aTextoPlano } from "../texto-plano";

export interface OperacionDeEdicion {
  op: string;
  sectionId?: string;
  patch?: Record<string, unknown>;
  section?: Record<string, unknown>;
  direction?: "up" | "down";
  cta?: string;
}

const CAMPOS_EDITABLES = ["title", "subtitle", "body", "cta", "layout"] as const;

/** Pide al modelo las operaciones. Lista vacía si no pudo. */
export async function operacionesDeEdicion(
  tenantId: number,
  landing: { name: string; strategy: unknown; sections: unknown; design: unknown },
  instruction: string,
  selectedSectionId?: string | null,
): Promise<{ message: string; operations: OperacionDeEdicion[] }> {
  const current = { name: landing.name, strategy: landing.strategy, sections: landing.sections, design: landing.design };
  const result = await callMarketingAI<any>({
    tenantId,
    json: true,
    maxTokens: 2500,
    systemPrompt:
      "Eres el editor de landing pages de VentasPro. Analiza la instrucción del usuario y el estado actual y devuelve SOLO JSON con {message, operations}. " +
      "Operaciones permitidas: update_section {sectionId, patch:{title?,subtitle?,body?,cta?,layout?}}, add_section {section:{type,title,subtitle?,body?,cta?}}, " +
      "remove_section {sectionId}, move_section {sectionId, direction:'up'|'down'}, update_design {patch:{familia?}}, set_cta {sectionId, cta}. " +
      "Las operaciones deben ser pequeñas y seguras. No inventes datos, testimonios, garantías, descuentos ni urgencia; NUNCA agregues testimonials ni before-after (no hay datos reales). " +
      "No agregues dos secciones del mismo tipo: si ya existe, editala con update_section. " +
      "EL ASPECTO VISUAL (colores, tipografía, 'frontend', 'diseño', 'estilo') SÍ se cambia: update_design {patch:{familia}} con familia una de premium, respuesta-directa, minimal, editorial, ecommerce, belleza, fitness, educacion, tecnologia, familiar, creativa, oscura. Nunca digas que no podés cambiar el diseño. " +
      "En body: una línea por ítem en beneficios/cómo funciona/oferta; en faq 'Pregunta | Respuesta'. Escribe en español. " +
      "'message' es una frase corta para el admin diciendo QUÉ cambiaste.",
    userPrompt: JSON.stringify({ instruction, selectedSectionId: selectedSectionId || null, current }),
  });
  // El modelo escribe la lista con distintos nombres, y a veces devuelve
  // las `sections` enteras en vez de operaciones. Se aceptan todas las formas:
  // sin esto contestaba "Actualicé la sección…" con cero operaciones
  // reconocidas y nada cambiaba (12-09-2026).
  let crudas: any[] = [];
  for (const k of ["operations", "ops", "operaciones", "cambios", "changes"]) {
    if (Array.isArray(result?.[k])) { crudas = result[k]; break; }
  }
  if (crudas.length === 0 && Array.isArray(result?.sections)) {
    const actuales: any[] = Array.isArray(landing.sections) ? (landing.sections as any[]) : [];
    for (const sec of result.sections) {
      if (!sec || typeof sec !== "object") continue;
      const existe = actuales.find((a) => String(a.id) === String(sec.id)) || actuales.find((a) => a.type === sec.type);
      crudas.push(existe
        ? { op: "update_section", sectionId: existe.id, patch: { title: sec.title, subtitle: sec.subtitle, body: sec.body, cta: sec.cta } }
        : { op: "add_section", section: sec });
    }
  }
  const operations: OperacionDeEdicion[] = crudas
    .map((o: any) => (o && typeof o === "object" ? { ...o, op: String(o.op || o.type || o.action || "") } : null))
    .filter((o: any): o is OperacionDeEdicion => !!o && !!o.op);
  const claves = result && typeof result === "object" ? Object.keys(result).join(", ") : typeof result;
  return {
    message: String(result?.message || (operations.length ? "Cambio preparado." : `No pude convertir la instrucción en un cambio seguro (el modelo devolvió: ${claves}).`)),
    operations,
  };
}

/** Aplica las operaciones sobre una copia y devuelve lo que hay que guardar. */
export function aplicarOperaciones(
  landing: { name: string; sections: any[]; design: any },
  operations: OperacionDeEdicion[],
): { name: string; sections: any[]; design: any; aplicadas: string[]; ignoradas: string[] } {
  let sections: any[] = Array.isArray(landing.sections) ? landing.sections.map((s) => ({ ...s })) : [];
  let design: any = { ...(landing.design || {}) };
  const name = landing.name;
  const aplicadas: string[] = [];
  const ignoradas: string[] = [];
  const idx = (id?: string) => sections.findIndex((s) => String(s.id) === String(id));

  for (const o of operations) {
    switch (o.op) {
      case "update_section": {
        const i = idx(o.sectionId);
        if (i === -1 || !o.patch) { ignoradas.push(`update_section ${o.sectionId}`); break; }
        for (const k of CAMPOS_EDITABLES) {
          if (o.patch[k] !== undefined) sections[i][k] = k === "layout" ? String(o.patch[k]) : aTextoPlano(o.patch[k]);
        }
        // imagePrompt/image del modelo no se aplican: las fotos son las reales del producto.
        aplicadas.push(`editada ${sections[i].type}`);
        break;
      }
      case "set_cta": {
        const i = idx(o.sectionId);
        if (i === -1 || !o.cta) { ignoradas.push(`set_cta ${o.sectionId}`); break; }
        sections[i].cta = aTextoPlano(o.cta);
        aplicadas.push(`CTA de ${sections[i].type}`);
        break;
      }
      case "add_section": {
        const s: any = o.section;
        if (!s || typeof s.type !== "string") { ignoradas.push("add_section sin type"); break; }
        // Sin datos reales no hay prueba social: agregarla es inventarla
        // (el modelo metió "prueba social" en la rueda abdominal, 12-09-2026).
        if (["testimonials", "before-after", "authority"].includes(s.type)) { ignoradas.push(`no se inventa ${s.type}`); break; }
        const n = sections.filter((x) => x.type === s.type).length + 1;
        // Una sección más del mismo tipo como mucho: cuatro "benefits" seguidas
        // es un folleto, no una página.
        if (n > 2) { ignoradas.push(`ya hay ${n - 1} de ${s.type}`); break; }
        // Id único de verdad (contar por tipo repetía "benefits-2") y la
        // sección nueva va ANTES del cierre, no después del botón final.
        let k = n; while (sections.some((x) => String(x.id) === `${s.type}-${k}`)) k++;
        const nueva = { id: `${s.type}-${k}`, type: s.type, title: aTextoPlano(s.title || ""), subtitle: s.subtitle ? aTextoPlano(s.subtitle) : undefined, body: s.body ? aTextoPlano(s.body) : undefined, cta: s.cta ? aTextoPlano(s.cta) : undefined };
        const cierre = sections.findIndex((x) => x.type === "cta");
        if (cierre === -1) sections.push(nueva); else sections.splice(cierre, 0, nueva);
        aplicadas.push(`agregada ${s.type}`);
        break;
      }
      case "remove_section": {
        const i = idx(o.sectionId);
        if (i === -1) { ignoradas.push(`remove_section ${o.sectionId}`); break; }
        // El hero y el cierre no se quitan: sin ellos no hay página.
        if (sections[i].type === "hero" || sections[i].type === "cta") { ignoradas.push(`no se quita ${sections[i].type}`); break; }
        aplicadas.push(`quitada ${sections[i].type}`);
        sections.splice(i, 1);
        break;
      }
      case "move_section": {
        const i = idx(o.sectionId);
        const j = o.direction === "up" ? i - 1 : i + 1;
        if (i === -1 || j < 0 || j >= sections.length) { ignoradas.push(`move_section ${o.sectionId}`); break; }
        [sections[i], sections[j]] = [sections[j], sections[i]];
        aplicadas.push(`movida ${sections[j].type}`);
        break;
      }
      case "update_design": {
        if (o.patch && typeof o.patch === "object") { design = { ...design, ...o.patch }; aplicadas.push("diseño"); }
        else ignoradas.push("update_design vacío");
        break;
      }
      default:
        ignoradas.push(o.op);
    }
  }
  return { name, sections, design, aplicadas, ignoradas };
}

// ── Landings con HTML propio (generadas por OpenCode) ─────────────────────
//
// Medido en producción el 18-09-2026 (landing 15, "color muy femenino"): el
// dueño pidió dos veces cambiar la paleta, la herramienta contestó
// "cambios: diseño" y la página siguió idéntica. Esta función editaba
// `sections`/`design`, pero la ruta pública sirve `html` tal cual cuando
// existe (landing-publica.ts): las ediciones caían en campos que nadie
// renderiza. Para esas landings la edición tiene que reescribir el HTML, y
// eso lo hace OpenCode con `existingHtml` -- tarda, así que corre en
// segundo plano igual que la creación, y `strategy` dice en qué va.
const edicionesEnCurso = new Set<number>();

export function landingTieneHtmlPropio(landing: { html?: string | null }): boolean {
  return typeof landing?.html === "string" && landing.html.trim().length > 0;
}

export function lanzarEdicionDeHtmlEnSegundoPlano(landing: any, instruction: string): { ok: boolean; message: string } {
  const id = Number(landing.id);
  if (edicionesEnCurso.has(id)) return { ok: false, message: `La landing [${id}] ya tiene una edición en curso; esperá a que termine (landing_estado).` };
  edicionesEnCurso.add(id);
  void (async () => {
    const { dbNow } = await import("../date-utils");
    const marcar = async (cambios: Record<string, any>) => {
      await db.update(landingPages).set({ ...cambios, updatedAt: dbNow() } as any).where(eq(landingPages.id, id));
    };
    const estrategiaBase = { ...((landing.strategy as any) || {}) };
    try {
      await marcar({ strategy: { ...estrategiaBase, generando: true, editando: instruction.slice(0, 300), desde: new Date().toISOString(), error: undefined } });
      const { products } = await import("@workspace/db");
      const [product] = landing.productId ? await db.select().from(products).where(eq(products.id, Number(landing.productId))).limit(1) : [null];
      const { generarLandingConOpenCode } = await import("../../routes/landing-studio-opencode");
      const r = await generarLandingConOpenCode({
        product: product || { id: landing.productId, name: landing.name, tenantId: landing.tenantId },
        instruction:
          `EDITÁ la página existente (viene abajo como HTML). Aplicá SOLO este cambio y devolvé el HTML completo actualizado, ` +
          `conservando textos, precios, video, formulario y enlaces tal cual: ${instruction}`,
        existingHtml: landing.html,
        familia: (landing.design as any)?.familia ?? null,
        timeoutMs: 150_000,
      });
      if (r.error || !r.html || !/<html|<!doctype/i.test(r.html)) throw new Error(r.error || "OpenCode no devolvió HTML");
      await marcar({ html: r.html, strategy: { ...estrategiaBase, generando: false, editando: undefined, ultimaEdicion: instruction.slice(0, 300), listaEn: new Date().toISOString() } });
    } catch (e: any) {
      await marcar({ strategy: { ...estrategiaBase, generando: false, editando: undefined, error: `No se pudo editar el HTML: ${String(e?.message || e).slice(0, 200)}` } }).catch(() => undefined);
    } finally {
      edicionesEnCurso.delete(id);
    }
  })();
  return {
    ok: true,
    message:
      `Esta landing tiene diseño propio (HTML completo), así que el cambio se aplica reescribiendo la página: tarda 1 a 3 minutos y corre en segundo plano. ` +
      `Mientras tanto la URL sigue mostrando la versión anterior. Para saber si terminó: landing_estado con id ${id}. No digas que ya cambió hasta que diga "lista".`,
  };
}

/** Todo junto: calcular, aplicar y guardar. Devuelve qué pasó, en palabras. */
export async function editarLanding(tenantId: number, landingId: number, instruction: string, selectedSectionId?: string | null) {
  const [landing] = await db.select().from(landingPages).where(eq(landingPages.id, landingId)).limit(1);
  if (!landing || landing.tenantId !== tenantId) return { ok: false as const, message: "Landing no encontrada", aplicadas: [] as string[], ignoradas: [] as string[] };
  if (landingTieneHtmlPropio(landing as any)) {
    const r = lanzarEdicionDeHtmlEnSegundoPlano(landing, instruction);
    return { ok: r.ok as boolean, message: r.message, aplicadas: r.ok ? ["html (en segundo plano)"] : [], ignoradas: [] as string[], enSegundoPlano: r.ok };
  }
  const { message, operations } = await operacionesDeEdicion(tenantId, landing as any, instruction, selectedSectionId);
  if (operations.length === 0) return { ok: false as const, message: message.startsWith("No pude") ? message : `El modelo no devolvió operaciones aplicables (dijo: "${message}").`, aplicadas: [], ignoradas: [] };
  const r = aplicarOperaciones({ name: landing.name, sections: (landing.sections as any[]) || [], design: landing.design }, operations);
  if (r.aplicadas.length === 0) return { ok: false as const, message: `No se aplicó nada (${r.ignoradas.join(", ") || "sin operaciones válidas"}).`, aplicadas: [], ignoradas: r.ignoradas };
  await db.update(landingPages).set({ sections: r.sections, design: r.design, updatedAt: new Date() } as any).where(eq(landingPages.id, landingId));
  return { ok: true as const, message, aplicadas: r.aplicadas, ignoradas: r.ignoradas };
}
