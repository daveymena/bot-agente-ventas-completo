#!/usr/bin/env node
/**
 * Script de migración: Mueve variables del .env a la configuración del tenant 1
 * 
 * Este script toma las credenciales actuales de .env y las migra a la BD
 * en el tenant 1 (usuario admin por defecto). Después de esto, el admin
 * puede configurar sus credenciales reales en el dashboard y otros tenants
 * pueden configurar las suyas independientemente.
 * 
 * Uso:
 *   node scripts/migrate-env-to-tenant.mjs
 *   node scripts/migrate-env-to-tenant.mjs --tenant-id=2
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del proyecto
config({ path: path.resolve(__dirname, "../.env") });

// Obtener tenant ID del argumento o usar 1 por defecto
const args = process.argv.slice(2);
const tenantIdArg = args.find(arg => arg.startsWith("--tenant-id="));
const TENANT_ID = tenantIdArg ? parseInt(tenantIdArg.split("=")[1]) : 1;

console.log(`\n🔄 Migrando variables de .env al tenant ${TENANT_ID}...\n`);

// Construir objeto de configuración desde .env
const config = {
  // Facebook Integration
  facebookIntegration: {
    appId: process.env.FB_APP_ID || undefined,
    appSecret: process.env.FB_APP_SECRET || undefined,
    pageId: process.env.FB_PAGE_ID || undefined,
    pageAccessToken: process.env.FB_ACCESS_TOKEN || process.env.FB_MESSENGER_PAGE_TOKEN || undefined,
    adAccountId: process.env.FB_AD_ACCOUNT_ID || undefined,
    webhookVerifyToken: process.env.FB_WEBHOOK_VERIFY_TOKEN || undefined,
    messengerVerifyToken: process.env.FB_MESSENGER_VERIFY_TOKEN || undefined,
    enabled: !!(process.env.FB_APP_ID && process.env.FB_APP_SECRET),
  },

  // Payment Methods
  paymentMethods: {
    mercadopago: process.env.MERCADO_PAGO_ACCESS_TOKEN ? {
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN,
      publicKey: process.env.MERCADO_PAGO_PUBLIC_KEY || undefined,
      enabled: true,
    } : undefined,
    paypal: process.env.PAYPAL_CLIENT_ID ? {
      clientId: process.env.PAYPAL_CLIENT_ID,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET,
      mode: (process.env.PAYPAL_MODE || "live") as "sandbox" | "live",
      enabled: true,
    } : undefined,
    transfer: process.env.TRANSFER_NUMBER ? {
      enabled: true,
      accounts: [{
        type: "Nequi",
        number: process.env.TRANSFER_NUMBER,
        name: process.env.TRANSFER_NAME || "Cuenta principal",
      }],
    } : undefined,
  },

  // Email Configuration
  emailConfig: process.env.SMTP_HOST ? {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || "587"),
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASS,
    emailFrom: process.env.EMAIL_FROM,
    emailTo: process.env.EMAIL_TO,
    enabled: true,
  } : undefined,

  // API Keys
  apiKeys: {
    openai: process.env.OPENAI_API_KEY || undefined,
    groq: process.env.GROQ_API_KEY || undefined,
    nvidia: process.env.NVIDIA_API_KEY || undefined,
    opencode: process.env.OPENCODE_API_KEY || undefined,
    opencodeZen: process.env.OPENCODE_ZEN_API_KEY || undefined,
    github: process.env.GITHUB_TOKEN || undefined,
    pexels: process.env.PEXELS_API_KEY || undefined,
  },
};

console.log("📋 Configuración a migrar:");
console.log("─".repeat(50));

if (config.facebookIntegration.enabled) {
  console.log("✅ Facebook Integration:");
  console.log(`   App ID: ${config.facebookIntegration.appId}`);
  console.log(`   Page ID: ${config.facebookIntegration.pageId}`);
  console.log(`   Ad Account: ${config.facebookIntegration.adAccountId}`);
} else {
  console.log("⚪ Facebook Integration: No configurado");
}

if (config.paymentMethods.mercadopago) {
  console.log("✅ Mercado Pago: Configurado");
}
if (config.paymentMethods.paypal) {
  console.log(`✅ PayPal: Configurado (${config.paymentMethods.paypal.mode})`);
}
if (config.paymentMethods.transfer) {
  console.log(`✅ Transferencia: ${config.paymentMethods.transfer.accounts[0].number}`);
}

if (config.emailConfig) {
  console.log(`✅ Email SMTP: ${config.emailConfig.smtpHost}:${config.emailConfig.smtpPort}`);
  console.log(`   From: ${config.emailConfig.emailFrom}`);
} else {
  console.log("⚪ Email SMTP: No configurado");
}

const apiKeyCount = Object.values(config.apiKeys).filter(Boolean).length;
if (apiKeyCount > 0) {
  console.log(`✅ API Keys: ${apiKeyCount} configuradas`);
  Object.entries(config.apiKeys).forEach(([key, value]) => {
    if (value) console.log(`   - ${key}: ${value.substring(0, 10)}...`);
  });
} else {
  console.log("⚪ API Keys: Ninguna configurada");
}

console.log("─".repeat(50));

// Conectar a la base de datos
console.log("\n🔌 Conectando a la base de datos...");

// Importar de forma dinámica para evitar problemas con ESM
const { db, tenants } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

// Verificar que el tenant existe
const [tenant] = await db.select().from(tenants).where(eq(tenants.id, TENANT_ID)).limit(1);

if (!tenant) {
  console.error(`\n❌ Error: No se encontró el tenant con ID ${TENANT_ID}`);
  console.error("   Ejecuta primero: pnpm run dev (para crear el tenant por defecto)");
  process.exit(1);
}

console.log(`✅ Tenant encontrado: ${tenant.email} (${tenant.name})`);

// Actualizar tenant con la nueva configuración
console.log("\n💾 Actualizando configuración en la base de datos...");

await db
  .update(tenants)
  .set({
    facebookIntegration: config.facebookIntegration.enabled ? config.facebookIntegration : tenant.facebookIntegration,
    paymentMethods: {
      ...(tenant.paymentMethods || {}),
      ...config.paymentMethods,
    },
    emailConfig: config.emailConfig || tenant.emailConfig,
    apiKeys: {
      ...(tenant.apiKeys || {}),
      ...config.apiKeys,
    },
    updatedAt: new Date(),
  })
  .where(eq(tenants.id, TENANT_ID));

console.log("✅ Configuración migrada exitosamente");

console.log("\n📝 Próximos pasos:");
console.log("─".repeat(50));
console.log("1. Inicia sesión en el dashboard con:", tenant.email);
console.log("2. Ve a Ajustes → Integraciones");
console.log("3. Verifica que las credenciales sean correctas");
console.log("4. (Opcional) Actualiza las credenciales desde el dashboard");
console.log("5. Las variables en .env seguirán siendo el fallback");
console.log("─".repeat(50));

console.log("\n✨ ¡Migración completada!\n");

process.exit(0);
