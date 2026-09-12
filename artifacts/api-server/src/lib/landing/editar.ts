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
      "Las operaciones deben ser pequeñas y seguras. No inventes datos, testimonios, garantías, descuentos ni urgencia. " +
      "En body: una línea por ítem en beneficios/cómo funciona/oferta; en faq 'Pregunta | Respuesta'. Escribe en español. " +
      "'message' es una frase corta para el admin diciendo QUÉ cambiaste.",
    userPrompt: JSON.stringify({ instruction, selectedSectionId: selectedSectionId || null, current }),
  });
  const operations = Array.isArray(result?.operations) ? result.operations.filter((o: any) => o && typeof o.op === "string") : [];
  return { message: String(result?.message || (operations.length ? "Cambio preparado." : "No pude convertir la instrucción en un cambio seguro.")), operations };
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
        const n = sections.filter((x) => x.type === s.type).length + 1;
        sections.push({ id: `${s.type}-${n}`, type: s.type, title: aTextoPlano(s.title || ""), subtitle: s.subtitle ? aTextoPlano(s.subtitle) : undefined, body: s.body ? aTextoPlano(s.body) : undefined, cta: s.cta ? aTextoPlano(s.cta) : undefined });
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

/** Todo junto: calcular, aplicar y guardar. Devuelve qué pasó, en palabras. */
export async function editarLanding(tenantId: number, landingId: number, instruction: string, selectedSectionId?: string | null) {
  const [landing] = await db.select().from(landingPages).where(eq(landingPages.id, landingId)).limit(1);
  if (!landing || landing.tenantId !== tenantId) return { ok: false as const, message: "Landing no encontrada", aplicadas: [] as string[], ignoradas: [] as string[] };
  const { message, operations } = await operacionesDeEdicion(tenantId, landing as any, instruction, selectedSectionId);
  if (operations.length === 0) return { ok: false as const, message, aplicadas: [], ignoradas: [] };
  const r = aplicarOperaciones({ name: landing.name, sections: (landing.sections as any[]) || [], design: landing.design }, operations);
  if (r.aplicadas.length === 0) return { ok: false as const, message: `No se aplicó nada (${r.ignoradas.join(", ") || "sin operaciones válidas"}).`, aplicadas: [], ignoradas: r.ignoradas };
  await db.update(landingPages).set({ sections: r.sections, design: r.design, updatedAt: new Date() } as any).where(eq(landingPages.id, landingId));
  return { ok: true as const, message, aplicadas: r.aplicadas, ignoradas: r.ignoradas };
}
