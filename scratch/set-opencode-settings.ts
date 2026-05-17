import { db } from "@workspace/db";

async function run() {
  console.log("=========================================");
  console.log("🛠️ CONFIGURANDO OPENCODE IA EN BASE DE DATOS");
  console.log("=========================================");
  
  try {
    // 1. Asegurar que exista al menos una fila de settings
    const checkRes = await db.execute('SELECT count(*) FROM settings');
    const count = parseInt(checkRes.rows[0].count as string || "0");
    
    if (count === 0) {
      console.log("📝 No existe configuración previa. Creando fila por defecto...");
      await db.execute(`
        INSERT INTO settings (
          business_name, 
          ai_provider, 
          github_model
        ) VALUES (
          'Mi Negocio', 
          'opencode', 
          'deepseek-v4-flash'
        )
      `);
    } else {
      console.log("📝 Actualizando configuración existente a OpenCode...");
      await db.execute(`
        UPDATE settings 
        SET 
          ai_provider = 'opencode', 
          github_model = 'deepseek-v4-flash'
      `);
    }
    
    console.log("✅ ¡Base de datos actualizada con éxito!");
    console.log("   ai_provider  -> 'opencode'");
    console.log("   github_model -> 'deepseek-v4-flash'");
    console.log("=========================================");
    
  } catch (error) {
    console.error("💥 Error actualizando la base de datos:", error);
  }
  
  process.exit(0);
}

run();
