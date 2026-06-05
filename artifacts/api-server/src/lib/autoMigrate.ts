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
];

export async function runAutoMigrations(): Promise<void> {
  if (!pool) {
    logger.warn("[AutoMigrate] Pool no disponible, omitiendo migraciones");
    return;
  }
  logger.info("[AutoMigrate] Verificando columnas de la base de datos...");
  for (const sql of MIGRATIONS) {
    try {
      await pool.query(sql);
    } catch (err) {
      logger.error({ err, sql }, "[AutoMigrate] Error ejecutando migración");
    }
  }
  logger.info("[AutoMigrate] Migraciones completadas");
}
