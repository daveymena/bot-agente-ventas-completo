/**
 * Dispatcher de integraciones: una sola puerta para rutas y Atlas.
 *
 *  · `estado()` — qué plataformas están conectadas (sin secretos).
 *  · `importar()` — productos de la plataforma → `products`.
 *  · `publicar()` — producto interno → vitrina externa.
 *  · `traerPedidos()` — pedidos externos → pedidos internos (sin despacho).
 */
import { logger } from "../logger";
import { leerCredenciales, guardarCredenciales } from "./credenciales";
import { importarProductos } from "./importador";
import { importarPedidos, resolvedorPorSku } from "./pedidos";
import type { Plataforma, ResultadoImport, ResultadoPedidos } from "./tipos";

export { estadoIntegraciones, guardarCredenciales, borrarCredenciales } from "./credenciales";
export { skuDe, PLATAFORMAS } from "./tipos";
export type { Plataforma, ProductoExterno, PedidoExterno, ResultadoImport, ResultadoPedidos } from "./tipos";

async function cred(tenantId: number, plataforma: Plataforma, campos: string[]): Promise<any> {
  const c: any = await leerCredenciales(tenantId, plataforma);
  if (!c || c.activa === false) throw new Error(`Integración ${plataforma} no configurada o apagada.`);
  for (const campo of campos) {
    if (!c[campo]) throw new Error(`Integración ${plataforma} incompleta: falta ${campo}.`);
  }
  return c;
}

export async function importar(tenantId: number, plataforma: Plataforma, opts: { consulta?: string; limite?: number } = {}): Promise<ResultadoImport> {
  const limite = Math.min(Math.max(Number(opts.limite) || 50, 1), 250);
  if (plataforma === "shopify") {
    const c = await cred(tenantId, "shopify", ["tienda", "token"]);
    const s = await import("./shopify");
    const productos = await s.listarProductos({ tienda: c.tienda, token: c.token, moneda: c.moneda }, limite);
    return importarProductos(tenantId, plataforma, productos, c.moneda || "COP");
  }
  if (plataforma === "aliexpress") {
    const c = await cred(tenantId, "aliexpress", ["tienda", "token"]);
    if (!opts.consulta) throw new Error("AliExpress necesita 'consulta' (qué buscar).");
    const a = await import("./aliexpress");
    const productos = await a.buscarProductos(
      { appKey: c.tienda, appSecret: c.token, trackingId: c.secreto },
      opts.consulta,
      { porPagina: limite, moneda: c.moneda || "COP" },
    );
    return importarProductos(tenantId, plataforma, productos, c.moneda || "COP");
  }
  if (plataforma === "mercadolibre") {
    const c = await cred(tenantId, "mercadolibre", ["tienda", "token"]);
    const m = await import("./mercadolibre");
    const t = await m.tokenValido({ clientId: c.tienda, clientSecret: c.token, accessToken: c.secreto, refreshToken: c.refresh, expiraEn: c.expiraEn });
    if (t.rotado) {
      await guardarCredenciales(tenantId, "mercadolibre", { secreto: t.rotado.accessToken, refresh: t.rotado.refreshToken, expiraEn: t.rotado.expiraEn });
    }
    const vendedorId = c.vendedorId || "";
    if (!vendedorId) throw new Error("Falta el seller id de Mercado Libre (se guarda al autorizar).");
    const ids = await m.listarIds(t.token, vendedorId, limite);
    const productos = await m.leerItems(t.token, ids);
    return importarProductos(tenantId, plataforma, productos, c.moneda || "COP");
  }
  throw new Error(`Importar desde ${plataforma} todavía no está implementado (Falabella es fase 4).`);
}

export async function publicar(
  tenantId: number,
  plataforma: Plataforma,
  producto: { nombre: string; descripcion: string; precio: number; moneda?: string; imagenes: string[]; variantes?: string[]; categoriaId?: string; stock?: number },
): Promise<{ id: string; link?: string }> {
  if (plataforma === "shopify") {
    const c = await cred(tenantId, "shopify", ["tienda", "token"]);
    const s = await import("./shopify");
    return s.publicarProducto({ tienda: c.tienda, token: c.token }, producto);
  }
  if (plataforma === "mercadolibre") {
    const c = await cred(tenantId, "mercadolibre", ["tienda", "token"]);
    if (!producto.categoriaId) throw new Error("Mercado Libre exige categoría: primero pedí la sugerida (sugerirCategoria).");
    const m = await import("./mercadolibre");
    const t = await m.tokenValido({ clientId: c.tienda, clientSecret: c.token, accessToken: c.secreto, refreshToken: c.refresh, expiraEn: c.expiraEn });
    if (t.rotado) {
      await guardarCredenciales(tenantId, "mercadolibre", { secreto: t.rotado.accessToken, refresh: t.rotado.refreshToken, expiraEn: t.rotado.expiraEn });
    }
    return m.publicarItem(t.token, {
      titulo: producto.nombre, precio: producto.precio, moneda: producto.moneda || c.moneda || "COP",
      categoriaId: producto.categoriaId, imagenes: producto.imagenes, stock: producto.stock, descripcion: producto.descripcion,
    });
  }
  if (plataforma === "aliexpress") {
    throw new Error("AliExpress es fuente de compra (fotos, video, proveedor), no vitrina: no se publica allá.");
  }
  throw new Error(`Publicar en ${plataforma} todavía no está implementado (Falabella es fase 4).`);
}

export async function traerPedidos(tenantId: number, plataforma: Plataforma, limite = 50): Promise<ResultadoPedidos> {
  const n = Math.min(Math.max(Number(limite) || 50, 1), 100);
  const resolver = resolvedorPorSku(tenantId, plataforma);
  if (plataforma === "shopify") {
    const c = await cred(tenantId, "shopify", ["tienda", "token"]);
    const s = await import("./shopify");
    const pedidos = await s.listarPedidos({ tienda: c.tienda, token: c.token }, n);
    return importarPedidos(tenantId, plataforma, pedidos, resolver);
  }
  if (plataforma === "mercadolibre") {
    const c = await cred(tenantId, "mercadolibre", ["tienda", "token"]);
    const m = await import("./mercadolibre");
    const t = await m.tokenValido({ clientId: c.tienda, clientSecret: c.token, accessToken: c.secreto, refreshToken: c.refresh, expiraEn: c.expiraEn });
    if (t.rotado) {
      await guardarCredenciales(tenantId, "mercadolibre", { secreto: t.rotado.accessToken, refresh: t.rotado.refreshToken, expiraEn: t.rotado.expiraEn });
    }
    const pedidos = await m.listarOrdenes(t.token, c.vendedorId || "", n);
    return importarPedidos(tenantId, plataforma, pedidos, resolver);
  }
  if (plataforma === "falabella") {
    const c = await cred(tenantId, "falabella", ["tienda", "token"]);
    const f = await import("./falabella");
    // El endpoint varía por país; si el dueño lo pegó en `moneda` como URL se
    // respeta, si no va el de defecto (ver falabella.ts, fase 4).
    const endpoint = /^https?:\/\//.test(c.moneda || "") ? c.moneda : undefined;
    const pedidos = await f.listarOrdenes({ sellerId: c.tienda, apiKey: c.token, endpoint }, n);
    return importarPedidos(tenantId, plataforma, pedidos, resolver);
  }
  throw new Error(`Traer pedidos de ${plataforma} todavía no está implementado (AliExpress requiere OAuth del comprador + aprobación).`);
}

/** Busca el tenant dueño de una tienda externa (para webhooks sin sesión). */
export async function tenantPorTienda(plataforma: Plataforma, tienda: string): Promise<number | null> {
  try {
    const { db, tenants } = await import("@workspace/db");
    const filas: any[] = await db.select({ id: tenants.id, metadata: tenants.metadata }).from(tenants).limit(500);
    const buscada = String(tienda || "").trim().toLowerCase();
    for (const f of filas) {
      let meta: any = (f as any).metadata;
      if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { continue; } }
      const guardada = String(meta?.integraciones?.[plataforma]?.tienda || "").toLowerCase();
      if (guardada && (guardada === buscada || buscada.includes(guardada) || guardada.includes(buscada))) {
        return (f as any).id;
      }
    }
    return null;
  } catch (e: any) {
    logger.warn({ err: e?.message, plataforma }, "[Integraciones] no se pudo resolver el tenant por tienda");
    return null;
  }
}

/** Busca el tenant por seller id de ML (para notificaciones sin sesión). */
export async function tenantPorVendedorMl(vendedorId: string): Promise<number | null> {
  try {
    const { db, tenants } = await import("@workspace/db");
    const filas: any[] = await db.select({ id: tenants.id, metadata: tenants.metadata }).from(tenants).limit(500);
    for (const f of filas) {
      let meta: any = (f as any).metadata;
      if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { continue; } }
      if (String(meta?.integraciones?.mercadolibre?.vendedorId || "") === String(vendedorId)) return (f as any).id;
    }
    return null;
  } catch {
    return null;
  }
}
