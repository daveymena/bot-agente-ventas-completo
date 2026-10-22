/**
 * Atlas diseña landings (23-10-2026): ver la página como la ve el cliente,
 * operar sus secciones con precisión y mirar el resultado.
 *
 * - landing_ver: estructura (secciones con id) + fotos del producto + hechos
 *   de la ficha y, con `mirar`, la captura en un celular criticada por el
 *   ojo de diseñador.
 * - landing_disenar: operaciones exactas (operaciones-landing.ts). Solo en
 *   BORRADORES: en una publicada el cambio se vería en vivo sin que el dueño
 *   lo apruebe, así que se le pide a Atlas clonarla, diseñar en la copia y
 *   publicar cuando el dueño diga.
 */
import { and, eq } from "drizzle-orm";
import { db, landingPages } from "@workspace/db";
import { logger } from "../logger";
import { dbNow } from "../date-utils";

async function fila(tenantId: number, id: number) {
  const [row] = await db.select().from(landingPages).where(and(eq(landingPages.id, id), eq(landingPages.tenantId, tenantId))).limit(1);
  return row || null;
}

/** ¿Se dibuja desde secciones (premium, estilo o familia)? Las copias HTML y las de Forge no. */
function editablePorSecciones(row: any): string | null {
  const s = row.source as any;
  if (s?.type === "landingforge") return "es de Landing Forge: se edita con landing_forge_editar";
  if (s?.tipo === "html") return "es una copia HTML de otro sitio: se cambia con landing_adaptar o landing_editar";
  if (row.html && (row.design as any)?.renderer !== "premium" && (row.design as any)?.renderer !== "estilo" && !(row.design as any)?.familia) return "tiene HTML propio escrito por el modelo: se cambia con landing_editar";
  return null;
}

async function htmlDeFila(row: any): Promise<string> {
  const ps = await import("./html-por-secciones");
  const producto = await ps.productoDeLanding(row);
  if (ps.esPremium(row)) return ps.htmlPremium(row, producto);
  if (ps.esEstilo(row)) return ps.htmlEstilo(row, producto);
  if (row.html) return String(row.html);
  return ps.htmlV3(row, producto);
}

async function hechosYReglas(tenantId: number, productId: number | null) {
  if (!productId) return { fotos: [] as string[], hechos: null, reglas: { fotosPermitidas: [] as string[] } };
  const { datosDelProducto, inventaCifras } = await import("../creativos/datos");
  const d = await datosDelProducto(tenantId, productId);
  if (!d) return { fotos: [], hechos: null, reglas: { fotosPermitidas: [] } };
  return {
    fotos: d.datos.fotos,
    hechos: { producto: d.producto.name, precio: d.datos.precio || null, sellos: d.datos.sellos || [], beneficios: d.datos.beneficios || [] },
    reglas: { fotosPermitidas: d.datos.fotos, inventaCifras: (t: string) => inventaCifras(t, d) },
  };
}

async function mirarLanding(tenantId: number, row: any, objetivo?: string): Promise<{ critica: string | null; vista: boolean }> {
  try {
    const { htmlAPng } = await import("../creativos/render");
    const png = await htmlAPng(await htmlDeFila(row), { ancho: 390, altoMax: 4200, escala: 0.75 });
    const { criticarDiseno } = await import("../estudio/ojo-de-disenador");
    const { describirLanding } = await import("./operaciones-landing");
    const critica = await criticarDiseno(png, { tipo: "landing", objetivo, estructura: describirLanding({ sections: (row.sections as any[]) || [], design: (row.design as any) || {} }) }, tenantId).catch(() => null);
    return { critica, vista: true };
  } catch (e: any) {
    logger.warn({ err: e?.message, landingId: row.id }, "[AtlasDiseno] no se pudo fotografiar la landing");
    return { critica: null, vista: false };
  }
}

export async function verLanding(tenantId: number, id: number, opts: { mirar?: boolean; objetivo?: string } = {}) {
  const row = await fila(tenantId, id);
  if (!row) return { ok: false as const, error: `No encontré la landing [${id}].` };
  const { describirLanding, TIPOS_DE_SECCION } = await import("./operaciones-landing");
  const { fotos, hechos } = await hechosYReglas(tenantId, row.productId ?? null);
  const vista = opts.mirar ? await mirarLanding(tenantId, row, opts.objetivo) : { critica: null, vista: false };
  return {
    ok: true as const,
    id, nombre: row.name, estado: row.status, slug: row.slug,
    noEditable: editablePorSecciones(row),
    estructura: describirLanding({ sections: (row.sections as any[]) || [], design: (row.design as any) || {} }),
    tipos: TIPOS_DE_SECCION,
    fotos, hechos,
    critica: vista.critica,
    mirado: opts.mirar ? vista.vista : undefined,
  };
}

export async function disenarLanding(tenantId: number, id: number, operaciones: unknown, opts: { mirar?: boolean; objetivo?: string } = {}) {
  const row = await fila(tenantId, id);
  if (!row) return { ok: false as const, error: `No encontré la landing [${id}].` };
  const motivo = editablePorSecciones(row);
  if (motivo) return { ok: false as const, error: `La landing [${id}] ${motivo}.` };
  if (row.status === "published") {
    return { ok: false as const, error: `La landing [${id}] está PUBLICADA: un cambio se vería en vivo sin que el dueño lo apruebe. Clónala con landing_clonar (queda en borrador), diseña en la copia con landing_disenar y publícala con landing_publicar cuando el dueño diga.` };
  }
  const { aplicarOperacionesLanding, describirLanding } = await import("./operaciones-landing");
  const { reglas } = await hechosYReglas(tenantId, row.productId ?? null);
  const r = aplicarOperacionesLanding({ sections: (row.sections as any[]) || [], design: (row.design as any) || {} }, operaciones, reglas);
  if (r.aplicadas.length) {
    // dbNow(): en SQLite un Date crudo no se puede guardar (ver date-utils.ts).
    await db.update(landingPages).set({ sections: r.landing.sections, design: r.landing.design, updatedAt: dbNow() } as any).where(eq(landingPages.id, id));
  }
  const actualizada = { ...row, sections: r.landing.sections, design: r.landing.design };
  const vista = opts.mirar && r.aplicadas.length ? await mirarLanding(tenantId, actualizada, opts.objetivo) : { critica: null, vista: false };
  return {
    ok: true as const,
    aplicadas: r.aplicadas,
    rechazadas: r.rechazadas,
    estructura: describirLanding(r.landing),
    critica: vista.critica,
    mirado: opts.mirar ? vista.vista : undefined,
  };
}
