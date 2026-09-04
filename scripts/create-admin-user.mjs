#!/usr/bin/env node
/**
 * Script para marcar un tenant como administrador de la plataforma
 * 
 * El usuario admin tiene permisos especiales:
 * - Ver todas las instancias de WhatsApp
 * - Acceder a métricas globales
 * - Gestionar planes y suscripciones
 * - Ver logs del sistema
 * 
 * Uso:
 *   node scripts/create-admin-user.mjs --email=daveymena16@gmail.com
 *   node scripts/create-admin-user.mjs --id=1
 */

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.resolve(__dirname, "../.env") });

const args = process.argv.slice(2);
const emailArg = args.find(arg => arg.startsWith("--email="));
const idArg = args.find(arg => arg.startsWith("--id="));

if (!emailArg && !idArg) {
  console.error("\n❌ Error: Debes proporcionar --email o --id\n");
  console.log("Ejemplos:");
  console.log("  node scripts/create-admin-user.mjs --email=daveymena16@gmail.com");
  console.log("  node scripts/create-admin-user.mjs --id=1");
  process.exit(1);
}

const email = emailArg?.split("=")[1];
const id = idArg ? parseInt(idArg.split("=")[1]) : null;

console.log("\n👤 Marcando usuario como administrador...\n");

// Importar de forma dinámica
const { db, tenants } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

let tenant;

if (id) {
  [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!tenant) {
    console.error(`\n❌ Error: No se encontró tenant con ID ${id}\n`);
    process.exit(1);
  }
} else if (email) {
  [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
  if (!tenant) {
    console.error(`\n❌ Error: No se encontró tenant con email ${email}\n`);
    process.exit(1);
  }
}

console.log(`📋 Tenant encontrado:`);
console.log(`   ID: ${tenant.id}`);
console.log(`   Email: ${tenant.email}`);
console.log(`   Nombre: ${tenant.name}`);
console.log(`   Plan actual: ${tenant.plan}`);
console.log(`   Estado actual isAdmin: ${tenant.isAdmin || false}`);

if (tenant.isAdmin) {
  console.log("\n⚠️  Este usuario ya es administrador");
  
  const removeArg = args.find(arg => arg === "--remove");
  if (removeArg) {
    console.log("\n🔄 Removiendo privilegios de administrador...");
    await db
      .update(tenants)
      .set({ isAdmin: false, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));
    console.log("✅ Privilegios de administrador removidos");
  } else {
    console.log("\n💡 Usa --remove para quitar los privilegios de admin");
  }
} else {
  console.log("\n🔄 Otorgando privilegios de administrador...");
  
  await db
    .update(tenants)
    .set({
      isAdmin: true,
      // Actualizar a plan enterprise si está en un plan menor
      ...(tenant.plan !== "enterprise" ? { plan: "enterprise" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));
  
  console.log("✅ Usuario marcado como administrador");
  
  if (tenant.plan !== "enterprise") {
    console.log("✅ Plan actualizado a 'enterprise'");
  }
}

console.log("\n📝 Permisos de administrador:");
console.log("─".repeat(50));
console.log("✓ Ver todas las instancias de WhatsApp");
console.log("✓ Acceder a GET /api/whatsapp/instances");
console.log("✓ Acceder a GET /api/whatsapp/metrics");
console.log("✓ Ejecutar POST /api/whatsapp/cleanup");
console.log("✓ Controlar instancias de otros tenants");
console.log("✓ Ver métricas y logs del sistema");
console.log("✓ Gestionar planes y suscripciones");
console.log("─".repeat(50));

console.log("\n✨ ¡Completado!\n");

process.exit(0);
