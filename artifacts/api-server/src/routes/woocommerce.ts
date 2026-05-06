// @ts-nocheck
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
    const tenantId = req.tenantId;

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
    const tenantId = req.tenantId;
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
    const tenantId = req.tenantId;

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
    const tenantId = req.tenantId;

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
    const tenantId = req.tenantId;
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
 * POST /api/woocommerce/create-order
 * Crear orden en WooCommerce
 */
router.post("/create-order", async (req, res) => {
  try {
    const tenantId = req.tenantId;
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
