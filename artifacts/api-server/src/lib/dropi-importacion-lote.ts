/**
 * Importar productos de Dropi EN LOTE, en segundo plano.
 *
 * Pedido del dueño (29-09-2026): "¿y si quisiera integrar productos en masa?".
 * Hasta acá `POST /api/dropi/importar` aceptaba hasta 50 ítems pero los hacía
 * DENTRO de la petición: cada uno lee el detalle en Dropi, baja las fotos para
 * quitar repetidas (SHA-1) y pasa por el curador de IA. Con más de unos pocos
 * la petición moría por el tope del proxy (~150 s) sin decir cuáles entraron.
 *
 * Acá el lote corre fuera de la petición, de a uno, con pausa entre productos
 * (Dropi responde "You have exceeded the allowed number of requests" si se le
 * insiste) y deja el progreso consultable. Un lote por negocio a la vez.
 * Al terminar avisa al dueño por WhatsApp/Telegram.
 *
 * El estado vive en memoria: si el servidor se reinicia a mitad, lo ya
 * importado queda (cada producto se guarda al importarse) y el resto se
 * vuelve a pedir — importarProductoDropi no duplica (mismo dropiProductId).
 */
import { logger } from "./logger";

export interface ItemLote { dropiProductId: number; precio?: number | null }

export interface EstadoLote {
  id: string;
  tenantId: number;
  estado: "en_curso" | "terminado" | "detenido";
  total: number;
  hechos: number;
  importados: Array<{ dropiProductId: number; productId: number; nombre: string; nuevo: boolean }>;
  fallidos: Array<{ dropiProductId: number; error: string }>;
  curar: boolean;
  factorSobreCosto: number | null;
  empezo: string;
  termino: string | null;
  origen: string;
}

export const MAX_POR_LOTE = 200;
const PAUSA_MS = Number(process.env.DROPI_LOTE_PAUSA_MS || 1500);
const ESPERA_LIMITE_MS = 60_000;

const lotes = new Map<number, EstadoLote>();
const detenidos = new Set<string>();

export function loteDelNegocio(tenantId: number): EstadoLote | null {
  return lotes.get(tenantId) || null;
}

export function detenerLote(tenantId: number): boolean {
  const l = lotes.get(tenantId);
  if (!l || l.estado !== "en_curso") return false;
  detenidos.add(l.id);
  return true;
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Los ids a importar a partir de una búsqueda, salteando los que ya están en el catálogo. */
export async function idsDesdeBusqueda(tenantId: number, token: string, q: string, opts: { conStock?: boolean; max?: number } = {}): Promise<{ ok: boolean; ids: number[]; yaEstaban: number; error?: string }> {
  const max = Math.min(Math.max(opts.max || 20, 1), MAX_POR_LOTE);
  const { buscarProductosDropi } = await import("./dropi-directo");
  const { db, products } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const propios = await db.select({ metadata: products.metadata }).from(products).where(eq(products.tenantId, tenantId));
  const importados = new Set<number>();
  for (const p of propios as any[]) {
    try { const m = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata; if (m?.dropiProductId) importados.add(Number(m.dropiProductId)); } catch { /* sin metadata */ }
  }
  const ids: number[] = [];
  let yaEstaban = 0;
  for (let pagina = 1; ids.length < max && pagina <= 10; pagina++) {
    const r = await buscarProductosDropi(token, { q, conStock: opts.conStock !== false, pagina, porPagina: 50 });
    if (!r.ok) return { ok: ids.length > 0, ids, yaEstaban, error: r.error };
    const lista = r.data || [];
    for (const p of lista) {
      const id = Number(p.id);
      if (!id) continue;
      if (importados.has(id)) { yaEstaban++; continue; }
      if (!ids.includes(id)) ids.push(id);
      if (ids.length >= max) break;
    }
    if (lista.length < 50) break; // no hay más páginas
    await dormir(PAUSA_MS);
  }
  return { ok: true, ids, yaEstaban };
}

export function iniciarLote(
  tenantId: number,
  token: string,
  items: ItemLote[],
  opts: { curar?: boolean; factorSobreCosto?: number | null; origen?: string } = {},
): { ok: true; lote: EstadoLote } | { ok: false; error: string; lote?: EstadoLote } {
  const actual = lotes.get(tenantId);
  if (actual?.estado === "en_curso") return { ok: false, error: `Ya hay un lote importando (${actual.hechos}/${actual.total}). Esperá a que termine o detenelo.`, lote: actual };
  const unicos = [...new Map(items.filter((i) => Number(i?.dropiProductId) > 0).map((i) => [Number(i.dropiProductId), i])).values()].slice(0, MAX_POR_LOTE);
  if (!unicos.length) return { ok: false, error: "No hay productos para importar." };
  const factor = Number(opts.factorSobreCosto) > 1 ? Number(opts.factorSobreCosto) : null;
  const lote: EstadoLote = {
    id: `lote-${tenantId}-${Date.now()}`,
    tenantId,
    estado: "en_curso",
    total: unicos.length,
    hechos: 0,
    importados: [],
    fallidos: [],
    curar: opts.curar !== false,
    factorSobreCosto: factor,
    empezo: new Date().toISOString(),
    termino: null,
    origen: opts.origen || "panel",
  };
  lotes.set(tenantId, lote);
  void correrLote(lote, token, unicos).catch((e) => {
    logger.error({ tenantId, err: e?.message }, "[DropiLote] el lote se cortó");
    lote.estado = "terminado";
    lote.termino = new Date().toISOString();
  });
  return { ok: true, lote };
}

async function correrLote(lote: EstadoLote, token: string, items: ItemLote[]): Promise<void> {
  const { importarProductoDropi } = await import("./dropi-directo");
  for (const it of items) {
    if (detenidos.has(lote.id)) { lote.estado = "detenido"; break; }
    const id = Number(it.dropiProductId);
    let r = await importarProductoDropi(lote.tenantId, token, id, { precio: Number(it.precio) || null, factorSobreCosto: lote.factorSobreCosto, curar: lote.curar }).catch((e: any) => ({ ok: false as const, error: String(e?.message || e) }));
    // Límite de Dropi: se espera una vez y se reintenta ese mismo producto.
    if (!r.ok && /exceeded the allowed number/i.test(String((r as any).error || ""))) {
      logger.warn({ tenantId: lote.tenantId, id }, "[DropiLote] Dropi limitó las peticiones; espero 60 s");
      await dormir(ESPERA_LIMITE_MS);
      r = await importarProductoDropi(lote.tenantId, token, id, { precio: Number(it.precio) || null, factorSobreCosto: lote.factorSobreCosto, curar: lote.curar }).catch((e: any) => ({ ok: false as const, error: String(e?.message || e) }));
    }
    if (r.ok && (r as any).productId) {
      lote.importados.push({ dropiProductId: id, productId: (r as any).productId, nombre: String((r as any).nombre || id), nuevo: !(r as any).yaExistia });
    } else {
      lote.fallidos.push({ dropiProductId: id, error: String((r as any).error || "sin detalle").slice(0, 200) });
    }
    lote.hechos++;
    await dormir(PAUSA_MS);
  }
  if (lote.estado === "en_curso") lote.estado = "terminado";
  lote.termino = new Date().toISOString();
  detenidos.delete(lote.id);
  logger.info({ tenantId: lote.tenantId, total: lote.total, ok: lote.importados.length, fallidos: lote.fallidos.length }, "[DropiLote] lote terminado");
  try {
    const { avisarAlDueno } = await import("./avisos");
    await avisarAlDueno(lote.tenantId, resumenDelLote(lote));
  } catch { /* sin aviso */ }
}

export function resumenDelLote(l: EstadoLote): string {
  const nuevos = l.importados.filter((x) => x.nuevo).length;
  const actualizados = l.importados.length - nuevos;
  const cabeza = l.estado === "en_curso"
    ? `⏳ Importando de Dropi: ${l.hechos}/${l.total}`
    : `${l.estado === "detenido" ? "⏹️ Importación detenida" : "✅ Importación de Dropi terminada"}: ${l.hechos}/${l.total} revisados`;
  const lineas = [
    cabeza,
    `• Nuevos en tu catálogo: ${nuevos}${actualizados ? ` · ya estaban (actualizados): ${actualizados}` : ""}`,
    l.fallidos.length ? `• No se pudieron importar: ${l.fallidos.length} (${l.fallidos.slice(0, 3).map((f) => `#${f.dropiProductId}: ${f.error.slice(0, 60)}`).join("; ")}${l.fallidos.length > 3 ? "…" : ""})` : "",
    l.factorSobreCosto ? `• Precio de venta: costo × ${l.factorSobreCosto}` : "• Precio de venta: el sugerido por Dropi",
    l.curar ? "• Fichas organizadas con IA" : "• Sin curar con IA (descripción del proveedor limpia)",
  ];
  return lineas.filter(Boolean).join("\n");
}
