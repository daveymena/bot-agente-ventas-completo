import { db } from "@workspace/db";

async function run() {
  console.log("🚀 Migrando tabla settings...");
  try {
    await db.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS copilot_session_token TEXT');
    await db.execute('ALTER TABLE settings ADD COLUMN IF NOT EXISTS copilot_session_expires_at TEXT');
    console.log("✅ Columnas añadidas exitosamente.");
    
    // También asegurar que haya al menos una fila de settings
    const res = await db.execute('SELECT count(*) FROM settings');
    if (res.rows[0].count === '0') {
      console.log("📝 Creando fila de configuración por defecto...");
      await db.execute("INSERT INTO settings (business_name) VALUES ('Mi Negocio')");
    }
    
  } catch (error) {
    console.error("💥 Error durante la migración:", error);
  }
}

run();
