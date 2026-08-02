/**
 * API Routes para configuración SaaS multi-tenant
 * 
 * Permite a cada tenant configurar:
 * - Integraciones de Facebook (Ads, Messenger, Marketplace)
 * - Métodos de pago (Mercado Pago, PayPal, Transferencia)
 * - Configuración de email/SMTP
 * - API keys personalizadas
 */

import { Router, type IRouter } from "express";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  getFacebookConfig,
  getPaymentConfig,
  getEmailConfig,
  getAPIKeys,
  validateFacebookConfig,
  validatePaymentConfig,
  validateEmailConfig,
  type FacebookConfig,
  type PaymentConfig,
  type EmailConfig,
  type APIKeysConfig,
} from "../lib/tenant-config";

const router: IRouter = Router();

/**
 * GET /api/tenant-config/facebook
 * Obtiene la configuración actual de Facebook
 */
router.get("/facebook", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const config = getFacebookConfig(tenant);
    const validation = validateFacebookConfig(config);

    // No devolver el appSecret por seguridad
    const { appSecret, ...safeConfig } = config;

    return res.json({
      config: {
        ...safeConfig,
        appSecret: appSecret ? "***" + appSecret.slice(-4) : undefined,
      },
      validation,
      source: tenant.facebookIntegration ? "database" : "env",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error getting Facebook config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/tenant-config/facebook
 * Actualiza la configuración de Facebook
 */
router.put("/facebook", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const {
      appId,
      appSecret,
      pageId,
      pageAccessToken,
      adAccountId,
      webhookVerifyToken,
      messengerVerifyToken,
      enabled,
    } = req.body;

    const newConfig: FacebookConfig = {
      appId,
      appSecret,
      pageId,
      pageAccessToken,
      adAccountId,
      webhookVerifyToken,
      messengerVerifyToken,
      enabled: enabled ?? true,
    };

    const validation = validateFacebookConfig(newConfig);
    if (!validation.valid && enabled !== false) {
      return res.status(400).json({
        error: "Invalid configuration",
        missing: validation.missing,
      });
    }

    await db
      .update(tenants)
      .set({
        facebookIntegration: newConfig,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ tenantId: tenant.id }, "[TenantConfig] Facebook config updated");

    return res.json({
      success: true,
      message: "Facebook configuration updated",
      config: newConfig,
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error updating Facebook config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tenant-config/payments
 * Obtiene la configuración de métodos de pago
 */
router.get("/payments", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const config = getPaymentConfig(tenant);
    const validation = validatePaymentConfig(config);

    // Ocultar credenciales sensibles
    const safeConfig = {
      mercadopago: config.mercadopago ? {
        ...config.mercadopago,
        accessToken: config.mercadopago.accessToken ? "***" + config.mercadopago.accessToken.slice(-4) : undefined,
      } : undefined,
      paypal: config.paypal ? {
        ...config.paypal,
        clientSecret: config.paypal.clientSecret ? "***" + config.paypal.clientSecret.slice(-4) : undefined,
      } : undefined,
      transfer: config.transfer,
    };

    return res.json({
      config: safeConfig,
      validation,
      source: tenant.paymentMethods ? "database" : "env",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error getting payment config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/tenant-config/payments
 * Actualiza la configuración de métodos de pago
 */
router.put("/payments", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const { mercadopago, paypal, transfer } = req.body;

    const newConfig: PaymentConfig = {
      mercadopago,
      paypal,
      transfer,
    };

    const validation = validatePaymentConfig(newConfig);
    if (!validation.valid) {
      return res.status(400).json({
        error: "Invalid configuration",
        message: validation.message,
      });
    }

    await db
      .update(tenants)
      .set({
        paymentMethods: newConfig,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ tenantId: tenant.id }, "[TenantConfig] Payment config updated");

    return res.json({
      success: true,
      message: "Payment configuration updated",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error updating payment config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tenant-config/email
 * Obtiene la configuración de email/SMTP
 */
router.get("/email", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const config = getEmailConfig(tenant);
    const validation = validateEmailConfig(config);

    // Ocultar contraseña SMTP
    const safeConfig = {
      ...config,
      smtpPassword: config.smtpPassword ? "***" + config.smtpPassword.slice(-4) : undefined,
    };

    return res.json({
      config: safeConfig,
      validation,
      source: tenant.emailConfig ? "database" : "env",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error getting email config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/tenant-config/email
 * Actualiza la configuración de email/SMTP
 */
router.put("/email", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const {
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword,
      emailFrom,
      emailTo,
      enabled,
    } = req.body;

    const newConfig: EmailConfig = {
      smtpHost,
      smtpPort: smtpPort ? parseInt(smtpPort) : undefined,
      smtpUser,
      smtpPassword,
      emailFrom,
      emailTo,
      enabled: enabled ?? true,
    };

    const validation = validateEmailConfig(newConfig);
    if (!validation.valid && enabled !== false) {
      return res.status(400).json({
        error: "Invalid configuration",
        missing: validation.missing,
      });
    }

    await db
      .update(tenants)
      .set({
        emailConfig: newConfig,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ tenantId: tenant.id }, "[TenantConfig] Email config updated");

    return res.json({
      success: true,
      message: "Email configuration updated",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error updating email config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tenant-config/api-keys
 * Obtiene las API keys configuradas
 */
router.get("/api-keys", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const config = getAPIKeys(tenant);

    // Ocultar las keys completas
    const safeConfig: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(config)) {
      if (value) {
        safeConfig[key] = "***" + value.slice(-4);
      } else {
        safeConfig[key] = undefined;
      }
    }

    return res.json({
      config: safeConfig,
      source: tenant.apiKeys ? "database" : "env",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error getting API keys");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/tenant-config/api-keys
 * Actualiza las API keys
 */
router.put("/api-keys", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const {
      openai,
      groq,
      nvidia,
      opencode,
      opencodeZen,
      github,
      pexels,
    } = req.body;

    const newConfig: APIKeysConfig = {
      openai,
      groq,
      nvidia,
      opencode,
      opencodeZen,
      github,
      pexels,
    };

    await db
      .update(tenants)
      .set({
        apiKeys: newConfig,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ tenantId: tenant.id }, "[TenantConfig] API keys updated");

    return res.json({
      success: true,
      message: "API keys updated",
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error updating API keys");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/tenant-config/all
 * Obtiene toda la configuración del tenant
 */
router.get("/all", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "No tenant found" });
    }

    const facebook = getFacebookConfig(tenant);
    const payments = getPaymentConfig(tenant);
    const email = getEmailConfig(tenant);
    const apiKeys = getAPIKeys(tenant);

    // Ocultar credenciales sensibles
    const { appSecret, ...safeFacebook } = facebook;
    const safePayments = {
      mercadopago: payments.mercadopago ? {
        ...payments.mercadopago,
        accessToken: payments.mercadopago.accessToken ? "***" + payments.mercadopago.accessToken.slice(-4) : undefined,
      } : undefined,
      paypal: payments.paypal ? {
        ...payments.paypal,
        clientSecret: payments.paypal.clientSecret ? "***" + payments.paypal.clientSecret.slice(-4) : undefined,
      } : undefined,
      transfer: payments.transfer,
    };
    const safeEmail = {
      ...email,
      smtpPassword: email.smtpPassword ? "***" + email.smtpPassword.slice(-4) : undefined,
    };
    const safeApiKeys: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(apiKeys)) {
      if (value) {
        safeApiKeys[key] = "***" + value.slice(-4);
      }
    }

    return res.json({
      tenant: {
        id: tenant.id,
        email: tenant.email,
        name: tenant.name,
        plan: tenant.plan,
        isAdmin: tenant.isAdmin || false,
      },
      facebook: {
        ...safeFacebook,
        appSecret: appSecret ? "***" + appSecret.slice(-4) : undefined,
      },
      payments: safePayments,
      email: safeEmail,
      apiKeys: safeApiKeys,
      validations: {
        facebook: validateFacebookConfig(facebook),
        payments: validatePaymentConfig(payments),
        email: validateEmailConfig(email),
      },
    });
  } catch (err) {
    logger.error({ err }, "[TenantConfig] Error getting all config");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
