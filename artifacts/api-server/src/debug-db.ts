import { pool } from "@workspace/db";

async function debug() {
  console.log("🔍 Consultando columnas de la tabla tenants...");
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'agents'
    `);
    console.log("✅ Columnas de agents:", res.rows.map(r => r.column_name).join(", "));
  } catch (err) {
    console.error("❌ Error consultando columnas:", err);
  }
  process.exit(0);
}

debug();
