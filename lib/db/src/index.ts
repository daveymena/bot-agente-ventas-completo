import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import * as sqliteSchema from "./sqlite-schema";
import * as pgSchema from "./schema";

/** `postgres://u:clave@host:5432/db` -> `postgres://host:5432/db` (sin usuario ni clave). */
export function describirUrlSinCredenciales(url: string | undefined): string {
  if (!url) return "NOT SET";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "(definida, formato no reconocido)";
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Debug: print resolved DB vars
console.log(`[DB-ENV] USE_SQLITE=${process.env.USE_SQLITE}`);
// ⚠️ Los primeros 30 caracteres de `postgres://usuario:CLAVE@host` incluyen la
// contraseña: así salía en el log de producción (07-10-2026). Solo se muestra
// el destino, nunca la credencial.
console.log(`[DB-ENV] DATABASE_URL=${describirUrlSinCredenciales(process.env.DATABASE_URL)}`);
console.log(`[DB-ENV] CWD=${process.cwd()}`);

const USE_SQLITE = process.env.USE_SQLITE === "true";

// ── SCHEMA (conditional: SQLite or PG) ───────────────────────────────────────
const schema = USE_SQLITE ? sqliteSchema : pgSchema;

export const tenants = schema.tenants;
export const agents = schema.agents;
export const productCategories = schema.productCategories;
export const products = schema.products;
// ⚠️ Una por una, como todo lo de acá: si falta esta línea, `productKnowledge`
// vale undefined en ejecución y todo el conocimiento cargado por Atlas revienta
// al leerse. Es exactamente lo que pasó con `landingPages`.
export const productKnowledge = schema.productKnowledge;
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
export const personalityProfiles = schema.personalityProfiles;
export const architectMemory = schema.architectMemory;
export const responseAnalytics = schema.responseAnalytics;
export const promptVersions = schema.promptVersions;
export const facebookDrafts = schema.facebookDrafts;
// ── Landing AI Studio ──────────────────────────────────────────────────────
//
// ⚠️ Esto FALTABA, y dejaba a Landing Studio roto de raíz. Sus rutas hacen
// `import { db, landingPages, products } from "@workspace/db"`, o sea de ESTE
// archivo -- y acá las tablas se re-exportan UNA POR UNA, no con `export *`.
// El commit que "exportó el schema" la agregó a schema/index.ts, que es otra
// cosa: alimenta el namespace pgSchema, no el punto de entrada del paquete.
//
// Resultado: `landingPages` valía `undefined` en ejecución, y todo
// `db.select().from(landingPages)` reventaba. Guardar, cargar, listar y el
// comando de IA --que primero lee la landing-- fallaban los cuatro. El
// typecheck lo venía diciendo ("has no exported member 'landingPages'") y se
// leía como un artefacto de compilación viejo.
export const landingPages = schema.landingPages;
export const coupons = schema.coupons;
export const pushSubscriptions = schema.pushSubscriptions;
export const inventoryMovements = schema.inventoryMovements;
export const cajaSesiones = schema.cajaSesiones;
export const posDevoluciones = schema.posDevoluciones;
export const opencodeConfig = schema.opencodeConfig;
export const adAgentLogs = schema.adAgentLogs;
export const remarketingCampaigns = schema.remarketingCampaigns;
export const marketingTasks = schema.marketingTasks;
export const marketingExperiments = schema.marketingExperiments;
export const marketingCampaigns = schema.marketingCampaigns;
export const marketingBudgets = schema.marketingBudgets;
export const marketingAuditLogs = schema.marketingAuditLogs;
export const trabajosProgramados = schema.trabajosProgramados;
export const consumoMensual = schema.consumoMensual;
export const consumoConversaciones = schema.consumoConversaciones;
export const opencodeSkills = schema.opencodeSkills;
export const opencodeMcpServers = schema.opencodeMcpServers;
export const opencodeCommands = schema.opencodeCommands;
export const opencodeSession = schema.opencodeSession;

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
  PersonalityProfile, InsertPersonalityProfile,
  AgentType, BrandVoiceOverrides,
  ArchitectMemory, InsertArchitectMemory, MemoryType,
  ResponseAnalytics, InsertResponseAnalytics, ResponseOutcome,
  PromptVersion, InsertPromptVersion,
  FacebookDraft, InsertFacebookDraft,
  MarketingTask, InsertMarketingTask,
  MarketingExperiment, InsertMarketingExperiment,
  MarketingCampaign, InsertMarketingCampaign,
  MarketingBudget, InsertMarketingBudget,
  MarketingAuditLog, InsertMarketingAuditLog,
  Coupon, InsertCoupon,
  PushSubscription, InsertPushSubscription,
} from "./schema";
export type { AdContext, CommercialProfile } from "./schema/leads";
export type { AgentStage } from "./schema/agents";

// ── DB INSTANCE ──────────────────────────────────────────────────────────────
export let db: any;
export let pool: any;
export let saveDbToDisk: (() => void) | null = null;

let dbReady = false;

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
    // Guardar, y salir SOLO si nadie más maneja la señal. Como `lib/db` se
    // importa primero, un `process.exit(0)` acá mataba el cierre ordenado de
    // WhatsApp (lib/apagado-ordenado.ts) antes de que cerrara el socket: los
    // mensajes que llegaban durante el deploy se perdían. Es el mismo arreglo
    // que ya tenía la rama de respaldo de abajo; esta (la que usa la demo) se
    // había quedado sin él. En un script suelto, sin apagado ordenado, se sigue
    // saliendo como antes.
    const alRecibir = (senal: NodeJS.Signals) => () => {
      saveDb();
      if (process.listenerCount(senal) <= 1) process.exit(0);
    };
    process.on("SIGINT", alRecibir("SIGINT"));
    process.on("SIGTERM", alRecibir("SIGTERM"));

    await ensureSqliteTables(sqliteDb, saveDb);
    dbReady = true;
  } else {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pg = await import("pg");
    const { Pool } = pg.default || pg;

    // (Se quitó el reemplazo de "@base" por 79.143.187.160: ese servidor ya no
    // existe -- medido el 23-09-2026, solo responde el puerto 22.)
    const dbUrl = process.env.DATABASE_URL || "";

    if (dbUrl) {
      console.log(`📡 [DB-CONNECTION] Intentando conectar a: ${dbUrl.replace(/:([^:@]+)@/, ":****@")}`);
    } else if (process.env.NODE_ENV === "production") {
      // En producción, sin DATABASE_URL NO se arranca. El respaldo de abajo
      // crea un SQLite VACÍO: el bot quedaba en línea, contestando sin
      // catálogo, sin clientes y sin historial, y guardando las ventas en un
      // archivo que nadie mira. Un error de configuración en EasyPanel tiene
      // que verse como caída, no como un bot que "anda raro".
      throw new Error("DATABASE_URL no está definida y NODE_ENV=production: no se arranca con una base vacía. Revisá el entorno del servicio.");
    } else {
      console.log(`❌ [DB-CONNECTION] DATABASE_URL no está definida. Intentando fallback a SQLite...`);
      // Fallback: re-exec as SQLite
      process.env.USE_SQLITE = "true";
      const fallbackSqlJsMod = await import("sql.js");
      const fallbackSqlJs = fallbackSqlJsMod.default;
      const { drizzle: drizzleSqlJs } = await import("drizzle-orm/sql-js");
      const fallbackPath = "./data/fallback.db";
      const fullPath = path.resolve(fallbackPath);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const SQL = await fallbackSqlJs({
        locateFile: (file: string) => path.join(__dirname, file),
      });
      let sqliteDb: import("sql.js").Database;
      if (fs.existsSync(fullPath)) {
        const buffer = fs.readFileSync(fullPath);
        sqliteDb = new SQL.Database(buffer);
      } else {
        sqliteDb = new SQL.Database();
      }
      sqliteDb.run("PRAGMA journal_mode=WAL;");
      sqliteDb.run("PRAGMA foreign_keys=ON;");
      db = drizzleSqlJs(sqliteDb, { schema: sqliteSchema });
      pool = null;

      function saveFallbackDb() {
        try {
          const data = sqliteDb.export();
          fs.writeFileSync(fullPath, Buffer.from(data));
        } catch {}
      }
      saveDbToDisk = saveFallbackDb;
      setInterval(saveFallbackDb, 15000);
      // Solo GUARDAR, nunca salir.
      //
      // Estos manejadores llamaban `process.exit(0)` en el acto. Como
      // `lib/db` se importa antes que nada, su listener de SIGTERM queda
      // registrado PRIMERO, y al salir de inmediato mataba el cierre ordenado
      // de WhatsApp (`lib/apagado-ordenado.ts`) antes de que alcanzara a
      // cerrar el socket.
      //
      // Eso reabre el bug que costo clientes: si el socket no se cierra
      // limpio, WhatsApp cree que el telefono sigue en linea y entrega al
      // vacio los mensajes que llegan durante el deploy -- no los encola ni
      // los reenvia. Guardar es correcto; decidir la salida no le toca a este
      // modulo.
      process.on("exit", saveFallbackDb);
      process.on("SIGINT", saveFallbackDb);
      process.on("SIGTERM", saveFallbackDb);

      await ensureSqliteTables(sqliteDb, saveFallbackDb);
      dbReady = true;
      return;
    }

    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
      max: 20, min: 5, idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, statement_timeout: 10000, query_timeout: 10000,
    });
    db = drizzle(pool, { schema: pgSchema });

    // Crear las tablas en Postgres si no existen (idempotente). Sin esto,
    // cambiar a USE_SQLITE=false rompía la app porque las tablas no existían.
    try {
      const { ALL_TABLES } = await import("./pg-schema");
      let created = 0;
      for (const t of ALL_TABLES as { name: string; sql: string }[]) {
        try { await pool.query(t.sql); created++; }
        catch (e: any) { console.warn(`⚠️ [PG] tabla ${t.name}: ${e?.message?.slice(0, 80)}`); }
      }
      console.log(`✅ [PG] Esquema verificado: ${created}/${(ALL_TABLES as any[]).length} tablas listas`);
      await resyncPgSequences(pool);
    } catch (e: any) {
      console.error(`❌ [PG] No se pudo crear el esquema: ${e?.message}`);
    }

    dbReady = true;
  }
}

/**
 * Resincroniza las secuencias de las columnas id en Postgres.
 *
 * Cuando los datos se migran conservando el id original (como se hizo al pasar
 * de SQLite), las filas quedan con ids altos pero el contador de la secuencia
 * sigue en 1. Cada INSERT nuevo intenta reusar un id ocupado y Postgres lo
 * rechaza con 23505 (duplicate key).
 *
 * Se vio en producción: WhatsApp recibía "Hola" del cliente pero no podía
 * guardarlo ("Key (id)=(2) already exists"), así que el bot nunca respondía.
 *
 * Corre en cada arranque porque es idempotente y barato: deja cada secuencia
 * en MAX(id), y evita que una restauración o migración futura vuelva a romper
 * la app de forma silenciosa.
 */
async function resyncPgSequences(pgPool: any): Promise<void> {
  try {
    const { rows } = await pgPool.query(`
      SELECT pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) AS seq,
             c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = current_schema()
        AND t.table_type = 'BASE TABLE'
        AND pg_get_serial_sequence(quote_ident(c.table_name), c.column_name) IS NOT NULL
    `);

    let ajustadas = 0;
    for (const r of rows as { seq: string; table_name: string; column_name: string }[]) {
      if (!r.seq) continue;
      // setval con is_called=false sobre COALESCE(MAX,0)+1 deja el contador
      // listo para el siguiente id incluso con la tabla vacía.
      await pgPool.query(
        `SELECT setval($1, COALESCE((SELECT MAX(${r.column_name}) FROM ${r.table_name}), 0) + 1, false)`,
        [r.seq],
      );
      ajustadas++;
    }
    console.log(`✅ [PG] Secuencias sincronizadas: ${ajustadas}`);
  } catch (e: any) {
    // No es fatal: si falla, la app arranca igual y se ve en los logs.
    console.warn(`⚠️ [PG] No se pudieron sincronizar las secuencias: ${e?.message?.slice(0, 120)}`);
  }
}

async function ensureSqliteTables(sqliteDb: import("sql.js").Database, saveDb: () => void) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT, slug TEXT NOT NULL UNIQUE, domain TEXT, status TEXT DEFAULT 'active', plan TEXT DEFAULT 'basic', is_admin INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, brand_name TEXT NOT NULL, brand_logo TEXT, brand_colors TEXT, brand_theme TEXT, brand_social TEXT, agent_personality TEXT DEFAULT 'professional', agent_prompt TEXT, agent_name TEXT DEFAULT 'Asistente Virtual', contact_email TEXT, contact_phone TEXT, support_email TEXT, payment_methods TEXT, facebook_integration TEXT, email_config TEXT, woocommerce_integration TEXT, limits TEXT, settings TEXT, copilot_tokens TEXT, api_keys TEXT, subscription_id TEXT, subscription_status TEXT, trial_ends_at TEXT, subscription_ends_at TEXT, metadata TEXT, email_verified INTEGER DEFAULT 0, email_verification_code TEXT, email_verification_expiry TEXT, password_reset_code TEXT, password_reset_expiry TEXT, two_factor_enabled INTEGER DEFAULT 0, two_factor_secret TEXT, google_id TEXT, auth_provider TEXT DEFAULT 'password', avatar_url TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS agents (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, role TEXT NOT NULL, tone TEXT NOT NULL, language TEXT DEFAULT 'es', model TEXT DEFAULT 'gpt-4o-mini', system_prompt TEXT NOT NULL, especialidad TEXT, stages TEXT DEFAULT '[]', metadata TEXT, is_active INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, price REAL DEFAULT 0, currency TEXT DEFAULT 'USD', sku TEXT, category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL, category TEXT, kind TEXT DEFAULT 'digital', stock INTEGER, opciones TEXT, image_url TEXT, highlight TEXT, features TEXT, payment_link TEXT, delivery_link TEXT, is_active INTEGER DEFAULT 1, metadata TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    // `sqlite-schema.ts` declara landing_pages desde agosto, pero acá solo había
    // un ALTER (html): en SQLite la tabla no existía nunca y Atlas no podía crear
    // landings ("no such table: landing_pages", medido 18-09-2026).
    `CREATE TABLE IF NOT EXISTS landing_pages (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, name TEXT NOT NULL, slug TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', strategy TEXT NOT NULL DEFAULT '{}', sections TEXT NOT NULL DEFAULT '[]', design TEXT NOT NULL DEFAULT '{}', source TEXT NOT NULL DEFAULT '{}', html TEXT, published_url TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS product_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, pregunta TEXT NOT NULL, disparadores TEXT NOT NULL, respuesta TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, stage TEXT DEFAULT 'new', value REAL DEFAULT 0, notes TEXT, source TEXT, ad_context TEXT, payment_status TEXT, lifetime_value REAL DEFAULT 0, opt_out INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, contact_name TEXT NOT NULL, contact_phone TEXT NOT NULL, avatar_color TEXT DEFAULT '#10b981', last_message TEXT, last_message_at TEXT, unread_count INTEGER DEFAULT 0, status TEXT DEFAULT 'ai', current_stage TEXT, channel TEXT DEFAULT 'whatsapp', agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL, lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL, payment_status TEXT, payment_method TEXT, payment_amount REAL, paid_at TEXT, estado_agente TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, stage TEXT, metadata TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS activity_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, title TEXT NOT NULL, subtitle TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, business_name TEXT DEFAULT 'Mi Negocio', business_description TEXT DEFAULT '', timezone TEXT DEFAULT 'America/Mexico_City', working_hours_start TEXT DEFAULT '09:00', working_hours_end TEXT DEFAULT '18:00', auto_reply_enabled INTEGER DEFAULT 1, off_hours_message TEXT DEFAULT 'Gracias por escribirnos...', escalation_keywords TEXT DEFAULT '[]', ai_provider TEXT DEFAULT 'nvidia_nim_bridge', github_token TEXT, github_model TEXT DEFAULT 'gpt-4o-mini', copilot_session_token TEXT, copilot_session_expires_at TEXT, copilot_tokens TEXT, nvidia_api_key TEXT, nvidia_model TEXT DEFAULT 'meta/llama-3.1-70b-instruct', ollama_url TEXT, ollama_model TEXT DEFAULT 'hermes3:8b', business_config TEXT DEFAULT '{}')`,
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
    `CREATE TABLE IF NOT EXISTS personality_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL, agent_name TEXT NOT NULL, agent_role TEXT NOT NULL, tone TEXT NOT NULL, language TEXT DEFAULT 'es', formality TEXT DEFAULT 'tú', agent_type TEXT DEFAULT 'general', system_prompt_core TEXT NOT NULL, keywords TEXT DEFAULT '[]', brand_voice_overrides TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS architect_memory (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, session_id TEXT DEFAULT 'default', memory_type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT DEFAULT '[]', metadata TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS response_analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, agent_id INTEGER, profile_id INTEGER, conversation_id INTEGER, message_id INTEGER, response_text TEXT NOT NULL, response_length INTEGER NOT NULL, had_card INTEGER DEFAULT 0, card_product_id INTEGER, outcome TEXT, customer_message TEXT NOT NULL, sentiment_score INTEGER, response_time_ms INTEGER NOT NULL, metadata TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS prompt_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, agent_id INTEGER, profile_id INTEGER, previous_prompt TEXT NOT NULL, new_prompt TEXT NOT NULL, diff_summary TEXT NOT NULL, reason TEXT NOT NULL, performance_before TEXT, performance_after TEXT, applied_by TEXT NOT NULL, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS facebook_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, product_name TEXT NOT NULL, campaign_id TEXT, ad_set_id TEXT, ad_id TEXT, status TEXT DEFAULT 'draft' NOT NULL, strategy TEXT, primary_text TEXT, headline TEXT, description TEXT, image_url TEXT, niche TEXT, budget INTEGER, fb_status TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS ad_agent_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE, campaign_id TEXT NOT NULL, ad_set_id TEXT, product_name TEXT, check_type TEXT NOT NULL, status TEXT DEFAULT 'suggested' NOT NULL, suggested_action TEXT, reason TEXT NOT NULL, metrics_snapshot TEXT, created_at TEXT DEFAULT (datetime('now')), responded_at TEXT)`,
    `CREATE TABLE IF NOT EXISTS marketing_tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, parent_task_id INTEGER, requested_by TEXT, assigned_agent TEXT NOT NULL, domain TEXT DEFAULT 'marketing', action TEXT NOT NULL, priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'PENDING', input TEXT DEFAULT '{}', output TEXT, dependencies TEXT DEFAULT '[]', risk TEXT DEFAULT 'LOW', approval_required INTEGER DEFAULT 0, approval_status TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS marketing_experiments (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, campaign_id TEXT, hypothesis TEXT NOT NULL, variable TEXT NOT NULL, control_draft_id INTEGER REFERENCES facebook_drafts(id) ON DELETE SET NULL, variant_draft_id INTEGER REFERENCES facebook_drafts(id) ON DELETE SET NULL, control_label TEXT, variant_label TEXT, budget REAL, duration_days INTEGER, min_impressions INTEGER DEFAULT 1000, status TEXT DEFAULT 'EN_PRUEBA', result TEXT, conclusion TEXT, learning TEXT, started_at TEXT, ended_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS marketing_campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, name TEXT NOT NULL, objective TEXT NOT NULL, status TEXT DEFAULT 'PLANNED', strategy TEXT, budget_planned REAL, budget_spent REAL DEFAULT 0, target_kpis TEXT, scaling_state TEXT, meta_ids TEXT, started_at TEXT, ended_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS marketing_budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL UNIQUE, max_daily_spend REAL DEFAULT 50000, max_budget_change_percent REAL DEFAULT 25, max_scale_percent REAL DEFAULT 30, approval_required INTEGER DEFAULT 1, currency TEXT DEFAULT 'COP', today_spend REAL DEFAULT 0, today_date TEXT, period_spend REAL DEFAULT 0, period_start TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS marketing_audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, agent TEXT NOT NULL, task_id INTEGER, action TEXT NOT NULL, resource TEXT, before TEXT, after TEXT, approval TEXT, reason TEXT, result TEXT DEFAULT 'PENDING', error TEXT, request_id TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS trabajos_programados (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, tipo TEXT NOT NULL, clave TEXT NOT NULL UNIQUE, corre_at TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'pendiente', datos TEXT NOT NULL DEFAULT '{}', resultado TEXT, intentos INTEGER NOT NULL DEFAULT 0, error TEXT, repite_cada_min INTEGER, creado_at TEXT DEFAULT (datetime('now')), actualizado_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS consumo_mensual (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, periodo TEXT NOT NULL, mensajes INTEGER NOT NULL DEFAULT 0, actualizado_at TEXT DEFAULT (datetime('now')), UNIQUE(tenant_id, periodo))`,
    `CREATE TABLE IF NOT EXISTS consumo_conversaciones (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, periodo TEXT NOT NULL, conversaciones INTEGER NOT NULL DEFAULT 0, actualizado_at TEXT DEFAULT (datetime('now')), UNIQUE(tenant_id, periodo))`,
    `CREATE TABLE IF NOT EXISTS coupons (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, code TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'porcentaje', valor REAL NOT NULL, minimo_compra REAL, usos_max INTEGER, usos INTEGER NOT NULL DEFAULT 0, activo INTEGER DEFAULT 1, vigencia_inicio TEXT, vigencia_fin TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, dispositivo TEXT, activo INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, tipo TEXT NOT NULL DEFAULT 'ajuste', cantidad INTEGER NOT NULL DEFAULT 0, saldo INTEGER, motivo TEXT, ref_tipo TEXT, ref_id INTEGER, creado_por TEXT, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS caja_sesiones (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, abierta_en TEXT NOT NULL DEFAULT (datetime('now')), cerrada_en TEXT, abierta_por TEXT, cerrada_por TEXT, fondo_inicial REAL NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'abierta', ventas_efectivo REAL NOT NULL DEFAULT 0, ventas_otros REAL NOT NULL DEFAULT 0, esperado REAL, contado REAL, diferencia REAL, notas TEXT)`,
    `CREATE TABLE IF NOT EXISTS pos_devoluciones (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE NOT NULL, pago_id INTEGER REFERENCES payments(id) ON DELETE SET NULL, items TEXT NOT NULL DEFAULT '[]', motivo TEXT, total REAL NOT NULL DEFAULT 0, creado_por TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  ];

  for (const sql of tables) {
    try { sqliteDb.run(sql); } catch (err) { console.error("Error creating table:", err); }
  }

  // ── ÍNDICES ──────────────────────────────────────────────────────────────
  //
  // Medido el 2026-10-14: la base tenía **CERO índices**. Ninguno. Ni en
  // `conversations.tenant_id`, que filtra TODAS las consultas del panel, ni en
  // `messages.conversation_id`, que es la lectura más frecuente del sistema
  // (cada vez que se abre un chat).
  //
  // Sin índice eso es un full table scan, y el costo crece con los datos: con
  // el negocio de prueba no se nota; con 20 clientes escribiendo, el inbox —la
  // pantalla central del producto— recorre la tabla de mensajes entera en cada
  // carga. Es el multiplicador silencioso de todo lo demás.
  //
  // Se crean DESPUÉS de las tablas y antes de las migraciones de columna a
  // propósito: `CREATE INDEX IF NOT EXISTS` es idempotente y no falla si la
  // tabla viene de una base vieja. Si alguna columna todavía no existe (una
  // base muy anterior a esta lista), el índice se saltea en silencio en vez de
  // impedir el arranque — un índice que falta degrada, no rompe.
  const indices = [
    // Las consultas del panel filtran por negocio en TODAS las pantallas.
    `CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_tenant_ultimo ON conversations(tenant_id, last_message_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`,
    // El inbox ordena por fecha y busca por estado/etapa dentro del negocio.
    `CREATE INDEX IF NOT EXISTS idx_conversations_tenant_estado ON conversations(tenant_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_leads_telefono ON leads(phone)`,
    `CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_products_tenant_activo ON products(tenant_id, is_active)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payments_conversation ON payments(conversation_id)`,
    // Seguimiento y recordatorios: se consultan por fecha de vencimiento.
    `CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_for, completed)`,
    `CREATE INDEX IF NOT EXISTS idx_follow_ups_conversation ON follow_ups(conversation_id)`,
    // Enlaces cortos: se resuelven por código en cada clic.
    `CREATE INDEX IF NOT EXISTS idx_payment_links_code ON payment_links(short_code)`,
    // Anuncios y marketing: los barridos recorren todos los negocios.
    `CREATE INDEX IF NOT EXISTS idx_ad_agent_logs_tenant ON ad_agent_logs(tenant_id, check_type)`,
    `CREATE INDEX IF NOT EXISTS idx_facebook_drafts_tenant ON facebook_drafts(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id)`,
    // Los trabajos programados se consultan por vencimiento en cada vuelta del
    // programador (cada 60s, sobre TODOS los negocios).
    `CREATE INDEX IF NOT EXISTS idx_trabajos_corre_estado ON trabajos_programados(corre_at, estado)`,
    // Memoria del arquitecto y analíticas: se leen por negocio.
    `CREATE INDEX IF NOT EXISTS idx_architect_memory_tenant ON architect_memory(tenant_id)`,
    `CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id)`,
  ];
  for (const sql of indices) {
    try { sqliteDb.run(sql); } catch { /* tabla o columna ausente: se saltea */ }
  }

  // Migración idempotente: agrega columnas nuevas a tablas que ya existían
  // en disco antes de que se agregara la columna (CREATE TABLE IF NOT EXISTS
  // no las agrega retroactivamente). Falla en silencio si la columna ya
  // existe (SQLite no soporta "ADD COLUMN IF NOT EXISTS").
  const columnMigrations = [
    `ALTER TABLE tenants ADD COLUMN is_admin INTEGER DEFAULT 0`,
    `ALTER TABLE tenants ADD COLUMN is_active INTEGER DEFAULT 1`,
    `ALTER TABLE leads ADD COLUMN ad_context TEXT`,
    `ALTER TABLE leads ADD COLUMN opt_out INTEGER DEFAULT 0`,
    `ALTER TABLE leads ADD COLUMN commercial_profile TEXT`,
    // Postgres ya la agrega en autoMigrate desde el 2026-08-18; sin esta línea
    // las bases SQLite creadas antes de hoy se quedaban sin la columna y el
    // enrutador por especialidad no encontraba nada.
    `ALTER TABLE agents ADD COLUMN especialidad TEXT`,
    // Landing pages con HTML dinámico generado por OpenCode.
    `ALTER TABLE landing_pages ADD COLUMN html TEXT`,
    // Google OAuth / OpenID Connect.
    `ALTER TABLE tenants ADD COLUMN google_id TEXT`,
    `ALTER TABLE tenants ADD COLUMN auth_provider TEXT DEFAULT 'password'`,
    `ALTER TABLE tenants ADD COLUMN avatar_url TEXT`,
    `ALTER TABLE tenants ADD COLUMN facebook_integration TEXT`,
    `ALTER TABLE tenants ADD COLUMN email_config TEXT`,
    `ALTER TABLE tenants ADD COLUMN api_keys TEXT`,
    // Estado explícito del vendedor de WhatsApp (motor v2). Sin esta línea,
    // una base SQLite creada antes de hoy se queda sin la columna y el motor
    // nuevo no puede recordar nada entre mensajes.
    `ALTER TABLE conversations ADD COLUMN estado_agente TEXT`,
    // `sqlite-schema.ts` declara settings.copilot_tokens desde la cola de
    // Copilot, pero el CREATE de arriba no la tenía (solo tenants la tenía).
    // Efecto medido el 2026-09-18: con SQLite, `runAgentReply` moría en el
    // primer SELECT de settings ("copilot_tokens is not valid JSON") y el
    // vendedor devolvía null para TODO mensaje, sin un solo log.
    `ALTER TABLE settings ADD COLUMN copilot_tokens TEXT`,
  ];
  for (const sql of columnMigrations) {
    try { sqliteDb.run(sql); } catch { /* columna ya existe */ }
  }

  saveDb();
  console.log("✅ [SQLite] Todas las tablas creadas/verificadas");
}

// ── INIT ─────────────────────────────────────────────────────────────────────
let initResolved = false;
const initPromise = initDb().then(() => {
  initResolved = true;
  console.log(`✅ [DB] Inicializado (USE_SQLITE=${USE_SQLITE}, ready=${initResolved})`);
}).catch(err => {
  console.error("❌ [DB] Error de inicialización:", err.message);
  console.error("❌ [DB] La base de datos NO está disponible. Las operaciones de BD fallarán.");
  // Falta de configuración en producción: se sale para que EasyPanel lo
  // muestre como caído en vez de levantar un servidor sin base.
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL && !USE_SQLITE) process.exit(1);
});

export async function ensureDbReady() {
  if (!initResolved) {
    console.log("⏳ [DB] Esperando inicialización...");
  }
  await initPromise;
  return { db, pool };
}

export function isDbReady() {
  return dbReady && !!db;
}

// Eager init
initPromise.then(() => {
  if (dbReady) console.log("✅ [DB] Lista para usar");
});
