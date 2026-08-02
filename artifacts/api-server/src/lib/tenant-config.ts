/**
 * Sistema de configuración multi-tenant con fallback en cascada
 * 
 * Orden de prioridad:
 * 1. Tenant settings (desde DB) - MÁXIMA PRIORIDAD
 * 2. Variables .env específicas del tenant: TENANT_1_FB_APP_ID
 * 3. Variables .env globales: FB_APP_ID
 * 4. Valores por defecto (solo para desarrollo)
 * 
 * Este sistema permite:
 * - Cada tenant configura sus credenciales en el dashboard
 * - El admin (tenant 1) puede usar .env para desarrollo local
 * - Las variables .env son fallback para cuando el tenant no configura
 * - Compatible con desarrollo local y producción
 */

import type { TenantContext } from "./tenantManager";
import { logger } from "./logger";

export interface FacebookConfig {
  appId?: string;
  appSecret?: string;
  pageId?: string;
  pageAccessToken?: string;
  adAccountId?: string;
  webhookVerifyToken?: string;
  messengerVerifyToken?: string;
  enabled: boolean;
}

export interface PaymentConfig {
  mercadopago?: {
    accessToken: string;
    publicKey?: string;
    enabled: boolean;
  };
  paypal?: {
    clientId: string;
    clientSecret: string;
    mode: "sandbox" | "live";
    enabled: boolean;
  };
  transfer?: {
    enabled: boolean;
    accounts: Array<{
      type: string;
      number: string;
      name: string;
    }>;
  };
}

export interface EmailConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  emailFrom?: string;
  emailTo?: string;
  enabled: boolean;
}

export interface APIKeysConfig {
  openai?: string;
  groq?: string;
  nvidia?: string;
  opencode?: string;
  opencodeZen?: string;
  github?: string;
  pexels?: string;
}

/**
 * Obtiene la configuración de Facebook con fallback
 */
export function getFacebookConfig(tenant?: TenantContext): FacebookConfig {
  // 1. Intentar desde tenant DB (prioridad máxima)
  if (tenant?.facebookIntegration && tenant.facebookIntegration.enabled) {
    logger.debug({ tenantId: tenant.id }, "[Config] Using Facebook config from tenant DB");
    return tenant.facebookIntegration as FacebookConfig;
  }

  // 2. Fallback a variables .env específicas del tenant
  const tenantId = tenant?.id || 1;
  const tenantPrefix = `TENANT_${tenantId}_`;
  
  const tenantSpecific = {
    appId: process.env[`${tenantPrefix}FB_APP_ID`],
    appSecret: process.env[`${tenantPrefix}FB_APP_SECRET`],
    pageId: process.env[`${tenantPrefix}FB_PAGE_ID`],
    pageAccessToken: process.env[`${tenantPrefix}FB_ACCESS_TOKEN`],
    adAccountId: process.env[`${tenantPrefix}FB_AD_ACCOUNT_ID`],
    webhookVerifyToken: process.env[`${tenantPrefix}FB_WEBHOOK_VERIFY_TOKEN`],
    messengerVerifyToken: process.env[`${tenantPrefix}FB_MESSENGER_VERIFY_TOKEN`],
  };

  if (tenantSpecific.appId && tenantSpecific.appSecret) {
    logger.debug({ tenantId }, "[Config] Using tenant-specific Facebook env vars");
    return {
      ...tenantSpecific,
      enabled: true,
    };
  }

  // 3. Fallback a variables .env globales
  const globalConfig = {
    appId: process.env.FB_APP_ID,
    appSecret: process.env.FB_APP_SECRET,
    pageId: process.env.FB_PAGE_ID,
    pageAccessToken: process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN,
    adAccountId: process.env.FB_AD_ACCOUNT_ID,
    webhookVerifyToken: process.env.FB_WEBHOOK_VERIFY_TOKEN,
    messengerVerifyToken: process.env.FB_MESSENGER_VERIFY_TOKEN,
    enabled: !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET),
  };

  if (globalConfig.enabled) {
    logger.debug({ tenantId }, "[Config] Using global Facebook env vars");
  }

  return globalConfig;
}

/**
 * Obtiene la configuración de pagos con fallback
 */
export function getPaymentConfig(tenant?: TenantContext): PaymentConfig {
  const config: PaymentConfig = {};

  // 1. Desde tenant DB
  if (tenant?.paymentMethods) {
    logger.debug({ tenantId: tenant.id }, "[Config] Using payment config from tenant DB");
    return tenant.paymentMethods as PaymentConfig;
  }

  // 2. Fallback a variables .env
  const tenantId = tenant?.id || 1;
  const tenantPrefix = `TENANT_${tenantId}_`;

  // Mercado Pago
  const mpToken = process.env[`${tenantPrefix}MERCADO_PAGO_ACCESS_TOKEN`] || process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (mpToken) {
    config.mercadopago = {
      accessToken: mpToken,
      publicKey: process.env[`${tenantPrefix}MERCADO_PAGO_PUBLIC_KEY`] || process.env.MERCADO_PAGO_PUBLIC_KEY,
      enabled: true,
    };
  }

  // PayPal
  const ppClientId = process.env[`${tenantPrefix}PAYPAL_CLIENT_ID`] || process.env.PAYPAL_CLIENT_ID;
  const ppSecret = process.env[`${tenantPrefix}PAYPAL_CLIENT_SECRET`] || process.env.PAYPAL_CLIENT_SECRET;
  if (ppClientId && ppSecret) {
    config.paypal = {
      clientId: ppClientId,
      clientSecret: ppSecret,
      mode: (process.env[`${tenantPrefix}PAYPAL_MODE`] || process.env.PAYPAL_MODE || "live") as "sandbox" | "live",
      enabled: true,
    };
  }

  // Transferencia
  const transferNumber = process.env[`${tenantPrefix}TRANSFER_NUMBER`] || process.env.TRANSFER_NUMBER;
  const transferName = process.env[`${tenantPrefix}TRANSFER_NAME`] || process.env.TRANSFER_NAME;
  if (transferNumber) {
    config.transfer = {
      enabled: true,
      accounts: [
        {
          type: "Nequi",
          number: transferNumber,
          name: transferName || "Cuenta principal",
        },
      ],
    };
  }

  return config;
}

/**
 * Obtiene la configuración de email con fallback
 */
export function getEmailConfig(tenant?: TenantContext): EmailConfig {
  // 1. Desde tenant DB
  if (tenant?.emailConfig && tenant.emailConfig.enabled) {
    logger.debug({ tenantId: tenant.id }, "[Config] Using email config from tenant DB");
    return tenant.emailConfig as EmailConfig;
  }

  // 2. Fallback a variables .env
  const tenantId = tenant?.id || 1;
  const tenantPrefix = `TENANT_${tenantId}_`;

  const smtpHost = process.env[`${tenantPrefix}SMTP_HOST`] || process.env.SMTP_HOST;
  const smtpUser = process.env[`${tenantPrefix}SMTP_USER`] || process.env.SMTP_USER;

  if (smtpHost && smtpUser) {
    return {
      smtpHost,
      smtpPort: parseInt(process.env[`${tenantPrefix}SMTP_PORT`] || process.env.SMTP_PORT || "587"),
      smtpUser,
      smtpPassword: process.env[`${tenantPrefix}SMTP_PASS`] || process.env.SMTP_PASS,
      emailFrom: process.env[`${tenantPrefix}EMAIL_FROM`] || process.env.EMAIL_FROM,
      emailTo: process.env[`${tenantPrefix}EMAIL_TO`] || process.env.EMAIL_TO,
      enabled: true,
    };
  }

  return { enabled: false };
}

/**
 * Obtiene las API keys con fallback
 */
export function getAPIKeys(tenant?: TenantContext): APIKeysConfig {
  // 1. Desde tenant DB
  if (tenant?.apiKeys) {
    logger.debug({ tenantId: tenant.id }, "[Config] Using API keys from tenant DB");
    return tenant.apiKeys as APIKeysConfig;
  }

  // 2. Fallback a variables .env
  const tenantId = tenant?.id || 1;
  const tenantPrefix = `TENANT_${tenantId}_`;

  return {
    openai: process.env[`${tenantPrefix}OPENAI_API_KEY`] || process.env.OPENAI_API_KEY,
    groq: process.env[`${tenantPrefix}GROQ_API_KEY`] || process.env.GROQ_API_KEY,
    nvidia: process.env[`${tenantPrefix}NVIDIA_API_KEY`] || process.env.NVIDIA_API_KEY,
    opencode: process.env[`${tenantPrefix}OPENCODE_API_KEY`] || process.env.OPENCODE_API_KEY,
    opencodeZen: process.env[`${tenantPrefix}OPENCODE_ZEN_API_KEY`] || process.env.OPENCODE_ZEN_API_KEY,
    github: process.env[`${tenantPrefix}GITHUB_TOKEN`] || process.env.GITHUB_TOKEN,
    pexels: process.env[`${tenantPrefix}PEXELS_API_KEY`] || process.env.PEXELS_API_KEY,
  };
}

/**
 * Valida que una configuración tenga las credenciales mínimas necesarias
 */
export function validateFacebookConfig(config: FacebookConfig): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!config.appId) missing.push("appId");
  if (!config.appSecret) missing.push("appSecret");
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

export function validatePaymentConfig(config: PaymentConfig): { valid: boolean; message: string } {
  const hasMercadoPago = config.mercadopago?.enabled;
  const hasPayPal = config.paypal?.enabled;
  const hasTransfer = config.transfer?.enabled;

  if (!hasMercadoPago && !hasPayPal && !hasTransfer) {
    return {
      valid: false,
      message: "No hay métodos de pago configurados",
    };
  }

  return { valid: true, message: "OK" };
}

export function validateEmailConfig(config: EmailConfig): { valid: boolean; missing: string[] } {
  if (!config.enabled) {
    return { valid: false, missing: ["enabled"] };
  }

  const missing: string[] = [];
  
  if (!config.smtpHost) missing.push("smtpHost");
  if (!config.smtpUser) missing.push("smtpUser");
  if (!config.smtpPassword) missing.push("smtpPassword");
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
