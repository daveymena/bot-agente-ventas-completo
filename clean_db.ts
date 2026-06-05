
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { messages, conversations, leads, activityEvents } from "./lib/db/src/schema";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

let dbUrl = process.env.DATABASE_URL || "";
if (dbUrl.includes("@base")) {
  dbUrl = dbUrl.replace("@base", "@79.143.187.160");
}

const { Pool } = pg;
const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: dbUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false }
});

const db = drizzle(pool);

async function clean() {
  console.log('🧹 Iniciando limpieza de base de datos...');
  try {
    // El orden importa por las llaves foráneas
    console.log('  - Borrando mensajes...');
    await db.delete(messages);
    console.log('  - Borrando eventos de actividad...');
    await db.delete(activityEvents);
    console.log('  - Borrando conversaciones...');
    await db.delete(conversations);
    console.log('  - Borrando leads...');
    await db.delete(leads);
    
    console.log('✅ Base de datos limpia (conversaciones, mensajes y leads eliminados).');
  } catch (err) {
    console.error('❌ Error limpiando base de datos:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

clean();
