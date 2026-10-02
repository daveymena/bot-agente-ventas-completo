/**
 * Rutas de integraciones.
 *
 *  · `integracionesRouter` (montado en /api/integraciones): CON sesión, el
 *    dueño conecta su tienda, importa, publica y trae pedidos.
 *  · `integracionesWebhooksRouter` (montado en /api/integraciones/webhooks):
 *    PÚBLICO (va en `publicRoutes` de app.ts), lo llaman Shopify y Mercado
 *    Libre. Cada handler verifica la firma y resuelve el tenant SIN sesión
 *    (por dominio de tienda o seller id guardado).
 */
import { Router, type Request, type Response } from "express";
import { db, products } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import { PLATAFORMAS, type Plataforma } from "../lib/integraciones/tipos";
import {
  estadoIntegraciones, guardarCredenciales, borrarCredenciales,
  importar, publicar, traerPedidos, tenantPorTienda, tenantPorVendedorMl,
} from "../lib/integraciones/index";
import { leerCredenciales } from "../lib/integraciones/credenciales";
import { importarPedidos, resolvedorPorSku } from "../lib/integraciones/pedidos";

export const integracionesRouter = Router();
export const integracionesWebhooksRouter = Router();

function plataforma(req: Request): Plataforma | null {
  const p = String(req.params.plataforma || "").toLowerCase();
  if (!(PLATAFORMAS as string[]).includes(p)) return null;
  return p as Plataforma;
}

function tenantId(req: Request): number | null {
  const id = Number((req as any).tenant?.id) || 0;
  return id || null;
}

function sinTenant(res: Response) {
  return res.status(401).json({ error: "Sin sesión" });
}

function plataformaInvalida(res: Response) {
  return res.status(400).json({ error: `Plataforma inválida. Usá: ${PLATAFORMAS.join(", ")}` });
}

/** GET /api/integraciones/estado — qué está conectado (sin secretos). */
integracionesRouter.get("/estado", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  return res.json({ success: true, integraciones: await estadoIntegraciones(t) });
});

/** PUT /api/integraciones/:plataforma — guardar credenciales (secretos se cifran). */
integracionesRouter.put("/:plataforma", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  try {
    const b = req.body || {};
    await guardarCredenciales(t, p, {
      tienda: b.tienda, token: b.token, secreto: b.secreto, refresh: b.refresh,
      expiraEn: b.expiraEn, moneda: b.moneda, vendedorId: b.vendedorId,
      activa: b.activa,
    });
    // Shopify: probar de una vez para no guardar un token muerto.
    if (p === "shopify" && b.token && b.tienda) {
      const s = await import("../lib/integraciones/shopify");
      const tienda = await s.probarConexion({ tienda: b.tienda, token: b.token });
      await guardarCredenciales(t, p, { moneda: tienda.moneda });
      return res.json({ success: true, tienda });
    }
    return res.json({ success: true });
  } catch (e: any) {
    logger.warn({ err: e?.message, plataforma: p }, "[Integraciones] no se pudo guardar");
    return res.status(400).json({ success: false, error: e?.message || "No se pudo guardar" });
  }
});

/** DELETE /api/integraciones/:plataforma — desconectar. */
integracionesRouter.delete("/:plataforma", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  await borrarCredenciales(t, p);
  return res.json({ success: true });
});

/** POST /api/integraciones/:plataforma/importar {consulta?, limite?} */
integracionesRouter.post("/:plataforma/importar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  try {
    const r = await importar(t, p, { consulta: req.body?.consulta, limite: req.body?.limite });
    return res.json({ success: true, ...r });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "No se pudo importar" });
  }
});

/** POST /api/integraciones/:plataforma/publicar {productId, categoriaId?} */
integracionesRouter.post("/:plataforma/publicar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  try {
    const productId = Number(req.body?.productId);
    if (!productId) return res.status(400).json({ success: false, error: "Falta productId (id interno)." });
    const [prod] = await db.select().from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, t))).limit(1);
    if (!prod) return res.status(404).json({ success: false, error: "Producto no encontrado en este negocio." });
    let meta: any = {};
    try { meta = JSON.parse(String((prod as any).metadata || "{}")); } catch { meta = {}; }
    const imagenes = [...(meta?.[p]?.imageUrls || []), (prod as any).imageUrl].filter(Boolean);
    const r = await publicar(t, p, {
      nombre: (prod as any).name,
      descripcion: String((prod as any).description || ""),
      precio: Number((prod as any).price) || 0,
      moneda: (prod as any).currency || "COP",
      imagenes,
      categoriaId: req.body?.categoriaId,
      stock: (prod as any).stock ?? undefined,
    });
    return res.json({ success: true, ...r });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "No se pudo publicar" });
  }
});

/** POST /api/integraciones/:plataforma/pedidos {limite?} — trae pedidos sin despachar. */
integracionesRouter.post("/:plataforma/pedidos", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  try {
    const r = await traerPedidos(t, p, req.body?.limite);
    return res.json({ success: true, ...r });
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "No se pudieron traer los pedidos" });
  }
});

/** GET /api/integraciones/:plataforma/webhook-url — la URL a pegar en la plataforma. */
integracionesRouter.get("/:plataforma/webhook-url", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  const p = plataforma(req); if (!p) return plataformaInvalida(res);
  const base = String(process.env.APP_URL || "").replace(/\/+$/, "");
  if (!base) return res.status(400).json({ success: false, error: "Falta APP_URL en el servidor." });
  return res.json({ success: true, url: `${base}/api/integraciones/webhooks/${p}` });
});

// ── Mercado Libre OAuth ─────────────────────────────────────────────

function redirectUri(): string {
  const base = String(process.env.APP_URL || "").replace(/\/+$/, "");
  // El callback vive en el router PÚBLICO, montado en /api/integraciones/webhooks.
  // Antes apuntaba a /api/integraciones/mercadolibre/callback, que no existe
  // (y necesita sesión): Mercado Libre volvía a un 404 y la conexión nunca se
  // guardaba. Esta misma URL es la que va en la app de developers.mercadolibre.
  return `${base}/api/integraciones/webhooks/mercadolibre/callback`;
}

/** GET /api/integraciones/mercadolibre/autorizar — redirige a Mercado Libre. */
integracionesRouter.get("/mercadolibre/autorizar", async (req, res) => {
  const t = tenantId(req); if (!t) return sinTenant(res);
  try {
    const c: any = await leerCredenciales(t, "mercadolibre");
    if (!c?.tienda || !c?.token) {
      return res.status(400).json({ success: false, error: "Primero guardá client_id (tienda) y client_secret (token) con PUT /api/integraciones/mercadolibre." });
    }
    const m = await import("../lib/integraciones/mercadolibre");
    // Se guarda a qué tenant volver: el callback es público (lo llama ML).
    const state = Buffer.from(JSON.stringify({ t })).toString("base64url");
    return res.redirect(m.urlAutorizacion(c.tienda, redirectUri()) + `&state=${state}`);
  } catch (e: any) {
    return res.status(400).json({ success: false, error: e?.message || "No se pudo autorizar" });
  }
});

/** GET /api/integraciones/mercadolibre/callback?code=...&state=... (PÚBLICO, lo llama ML). */
integracionesWebhooksRouter.get("/mercadolibre/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.status(400).send("Falta code.");
    let t: number | null = null;
    try { t = Number(JSON.parse(Buffer.from(String(req.query.state || ""), "base64url").toString()).t) || null; } catch { t = null; }
    if (!t) return res.status(400).send("Sesión perdida: volvé al panel e iniciá la conexión de nuevo.");
    const c: any = await leerCredenciales(t, "mercadolibre");
    if (!c?.tienda || !c?.token) return res.status(400).send("Faltan client_id/secret en el panel.");
    const m = await import("../lib/integraciones/mercadolibre");
    const tok = await m.intercambiarCodigo(c.tienda, c.token, code, redirectUri());
    await guardarCredenciales(t, "mercadolibre", {
      secreto: tok.accessToken, refresh: tok.refreshToken, expiraEn: tok.expiraEn, vendedorId: tok.vendedorId,
    });
    logger.info({ tenantId: t, vendedorId: tok.vendedorId }, "[Integraciones] Mercado Libre autorizado");
    // De vuelta al panel, a la página desde donde se conectó.
    return res.redirect("/integraciones?mercadolibre=conectado");
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Integraciones] falló el callback de Mercado Libre");
    return res.status(400).send(`No se pudo conectar: ${e?.message || e}`);
  }
});

// ── Webhooks entrantes (PÚBLICOS, con firma) ────────────────────────

/** POST /api/integraciones/webhooks/shopify — orders/create. */
integracionesWebhooksRouter.post("/shopify", async (req, res) => {
  try {
    const dominio = String(req.headers["x-shopify-shop-domain"] || "");
    const firma = String(req.headers["x-shopify-hmac-sha256"] || "");
    if (!dominio || !firma) return res.status(401).json({ error: "Sin firma" });
    const t = await tenantPorTienda("shopify", dominio);
    if (!t) return res.status(404).json({ error: "Tienda no conectada" });
    const c: any = await leerCredenciales(t, "shopify");
    const s = await import("../lib/integraciones/shopify");
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!s.firmaShopifyValida(rawBody as Buffer, c?.secreto || "", firma)) {
      logger.warn({ dominio }, "[Integraciones] webhook Shopify con firma inválida");
      return res.status(401).json({ error: "Firma inválida" });
    }
    const pedido = s.pedidoDelWebhook(req.body);
    const r = await importarPedidos(t, "shopify", [pedido], resolvedorPorSku(t, "shopify"));
    return res.json({ success: true, ...r });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Integraciones] webhook Shopify falló");
    return res.status(500).json({ success: false });
  }
});

/** POST /api/integraciones/webhooks/mercadolibre — notificaciones orders_v2. */
integracionesWebhooksRouter.post("/mercadolibre", async (req, res) => {
  try {
    const m = await import("../lib/integraciones/mercadolibre");
    const idOrden = m.idOrdenDeNotificacion(req.body);
    const vendedorId = String(req.body?.user_id || "");
    // El ping de prueba de ML trae topic distinto: se acusa recibo y listo.
    if (!idOrden || !vendedorId) return res.json({ success: true, ignorada: true });
    const t = await tenantPorVendedorMl(vendedorId);
    if (!t) return res.status(404).json({ error: "Vendedor no conectado" });
    const c: any = await leerCredenciales(t, "mercadolibre");
    const tok = await m.tokenValido({ clientId: c.tienda, clientSecret: c.token, accessToken: c.secreto, refreshToken: c.refresh, expiraEn: c.expiraEn });
    // La orden se LEE de la API (del body solo sale el id): un POST armado a
    // mano no puede inventar un pedido (misma regla que webhooks de pago).
    const pedido = await m.leerOrden(tok.token, idOrden);
    const r = await importarPedidos(t, "mercadolibre", [pedido], resolvedorPorSku(t, "mercadolibre"));
    return res.json({ success: true, ...r });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Integraciones] webhook Mercado Libre falló");
    return res.status(500).json({ success: false });
  }
});
