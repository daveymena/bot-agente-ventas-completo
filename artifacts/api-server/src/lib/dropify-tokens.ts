/**
 * ============================================================
 * TOKENS DE DROPIFY POR PRODUCTO: auditar y reparar
 * ============================================================
 *
 * Causa real del "Access denied" de Dropi (19-09-2026, pedidos Woo #324-#328
 * del Corrector de Postura, producto Woo 139): Dropify manda a Dropi la
 * cabecera `dropi-integration-key` con el `_dropi_token` DEL PRODUCTO
 * (OrdersModel.php:144 → :337), y ese producto no tenía token. Cabecera
 * vacía → "Access denied". El bolso (#323, producto 219) sí lo tenía y por
 * eso llegó a Dropi.
 *
 * No es la IP ni un permiso: es un producto importado sin token. Pasa con
 * productos importados antes de que Dropify guardara tokens por producto, o
 * creados/duplicados por fuera del importador.
 *
 * Reparación: copiarle el token de un producto que sí lo tiene (misma
 * integración, misma tienda). Se audita todo el catálogo para que no vuelva
 * a pasar con el próximo producto.
 */
import { logger } from "./logger";
import type { WooCommerceService } from "./woocommerce";
import { leerIntegracionDropi, type IntegracionDropi } from "./woocommerce-estado";

export interface ProductoDropify {
  wooProductId: number;
  nombre: string;
  esDeDropi: boolean;
  token: string | null;
  integracion: IntegracionDropi | null;
}

export interface Auditoria {
  revisados: number;
  deDropi: ProductoDropify[];
  sinToken: ProductoDropify[];
  /** Tokens distintos encontrados, con cuántos productos usa cada uno. */
  tokens: Array<{ token: string; usos: number; integracion: IntegracionDropi | null }>;
}

function metaDe(p: any, key: string): any {
  return ((p?.meta_data || []) as Array<{ key: string; value: any }>).find((m) => m.key === key)?.value;
}

/** Recorre el catálogo de Woo y clasifica los productos de Dropify. */
export async function auditarTokensDropify(woo: WooCommerceService, maxPaginas = 10): Promise<Auditoria> {
  const deDropi: ProductoDropify[] = [];
  let revisados = 0;
  for (let page = 1; page <= maxPaginas; page++) {
    const lote = await woo.getProducts({ per_page: 100, page, status: "any" }).catch(() => []);
    if (!lote.length) break;
    revisados += lote.length;
    for (const p of lote as any[]) {
      const esDeDropi = !!metaDe(p, "_dropi_product");
      if (!esDeDropi) continue;
      const token = String(metaDe(p, "_dropi_token") || "").trim() || null;
      deDropi.push({ wooProductId: Number(p.id), nombre: String(p.name || ""), esDeDropi, token, integracion: leerIntegracionDropi(token) });
    }
    if (lote.length < 100) break;
  }
  const conteo = new Map<string, number>();
  for (const p of deDropi) if (p.token) conteo.set(p.token, (conteo.get(p.token) || 0) + 1);
  const tokens = [...conteo.entries()]
    .map(([token, usos]) => ({ token, usos, integracion: leerIntegracionDropi(token) }))
    .sort((a, b) => b.usos - a.usos);
  return { revisados, deDropi, sinToken: deDropi.filter((p) => !p.token), tokens };
}

/**
 * Le pone a un producto el token de integración. Se guarda también
 * `_dropi_token_store`, que Dropify usa para agrupar por tienda.
 */
export async function repararTokenDropify(woo: WooCommerceService, wooProductId: number, token: string, tienda = "Tienda 1"): Promise<void> {
  await woo.updateProductMeta(wooProductId, [
    { key: "_dropi_token", value: token },
    { key: "_dropi_token_store", value: tienda },
  ]);
  logger.info({ wooProductId }, "[Dropify] Token de integración reparado en el producto");
}

export interface ResultadoReparacion {
  auditoria: Auditoria;
  tokenUsado: string | null;
  reparados: number[];
  errores: Array<{ wooProductId: number; error: string }>;
  resumen: string;
}

/**
 * Audita y repara: a cada producto de Dropify sin token le copia el token
 * más usado del catálogo (el que ya demostró funcionar). Si no hay ningún
 * token en el catálogo no inventa nada: lo dice.
 */
export async function repararTokensDropify(woo: WooCommerceService, opts: { soloProductoId?: number | null } = {}): Promise<ResultadoReparacion> {
  const auditoria = await auditarTokensDropify(woo);
  const mejor = auditoria.tokens[0] || null;
  const objetivo = auditoria.sinToken.filter((p) => !opts.soloProductoId || p.wooProductId === opts.soloProductoId);
  if (!objetivo.length) {
    return { auditoria, tokenUsado: null, reparados: [], errores: [], resumen: `Revisé ${auditoria.revisados} productos: ${auditoria.deDropi.length} son de Dropify y todos tienen token. No hay nada que reparar.` };
  }
  if (!mejor) {
    return {
      auditoria, tokenUsado: null, reparados: [], errores: [],
      resumen: `Hay ${objetivo.length} producto(s) de Dropify sin token (${objetivo.map((p) => `#${p.wooProductId} ${p.nombre}`).join(", ")}) y NINGÚN producto del catálogo tiene uno para copiar. Hay que volver a conectar Dropify con Dropi en WordPress (Dropify → token) o re-importar uno de esos productos desde Dropify.`,
    };
  }
  const reparados: number[] = [];
  const errores: Array<{ wooProductId: number; error: string }> = [];
  for (const p of objetivo) {
    try { await repararTokenDropify(woo, p.wooProductId, mejor.token); reparados.push(p.wooProductId); }
    catch (e: any) { errores.push({ wooProductId: p.wooProductId, error: String(e?.message || e).slice(0, 200) }); }
  }
  const integ = mejor.integracion;
  return {
    auditoria, tokenUsado: mejor.token, reparados, errores,
    resumen:
      `Revisé ${auditoria.revisados} productos: ${auditoria.deDropi.length} de Dropify, ${auditoria.sinToken.length} sin token. ` +
      `Reparé ${reparados.length} (${reparados.map((id) => `#${id}`).join(", ")}) copiando el token que usan ${mejor.usos} producto(s)` +
      (integ ? ` [tienda ${integ.tienda || "?"}, IP ${integ.ipAutorizada || "?"}, vence ${integ.vence || "?"}]` : "") + "." +
      (errores.length ? ` Fallaron ${errores.length}: ${errores.map((e) => `#${e.wooProductId} ${e.error}`).join(" · ")}.` : "") +
      " Ahora hay que reintentar en Dropi los pedidos rechazados (dropi_reintentar_pedido).",
  };
}
