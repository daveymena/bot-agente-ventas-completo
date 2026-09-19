import { Router } from "express";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getWooCommerceService, WooCommerceService } from "../lib/woocommerce";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/woocommerce/config
 * Obtener configuración de WooCommerce
 */
router.get("/config", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }

    const config = tenant.woocommerceIntegration || {
      enabled: false,
      storeUrl: "",
      consumerKey: "",
      consumerSecret: "",
      syncProducts: false,
      autoCreateOrders: false,
      syncInterval: 60,
      lastSync: null,
    };

    // No enviar las credenciales completas al frontend
    res.json({
      enabled: config.enabled,
      storeUrl: config.storeUrl,
      consumerKey: config.consumerKey ? "••••••••" : "",
      consumerSecret: config.consumerSecret ? "••••••••" : "",
      syncProducts: config.syncProducts,
      autoCreateOrders: config.autoCreateOrders,
      syncInterval: config.syncInterval,
      lastSync: config.lastSync,
      hasCredentials: !!(config.consumerKey && config.consumerSecret),
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error obteniendo configuración");
    res.status(500).json({ error: "Error obteniendo configuración" });
  }
});

/**
 * PUT /api/woocommerce/config
 * Actualizar configuración de WooCommerce
 */
router.put("/config", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    const {
      enabled,
      storeUrl,
      consumerKey,
      consumerSecret,
      syncProducts,
      autoCreateOrders,
      syncInterval,
    } = req.body;

    // Validaciones
    if (enabled && (!storeUrl || !consumerKey || !consumerSecret)) {
      return res.status(400).json({
        error: "Se requiere storeUrl, consumerKey y consumerSecret para habilitar la integración",
      });
    }

    // Obtener configuración actual
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const currentConfig = (tenant.woocommerceIntegration as any) || {};

    // Actualizar configuración
    const newConfig = {
      enabled: enabled ?? currentConfig.enabled ?? false,
      storeUrl: storeUrl || currentConfig.storeUrl || "",
      consumerKey:
        consumerKey && consumerKey !== "••••••••"
          ? consumerKey
          : currentConfig.consumerKey || "",
      consumerSecret:
        consumerSecret && consumerSecret !== "••••••••"
          ? consumerSecret
          : currentConfig.consumerSecret || "",
      syncProducts: syncProducts ?? currentConfig.syncProducts ?? false,
      autoCreateOrders: autoCreateOrders ?? currentConfig.autoCreateOrders ?? false,
      syncInterval: syncInterval || currentConfig.syncInterval || 60,
      lastSync: currentConfig.lastSync || null,
    };

    await db
      .update(tenants)
      .set({ woocommerceIntegration: newConfig })
      .where(eq(tenants.id, tenantId));

    logger.info({ tenantId }, "[WooCommerce] Configuración actualizada");

    res.json({
      message: "Configuración actualizada exitosamente",
      config: {
        ...newConfig,
        consumerKey: newConfig.consumerKey ? "••••••••" : "",
        consumerSecret: newConfig.consumerSecret ? "••••••••" : "",
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error actualizando configuración");
    res.status(500).json({ error: "Error actualizando configuración" });
  }
});

/**
 * POST /api/woocommerce/test-connection
 * Probar conexión con WooCommerce
 */
router.post("/test-connection", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;

    const wooService = await getWooCommerceService(tenantId);

    if (!wooService) {
      return res.status(400).json({
        error: "Integración de WooCommerce no configurada o deshabilitada",
      });
    }

    // Intentar obtener productos para probar la conexión
    const products = await wooService.getProducts({ per_page: 1 });

    res.json({
      success: true,
      message: "Conexión exitosa con WooCommerce",
      productsCount: products.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error probando conexión");
    res.status(500).json({
      success: false,
      error: "Error conectando con WooCommerce",
      details: error.message,
    });
  }
});

/**
 * POST /api/woocommerce/sync-products
 * Sincronizar productos desde WooCommerce
 */
router.post("/sync-products", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;

    const wooService = await getWooCommerceService(tenantId);

    if (!wooService) {
      return res.status(400).json({
        error: "Integración de WooCommerce no configurada o deshabilitada",
      });
    }

    const result = await wooService.syncProducts();

    res.json({
      success: true,
      message: "Sincronización completada",
      synced: result.synced,
      errors: result.errors,
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error sincronizando productos");
    res.status(500).json({
      success: false,
      error: "Error sincronizando productos",
      details: error.message,
    });
  }
});

/**
 * GET /api/woocommerce/products
 * Obtener productos de WooCommerce
 */
router.get("/products", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    const { page = 1, per_page = 20 } = req.query;

    const wooService = await getWooCommerceService(tenantId);

    if (!wooService) {
      return res.status(400).json({
        error: "Integración de WooCommerce no configurada o deshabilitada",
      });
    }

    const products = await wooService.getProducts({
      page: parseInt(page as string),
      per_page: parseInt(per_page as string),
    });

    res.json({
      success: true,
      products,
      count: products.length,
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error obteniendo productos");
    res.status(500).json({
      success: false,
      error: "Error obteniendo productos",
      details: error.message,
    });
  }
});

/**
 * GET /api/woocommerce/estado
 * Conexión, últimos pedidos en WooCommerce y pedidos que tomó el bot con su
 * resultado. Misma fuente que la herramienta `woocommerce_estado` de Atlas.
 */
router.get("/estado", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const { estadoWooCommerce } = await import("../lib/woocommerce-estado");
    res.json(await estadoWooCommerce(tenantId));
  } catch (error: any) {
    logger.error({ error: error.message }, "[WooCommerce] Error leyendo el estado");
    res.status(500).json({ success: false, error: error.message });
  }
});

/** GET /api/woocommerce/dropify/producto/:wooProductId — ¿qué dice Dropi HOY de este producto? (diagnóstico, solo lectura) */
router.get("/dropify/producto/:wooProductId", async (req: any, res: any) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const woo = await getWooCommerceService(tenantId);
    if (!woo) return res.status(400).json({ error: "WooCommerce no configurado" });
    const { credencialesDropiDesdeWoo, consultarProductoEnDropi } = await import("../lib/dropi-integracion");
    const cred = await credencialesDropiDesdeWoo(woo, Number(req.params.wooProductId));
    if (!cred.dropiProductId || !cred.token) return res.json({ ok: false, error: "El producto no tiene id de Dropi o token de integración", cred: { dropiProductId: cred.dropiProductId, token: !!cred.token } });
    const r = await consultarProductoEnDropi(cred.dropiProductId, cred.token);
    res.json({ ok: r.ok, dropiProductId: cred.dropiProductId, status: r.status, error: r.error, data: r.data });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** GET /api/woocommerce/dropify/tokens — auditoría (solo lectura). */
router.get("/dropify/tokens", async (req: any, res: any) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const woo = await getWooCommerceService(tenantId);
    if (!woo) return res.status(400).json({ error: "WooCommerce no configurado" });
    const { auditarTokensDropify } = await import("../lib/dropify-tokens");
    const a = await auditarTokensDropify(woo);
    res.json({ revisados: a.revisados, deDropi: a.deDropi.length, sinToken: a.sinToken.map((p) => ({ id: p.wooProductId, nombre: p.nombre })), tokens: a.tokens.map((t) => ({ usos: t.usos, integracion: t.integracion })) });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/** POST /api/woocommerce/dropify/reparar-tokens — copia el token válido a los productos sin token. */
router.post("/dropify/reparar-tokens", async (req: any, res: any) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const woo = await getWooCommerceService(tenantId);
    if (!woo) return res.status(400).json({ error: "WooCommerce no configurado" });
    const { repararTokensDropify } = await import("../lib/dropify-tokens");
    const r = await repararTokensDropify(woo, { soloProductoId: Number(req.body?.wooProductId) || null });
    res.json({ ok: r.errores.length === 0, resumen: r.resumen, reparados: r.reparados, errores: r.errores });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/woocommerce/reintentar-dropi/:pedidoId
 * Reenvía a Dropi un pedido del bot que ya está en Woo (ver reintentarEnDropi).
 */
router.post("/reintentar-dropi/:pedidoId", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const pedidoId = Number(req.params.pedidoId);
    if (!pedidoId) return res.status(400).json({ error: "pedidoId inválido" });
    const { reintentarEnDropi } = await import("../lib/dropshipping");
    res.json(await reintentarEnDropi(tenantId, pedidoId, { conProductoId: Number(req.body?.productoId) || null }));
  } catch (error: any) {
    logger.error({ error: error.message }, "[WooCommerce] Error reintentando en Dropi");
    res.status(500).json({ ok: false, error: error.message });
  }
});

/**
 * POST /api/woocommerce/create-order
 * Crear orden en WooCommerce
 */
router.post("/create-order", async (req, res) => {
  try {
    const tenantId = req.tenant?.id;
    const { productId, customerName, customerEmail, customerPhone, quantity, paymentMethod } =
      req.body;

    if (!productId || !customerName || !customerPhone) {
      return res.status(400).json({
        error: "Se requiere productId, customerName y customerPhone",
      });
    }

    const wooService = await getWooCommerceService(tenantId);

    if (!wooService) {
      return res.status(400).json({
        error: "Integración de WooCommerce no configurada o deshabilitada",
      });
    }

    const order = await wooService.createOrderFromConversation({
      productId,
      customerName,
      customerEmail,
      customerPhone,
      quantity,
      paymentMethod,
    });

    res.json({
      success: true,
      message: "Orden creada exitosamente",
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        orderUrl: order.permalink || `${order._links?.self?.[0]?.href}`,
      },
    });
  } catch (error) {
    logger.error({ error: error.message }, "[WooCommerce] Error creando orden");
    res.status(500).json({
      success: false,
      error: "Error creando orden",
      details: error.message,
    });
  }
});

export default router;
