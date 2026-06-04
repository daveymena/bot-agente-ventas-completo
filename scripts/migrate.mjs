#!/usr/bin/env node
/**
 * migrate.mjs — Migración SQL directa
 * No depende de drizzle-kit ni de npx.
 * Añade las columnas faltantes a la tabla "tenants" en PostgreSQL.
 * Se puede ejecutar múltiples veces de forma segura (usa IF NOT EXISTS).
 */

// pg está en lib/db/node_modules/pg (workspace de pnpm)
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Buscar pg en múltiples ubicaciones posibles
let Client;
try {
  // Intentar desde lib/db/node_modules
  const require = createRequire(join(__dirname, 'lib/db/package.json'));
  const pg = require('pg');
  Client = pg.Client;
} catch {
  try {
    // Intentar desde node_modules global de pnpm
    const { createRequire: cr } = await import('module');
    const req = cr(join(__dirname, 'package.json'));
    const pg = req('pg');
    Client = pg.Client;
  } catch {
    // Último intento: importar dinámicamente
    const pg = await import('pg');
    Client = pg.default?.Client || pg.Client;
  }
}

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL no está definida. Abortando migración.');
  process.exit(1);
}

// Todas las columnas que necesita el schema actual
const MIGRATIONS = [
  // Columnas base de tenants (las que faltan en la DB vieja)
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS domain TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basic'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_name TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_logo TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_colors JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_theme JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_social JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_personality TEXT NOT NULL DEFAULT 'professional'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_prompt TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS agent_name TEXT NOT NULL DEFAULT 'Asistente Virtual'`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS support_email TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_methods JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS woocommerce_integration JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS limits JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_id TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_status TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS metadata JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMPTZ`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`,

  // Reparar brand_name si existe pero es nullable (puede fallar con tenants viejos)
  `UPDATE tenants SET brand_name = name WHERE brand_name IS NULL`,
  `UPDATE tenants SET slug = LOWER(REPLACE(name, ' ', '-')) || '-' || id::text WHERE slug IS NULL`,
];

// Tablas completas que pueden no existir aún
const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT 'Agente',
    personality TEXT NOT NULL DEFAULT 'professional',
    prompt TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(10,2),
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    phone TEXT NOT NULL,
    name TEXT,
    email TEXT,
    stage TEXT NOT NULL DEFAULT 'greeting',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    lead_id INTEGER,
    phone TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'greeting',
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    conversation_id INTEGER,
    lead_id INTEGER,
    phone TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer',
    content TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    lead_id INTEGER,
    amount NUMERIC(10,2),
    currency TEXT DEFAULT 'COP',
    status TEXT NOT NULL DEFAULT 'pending',
    method TEXT,
    reference TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS follow_ups (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL,
    lead_id INTEGER,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

async function migrate() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    console.log('🔌 Conectando a PostgreSQL...');
    await client.connect();
    console.log('✅ Conexión exitosa a la base de datos');

    // Crear tabla tenants si no existe (caso base)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ Tabla tenants verificada');

    // Aplicar columnas faltantes
    console.log(`\n📦 Aplicando ${MIGRATIONS.length} migraciones de columnas...`);
    for (const sql of MIGRATIONS) {
      try {
        await client.query(sql);
        const col = sql.split('ADD COLUMN IF NOT EXISTS')[1]?.split(' ')[1] || sql.substring(0, 60);
        console.log(`  ✓ ${col.trim()}`);
      } catch (err) {
        // Ignorar errores de "column already exists" u otros no críticos
        console.warn(`  ⚠️  ${err.message.substring(0, 80)}`);
      }
    }

    // Crear tablas secundarias
    console.log(`\n🗄️  Creando tablas faltantes...`);
    for (const sql of CREATE_TABLES) {
      try {
        await client.query(sql);
        const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] || 'tabla';
        console.log(`  ✓ Tabla ${tableName}`);
      } catch (err) {
        console.warn(`  ⚠️  ${err.message.substring(0, 80)}`);
      }
    }

    console.log('\n🎉 Migración completada exitosamente');
  } catch (err) {
    console.error('❌ Error crítico durante la migración:', err.message);
    console.error('  El servidor iniciará de todos modos...');
    // No hacemos process.exit(1) para que el servidor siga arrancando
  } finally {
    await client.end();
  }
}

migrate();
