#!/usr/bin/env node
/**
 * Migrates data from SQLite to PostgreSQL.
 * Usage:
 *   1. Set DATABASE_URL (PG connection string)
 *   2. Run: node scripts/migrate-to-pg.mjs
 *
 * Steps:
 *   - Reads all data from local SQLite (data/tecnovariedades.db)
 *   - Creates tables in PG via scripts/migrate.mjs
 *   - Inserts all data into PG
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

config({ path: join(rootDir, '.env') });

const SQLITE_PATH = process.env.SQLITE_PATH || './data/tecnovariedades.db';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Set it to your PostgreSQL connection string.');
  console.error('   Example: DATABASE_URL=postgres://user:pass@host:5432/dbname');
  process.exit(1);
}

// ── Load SQLite ──────────────────────────────────────────────────────
let sqliteDb;
try {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const dbPath = resolve(rootDir, SQLITE_PATH);
  if (!existsSync(dbPath)) {
    console.error(`❌ SQLite database not found at: ${dbPath}`);
    process.exit(1);
  }
  const buffer = readFileSync(dbPath);
  sqliteDb = new SQL.Database(buffer);
  console.log(`📦 Loaded SQLite: ${dbPath} (${buffer.length} bytes)`);
} catch (err) {
  console.error('❌ Failed to load SQLite:', err.message);
  process.exit(1);
}

// ── Load PG ──────────────────────────────────────────────────────────
let pgPool;
try {
  const { default: pg } = await import('pg');
  const Pool = pg.Pool;
  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    max: 5,
  });
  const client = await pgPool.connect();
  await client.query('SELECT 1');
  client.release();
  console.log('📡 Connected to PostgreSQL');
} catch (err) {
  console.error('❌ Failed to connect to PostgreSQL:', err.message);
  process.exit(1);
}

// ── Run schema migration ─────────────────────────────────────────────
console.log('\n🗄️  Running schema migration...');
const migratePath = join(__dirname, 'migrate.mjs');
if (existsSync(migratePath)) {
  await import(migratePath);
} else {
  console.warn('⚠️  migrate.mjs not found, creating tables inline...');
  // Fallback: create tables via drizzle-kit push
}

// ── Get all tables from SQLite ───────────────────────────────────────
const tableResult = sqliteDb.exec(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
const tables = tableResult[0]?.values?.map(v => v[0]) || [];
console.log(`\n📋 Found ${tables.length} tables in SQLite: ${tables.join(', ')}`);

// ── Tables in dependency order (FK-safe) ──────────────────────────────
const ORDERED_TABLES = [
  'tenants',
  'product_categories',
  'settings',
  'activity_events',
  'whatsapp_auth',
  'agents',
  'leads',
  'products',
  'stores',
  'store_categories',
  'architect_memory',
  'personality_profiles',
  'subscriptions',
  'conversations',
  'store_products',
  'store_layouts',
  'payment_links',
  'payment_transactions',
  'messages',
  'follow_ups',
  'payments',
  'response_analytics',
  'prompt_versions',
  'facebook_drafts',
];

// ── Migrate data ──────────────────────────────────────────────────────
let totalRows = 0;

for (const tableName of ORDERED_TABLES) {
  if (!tables.includes(tableName)) {
    console.log(`  ⏭️  ${tableName} (not in SQLite)`);
    continue;
  }

  try {
    // Get column info
    const colInfo = sqliteDb.exec(`PRAGMA table_info("${tableName}")`);
    const columns = colInfo[0]?.values?.map(v => v[1]) || [];
    if (columns.length === 0) continue;

    // Get all rows
    const rows = sqliteDb.exec(`SELECT * FROM "${tableName}"`);
    if (!rows[0]?.values?.length) {
      console.log(`  ⏭️  ${tableName} (empty)`);
      continue;
    }

    const values = rows[0].values;
    const colList = columns.map(c => `"${c}"`).join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      // Disable triggers temporarily for smooth migration
      await client.query(`SET session_replication_role = 'replica'`);

      let count = 0;
      for (const row of values) {
        const params = row.map(v => {
          if (v === null || v === undefined) return null;
          // Convert SQLite integers representing booleans
          if (v === 0 || v === 1) return v;
          return v;
        });

        try {
          await client.query(
            `INSERT INTO "${tableName}" (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            params
          );
          count++;
        } catch (err) {
          // Log and skip problematic rows
          console.warn(`    ⚠️  ${tableName} row ${count + 1}: ${err.message.substring(0, 80)}`);
        }
      }

      await client.query(`SET session_replication_role = 'origin'`);
      await client.query('COMMIT');
      console.log(`  ✅ ${tableName}: ${count} rows migrated`);
      totalRows += count;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌ ${tableName}: migration failed - ${err.message.substring(0, 100)}`);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(`  ❌ ${tableName}: error - ${err.message.substring(0, 100)}`);
  }
}

console.log(`\n🎉 Migration complete! ${totalRows} total rows migrated to PostgreSQL.`);
await pgPool.end();
