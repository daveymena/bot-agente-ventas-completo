/**
 * Migraciones versionadas. Cada entrada corre una sola vez (tabla
 * schema_migrations). Para cambiar el esquema se AGREGA una migración nueva;
 * nunca se edita una ya aplicada.
 */
import type { Client } from "@libsql/client";

interface Migration { id: string; up: string[] }

export const MIGRATIONS: Migration[] = [
  {
    id: "0001_base",
    up: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',            -- user | contributor | admin
        status TEXT NOT NULL DEFAULT 'active',        -- active | blocked
        avatar_url TEXT,
        country TEXT,
        credits INTEGER NOT NULL DEFAULT 0,
        subscription TEXT,                            -- JSON {planId,status,billing,periodStart,periodEnd,creditsLeft,videosLeft}
        contributor_profile TEXT,                     -- JSON {displayName,bio,website,payoutMethod,payoutAccount,acceptedTermsAt}
        earnings_cents INTEGER NOT NULL DEFAULT 0,    -- saldo disponible para retirar
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_login_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,                          -- hash del token
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        cover_asset_id INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,                           -- photo | illustration | vector | video | audio | template | 3d
        title TEXT NOT NULL,
        description TEXT,
        keywords TEXT NOT NULL DEFAULT '[]',          -- JSON string[]
        keywords_text TEXT NOT NULL DEFAULT '',       -- para FTS
        category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        contributor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'pending',       -- draft | pending | approved | rejected | disabled
        rejection_reason TEXT,
        is_free INTEGER NOT NULL DEFAULT 0,
        is_premium INTEGER NOT NULL DEFAULT 0,
        is_editorial INTEGER NOT NULL DEFAULT 0,
        is_ai_generated INTEGER NOT NULL DEFAULT 0,
        has_people INTEGER NOT NULL DEFAULT 0,
        people_count INTEGER NOT NULL DEFAULT 0,
        model_release INTEGER NOT NULL DEFAULT 0,
        property_release INTEGER NOT NULL DEFAULT 0,
        mature INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        orientation TEXT NOT NULL DEFAULT 'horizontal', -- horizontal | vertical | square | panoramic
        duration_sec REAL,
        fps REAL,
        resolution_label TEXT,                        -- HD | 4K
        file_format TEXT NOT NULL DEFAULT 'jpg',
        file_size_bytes INTEGER NOT NULL DEFAULT 0,
        original_path TEXT,                           -- relativo a originalsDir (privado)
        preview_path TEXT,                            -- relativo a publicDir (con marca de agua)
        thumb_path TEXT,
        card_path TEXT,
        poster_path TEXT,
        waveform TEXT,                                -- JSON number[] (audio)
        colors TEXT,                                  -- JSON [{hex, ratio}]
        hue INTEGER, saturation INTEGER, lightness INTEGER,
        dhash TEXT,
        blur_data TEXT,
        series_id TEXT,
        views INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        licenses_count INTEGER NOT NULL DEFAULT 0,
        featured INTEGER NOT NULL DEFAULT 0,
        price_credits_standard INTEGER,
        price_credits_extended INTEGER,
        external_source TEXT,
        external_url TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        approved_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_assets_status_type ON assets(status, type)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_contributor ON assets(contributor_id, status)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_series ON assets(series_id)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_created ON assets(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_assets_hue ON assets(hue)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
        title, description, keywords_text,
        content='assets', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      )`,
      `CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
        INSERT INTO assets_fts(rowid, title, description, keywords_text) VALUES (new.id, new.title, coalesce(new.description,''), new.keywords_text);
      END`,
      `CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
        INSERT INTO assets_fts(assets_fts, rowid, title, description, keywords_text) VALUES ('delete', old.id, old.title, coalesce(old.description,''), old.keywords_text);
      END`,
      `CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE OF title, description, keywords_text ON assets BEGIN
        INSERT INTO assets_fts(assets_fts, rowid, title, description, keywords_text) VALUES ('delete', old.id, old.title, coalesce(old.description,''), old.keywords_text);
        INSERT INTO assets_fts(rowid, title, description, keywords_text) VALUES (new.id, new.title, coalesce(new.description,''), new.keywords_text);
      END`,
      `CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,   -- NULL = curada por la plataforma
        title TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        is_curated INTEGER NOT NULL DEFAULT 0,
        cover_asset_id INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS collection_items (
        collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        PRIMARY KEY (collection_id, asset_id)
      )`,
      `CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        credits_per_month INTEGER NOT NULL,
        videos_per_month INTEGER NOT NULL DEFAULT 0,
        price_monthly_cents INTEGER NOT NULL,
        price_annual_monthly_cents INTEGER NOT NULL,
        features TEXT NOT NULL DEFAULT '[]',
        badge TEXT,
        audience TEXT NOT NULL DEFAULT 'individual',  -- individual | team | enterprise
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS credit_packs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credits INTEGER NOT NULL,
        price_cents INTEGER NOT NULL,
        label TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,                           -- pack | subscription
        reference_id INTEGER NOT NULL,
        billing TEXT,                                 -- monthly | annual (suscripciones)
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',       -- pending | paid | cancelled | failed
        provider TEXT NOT NULL DEFAULT 'manual',      -- manual | mercadopago | free
        provider_ref TEXT,
        payload TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        paid_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, status)`,
      `CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        delta INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,                         -- pack_purchase | subscription_grant | license | refund | admin_adjust | signup_bonus
        ref_type TEXT, ref_id INTEGER,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_credit_tx_user ON credit_transactions(user_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        certificate_no TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        type TEXT NOT NULL,                           -- standard | extended
        credits_spent INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,                         -- credits | subscription | free
        value_cents INTEGER NOT NULL DEFAULT 0,
        downloads_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_licenses_user ON licenses(user_id, created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_licenses_asset ON licenses(asset_id)`,
      `CREATE TABLE IF NOT EXISTS earnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contributor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        rate REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',     -- available | paid
        payout_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_earnings_contrib ON earnings(contributor_id, created_at)`,
      `CREATE TABLE IF NOT EXISTS payouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contributor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount_cents INTEGER NOT NULL,
        method TEXT, account TEXT,
        status TEXT NOT NULL DEFAULT 'requested',     -- requested | paid | rejected
        note TEXT,
        requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        resolved_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS asset_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        user_id INTEGER,
        kind TEXT NOT NULL,                           -- view | comp | license
        day TEXT NOT NULL,                            -- YYYY-MM-DD
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_asset_events ON asset_events(asset_id, day)`,
      `CREATE TABLE IF NOT EXISTS search_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_search_logs_q ON search_logs(query)`,
      `CREATE TABLE IF NOT EXISTS ai_generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        model TEXT,
        size TEXT,
        status TEXT NOT NULL DEFAULT 'done',          -- done | failed
        error TEXT,
        asset_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`,
    ],
  },
];

export async function runMigrations(client: Client) {
  await client.execute(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set((await client.execute(`SELECT id FROM schema_migrations`)).rows.map((r) => String(r.id)));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    for (const stmt of m.up) await client.execute(stmt);
    await client.execute({ sql: `INSERT INTO schema_migrations(id, applied_at) VALUES (?, ?)`, args: [m.id, new Date().toISOString()] });
  }
}
