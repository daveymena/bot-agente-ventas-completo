import { config } from "dotenv";
import path from "path";
import fs from "fs";
import * as sqliteSchema from "./sqlite-schema";
import * as pgSchema from "./schema";

// ── ENV LOADER ───────────────────────────────────────────────────────────────
let currentDir = process.cwd();
let rootEnvPath = path.resolve(currentDir, ".env");
for (let i = 0; i < 5; i++) {
  if (fs.existsSync(rootEnvPath)) {
    const stats = fs.statSync(rootEnvPath);
    if (stats.size > 100) break;
  }
  currentDir = path.dirname(currentDir);
  rootEnvPath = path.resolve(currentDir, ".env");
}
console.log(`🔍 [DOTENV] Buscando configuración en: ${rootEnvPath}`);
config({ path: rootEnvPath });

const USE_SQLITE = process.env.USE_SQLITE === "true";

// ── SCHEMA (conditional: SQLite or PG) ───────────────────────────────────────
const schema = USE_SQLITE ? sqliteSchema : pgSchema;

export const tenants = schema.tenants;
export const agents = schema.agents;
export const productCategories = schema.productCategories;
export const products = schema.products;
export const leads = schema.leads;
export const conversations = schema.conversations;
export const messages = schema.messages;
export const activityEvents = schema.activityEvents;
export const settings = schema.settings;
export const stores = schema.stores;
export const store_categories = schema.store_categories;
export const store_products = schema.store_products;
export const paymentLinks = schema.paymentLinks;
export const followUps = schema.followUps;
export const subscriptions = schema.subscriptions;
export const paymentTransactions = schema.paymentTransactions;
export const payments = schema.payments;
export const store_layouts = schema.store_layouts;
export const whatsappAuth = schema.whatsappAuth;

export type {
  Tenant, InsertTenant,
  Agent, InsertAgent,
  ProductCategory, InsertProductCategory,
  Product, InsertProduct,
  Lead, InsertLead,
  Conversation, InsertConversation,
  Message, InsertMessage, MessageMetadata,
  ActivityEvent, InsertActivityEvent,
  Settings, InsertSettings,
  Store, InsertStore,
  StoreCategory, InsertStoreCategory,
  StoreProduct, InsertStoreProduct,
  PaymentLink, InsertPaymentLink,
  FollowUp, InsertFollowUp,
  Subscription, InsertSubscription,
  PaymentTransaction, InsertPaymentTransaction,
  Payment, InsertPayment,
  StoreLayout, InsertStoreLayout,
} from "./schema";
export type { AgentStage } from "./schema/agents";

// ── DB INSTANCE ──────────────────────────────────────────────────────────────
export let db: any;
export let pool: any;
export let saveDbToDisk: (() => void) | null = null;

async function initDb() {
  if (USE_SQLITE) {
    const initSqlJsMod = await import("sql.js");
    const initSqlJs = initSqlJsMod.default;
    const { drizzle } = await import("drizzle-orm/sql-js");

    const dbPath = process.env.SQLITE_PATH || "./data/tecnovariedades.db";
    const fullPath = path.resolve(dbPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const SQL = await initSqlJs({
      locateFile: (file: string) => path.join(__dirname, file),
    });
    let sqliteDb: import("sql.js").Database;
    if (fs.existsSync(fullPath)) {
      const buffer = fs.readFileSync(fullPath);
      sqliteDb = new SQL.Database(buffer);
      console.log(`📦 [SQLite] Base existente cargada: ${fullPath}`);
    } else {
      sqliteDb = new SQL.Database();
      console.log(`📦 [SQLite] Nueva base creada: ${fullPath}`);
    }

    sqliteDb.run("PRAGMA journal_mode=WAL;");
    sqliteDb.run("PRAGMA foreign_keys=ON;");

    db = drizzle(sqliteDb, { schema: sqliteSchema });
    pool = null;

    // Autoguardado periódico
    function saveDb() {
      try {
        const data = sqliteDb.export();
        fs.writeFileSync(fullPath, Buffer.from(data));
      } catch {}
    }
    saveDbToDisk = saveDb;
    setInterval(saveDb, 15000);
    process.on("exit", saveDb);
    process.on("SIGINT", () => { saveDb(); process.exit(0); });
    process.on("SIGTERM", () => { saveDb(); process.exit(0); });

    await ensureSqliteTables(sqliteDb, saveDb);
  } else {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pg = await import("pg");
    const { Pool } = pg.default || pg;

    let dbUrl = process.env.DATABASE_URL || "";
    if (dbUrl.includes("@base")) {
      dbUrl = dbUrl.replace("@base", "@79.143.187.160");
    }

    if (dbUrl) {
      console.log(`📡 [DB-CONNECTION] Intentando conectar a: ${dbUrl.replace(/:([^:@]+)@/, ":****@")}`);
    }
    if (!dbUrl) throw new Error("DATABASE_URL must be set in .env");

    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
      max: 20, min: 5, idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 10000,
    });
    db = drizzle(pool, { schema: pgSchema });
  }
}

async function ensureSqliteTables(sqliteDb: import("sql.js").Database, saveDb: () => void) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT, slug TEXT NOT NULL UNIQUE, domain TEXT, status TEXT DEFAULT 'active', plan TEXT DEFAULT 'basic', brand_name TEXT NOT NULL, brand_logo TEXT, brand_colors TEXT, brand_theme TEXT, brand_social TEXT, agent_personality TEXT DEFAULT 'professional', agent_prompt TEXT, agent_name TEXT DEFAULT 'Asistente Virtual', contact_email TEXT, contact_phone TEXT, support_email TEXT, payment_methods TEXT, woocommerce_integration TEXT, limits TEXT, settings TEXT, subscription_id TEXT, subscription_status TEXT, trial_ends_at TEXT, subscription_ends_at TEXT, metadata TEXT, email_verified INTEGER DEFAULT 0, email_verification_code TEXT, email_verification_expiry TEXT, password_reset_code TEXT, password_reset_expiry TEXT, two_factor_enabled INTEGER DEFAULT 0, two_factor_secret TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT NOT NULL, tone TEXT NOT NULL, language TEXT DEFAULT 'es', model TEXT DEFAULT 'gpt-4o-mini', system_prompt TEXT NOT NULL, stages TEXT DEFAULT '[]', metadata TEXT, is_active INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, price REAL DEFAULT 0, currency TEXT DEFAULT 'USD', sku TEXT, category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL, category TEXT, kind TEXT DEFAULT 'digital', image_url TEXT, highlight TEXT, features TEXT, payment_link TEXT, delivery_link TEXT, is_active INTEGER DEFAULT 1, metadata TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, stage TEXT DEFAULT 'new', value REAL DEFAULT 0, notes TEXT, source TEXT, payment_status TEXT, lifetime_value REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, avatar_color TEXT DEFAULT '#10b981', last_message TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ai', current_stage TEXT, agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, payment_status TEXT, payment_method TEXT, payment_amount REAL, paid_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, stage TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS activity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT DEFAULT 'Mi Negocio', business_description TEXT DEFAULT '', timezone TEXT DEFAULT 'America/Mexico_City', working_hours_start TEXT DEFAULT '09:00', working_hours_end TEXT DEFAULT '18:00', auto_reply_enabled INTEGER DEFAULT 1, off_hours_message TEXT DEFAULT 'Gracias por escribirnos...', escalation_keywords TEXT DEFAULT '[]', ai_provider TEXT DEFAULT 'nvidia_nim_bridge', github_token TEXT, github_model TEXT DEFAULT 'gpt-4o-mini', copilot_session_token TEXT, copilot_session_expires_at TEXT, nvidia_api_key TEXT, nvidia_model TEXT DEFAULT 'meta/llama-3.1-70b-instruct', ollama_url TEXT, ollama_model TEXT DEFAULT 'hermes3:8b', business_config TEXT DEFAULT '{}')`,
    `CREATE TABLE IF NOT EXISTS stores (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, theme TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS store_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS store_products (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL, category_id INTEGER REFERENCES store_categories(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT, price REAL NOT NULL, thumb_url TEXT, delivery_link TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS payment_links (id INTEGER PRIMARY KEY AUTOINCREMENT, short_code TEXT NOT NULL UNIQUE, original_url TEXT NOT NULL, method TEXT NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, client_phone TEXT, clicks INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, last_click_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS follow_ups (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, scheduled_for TEXT NOT NULL, follow_up_type TEXT DEFAULT 'check_in', message TEXT NOT NULL, priority TEXT DEFAULT 'medium', stage TEXT NOT NULL, last_score INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, completed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, plan TEXT NOT NULL, status TEXT DEFAULT 'pending', billing_cycle TEXT DEFAULT 'monthly', payment_method TEXT NOT NULL, payment_id TEXT, payment_status TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', started_at TEXT, expires_at TEXT, cancelled_at TEXT, next_billing_date TEXT, auto_renew INTEGER DEFAULT 1, activation_token TEXT, token_sent_at TEXT, activated_at TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS payment_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, payment_method TEXT NOT NULL, payment_id TEXT NOT NULL, payment_status TEXT NOT NULL, amount REAL NOT NULL, currency TEXT DEFAULT 'USD', plan TEXT NOT NULL, billing_cycle TEXT NOT NULL, payer_email TEXT, payer_name TEXT, payer_id TEXT, webhook_data TEXT, paid_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, amount REAL NOT NULL, currency TEXT DEFAULT 'COP', method TEXT NOT NULL, status TEXT DEFAULT 'pending', payment_status TEXT, proof_received INTEGER DEFAULT 0, proof_url TEXT, bank_reference TEXT, payer_account TEXT, payer_name TEXT, payer_email TEXT, payer_phone TEXT, verification_source TEXT, verified_at TEXT, verified_by TEXT, notes TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS store_layouts (id INTEGER PRIMARY KEY AUTOINCREMENT, store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE NOT NULL UNIQUE, layout_data TEXT DEFAULT '{}', version TEXT DEFAULT '1', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS whatsapp_auth (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  ];

  for (const sql of tables) {
    try { sqliteDb.run(sql); } catch (err) { console.error("Error creating table:", err); }
  }
  saveDb();
  console.log("✅ [SQLite] Todas las tablas creadas/verificadas");
}

// ── INIT ─────────────────────────────────────────────────────────────────────
const initPromise = initDb().catch(err => {
  console.error("❌ [DB] Error de inicialización:", err.message);
});

export async function ensureDbReady() {
  await initPromise;
  return { db, pool };
}

// Eager init
initPromise.then(() => {
  if (USE_SQLITE) console.log("✅ [DB] SQLite listo");
});
