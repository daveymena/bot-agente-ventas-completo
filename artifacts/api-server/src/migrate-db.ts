import { pool } from "@workspace/db";

async function migrate() {
  console.log("🛠️ Iniciando migración manual de la tabla tenants...");
  try {
    // 1. Añadir columnas de autenticación
    await pool.query(`
      ALTER TABLE tenants 
      ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
      ADD COLUMN IF NOT EXISTS password_hash TEXT
    `);
    console.log("✅ Columnas email y password_hash añadidas/verificadas.");

    // 2. Añadir tenant_id a la tabla agents
    await pool.query(`
      ALTER TABLE agents 
      ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id)
    `);
    console.log("✅ Columna tenant_id añadida a la tabla agents.");

  } catch (err) {
    console.error("❌ Error en la migración:", err);
  }
  process.exit(0);
}

migrate();
