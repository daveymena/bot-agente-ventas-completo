import { pool } from "@workspace/db";
import { logger } from "./logger";

const MIGRATIONS = [
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_theme TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS brand_social JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS woocommerce_integration JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_verification_expiry TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_code TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS password_reset_expiry TIMESTAMP WITH TIME ZONE`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS facebook_integration JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email_config JSONB`,
  `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS api_keys JSONB`,
  `ALTER TABLE leads ADD COLUMN IF NOT EXISTS opt_out BOOLEAN NOT NULL DEFAULT false`,
  // El admin pidió separar categorías de productos Digitales vs Físicas --
  // hoy cualquier categoría se puede usar para cualquier tipo de producto,
  // sin ninguna restricción. description/icon/color ya existían en la DB
  // real (usados por routes/categories.ts) pero no en este esquema; se
  // agregan acá también por las dudas, de forma idempotente.
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS icon TEXT`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6b7280'`,
  `ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'digital'`,
  // Fotos múltiples para borradores de Facebook (carrusel) -- antes solo
  // existía image_url (una sola imagen por anuncio).
  `ALTER TABLE facebook_drafts ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'`,
  // ── Dropshipping ──────────────────────────────────────────────────────────
  // Un producto fisico no se entrega con un link de Google Drive: hay que
  // pedirle al cliente a donde se lo mandan y despachar. Hasta ahora no habia
  // NINGUN lugar donde guardar eso -- ni `leads` ni `conversations` tenian un
  // solo campo de direccion, y no existia tabla de pedidos. El agente podia
  // cerrar la venta y los datos se perdian.
  `ALTER TABLE agents ADD COLUMN IF NOT EXISTS especialidad TEXT`,
  `CREATE TABLE IF NOT EXISTS dropshipping_orders (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    lead_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2),
    total NUMERIC(12,2),
    -- Datos de envio. Nombres en el orden en que se le piden al cliente.
    nombre TEXT,
    telefono TEXT,
    documento TEXT,
    departamento TEXT,
    ciudad TEXT,
    direccion TEXT,
    barrio TEXT,
    notas TEXT,
    -- 'contraentrega' es el metodo por defecto en dropshipping colombiano.
    metodo_pago TEXT NOT NULL DEFAULT 'contraentrega',
    -- borrador -> datos completos -> enviado a woocommerce -> despachado
    estado TEXT NOT NULL DEFAULT 'borrador',
    woo_order_id INTEGER,
    woo_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS dropshipping_orders_conv_idx ON dropshipping_orders (conversation_id)`,
  `CREATE INDEX IF NOT EXISTS dropshipping_orders_estado_idx ON dropshipping_orders (tenant_id, estado)`,
  `CREATE TABLE IF NOT EXISTS remarketing_campaigns (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    segment TEXT,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    pending_lead_ids JSONB NOT NULL DEFAULT '[]',
    total_targeted INTEGER NOT NULL DEFAULT 0,
    total_sent INTEGER NOT NULL DEFAULT 0,
    total_failed INTEGER NOT NULL DEFAULT 0,
    total_opted_out INTEGER NOT NULL DEFAULT 0,
    results JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE
  )`,
];

export async function runAutoMigrations(): Promise<void> {
  if (!pool) {
    logger.warn("[AutoMigrate] Pool no disponible, omitiendo migraciones");
    return;
  }
  logger.info("[AutoMigrate] Verificando columnas de la base de datos...");
  for (const sql of MIGRATIONS) {
    try {
      await pool.query(`SET lock_timeout = '5s'`);
      await pool.query(`SET statement_timeout = '10s'`);
      await pool.query(sql);
    } catch (err) {
      logger.error({ err, sql }, "[AutoMigrate] Error ejecutando migración");
    }
  }
  logger.info("[AutoMigrate] Migraciones completadas");
}
