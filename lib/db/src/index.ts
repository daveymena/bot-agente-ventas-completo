import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { config } from "dotenv";
import path from "path";

import fs from "fs";

// BUSCADOR INTELIGENTE DE .ENV (Sube hasta 5 niveles para encontrar la raíz)
let currentDir = process.cwd();
let rootEnvPath = path.resolve(currentDir, ".env");

for (let i = 0; i < 5; i++) {
  if (fs.existsSync(rootEnvPath)) {
    const stats = fs.statSync(rootEnvPath);
    // Si el archivo existe pero es muy pequeño (vacío o anulado), seguimos buscando
    if (stats.size > 100) {
      break;
    }
  }
  currentDir = path.dirname(currentDir);
  rootEnvPath = path.resolve(currentDir, ".env");
}

console.log(`🔍 [DOTENV] Buscando configuración en: ${rootEnvPath}`);
config({ path: rootEnvPath });

let dbUrl = process.env.DATABASE_URL || "";

// PARCHE DE EMERGENCIA: Si el host es "base", lo cambiamos por la IP real
if (dbUrl.includes("@base")) {
  console.log("⚠️ [DB-REPAIR] Detectado host 'base' incorrecto. Corrigiendo a la IP real...");
  dbUrl = dbUrl.replace("@base", "@79.143.187.160");
}

// Debug log (con censura de contraseña por seguridad)
if (dbUrl) {
  const sanitizedUrl = dbUrl.replace(/:([^:@]+)@/, ":****@");
  console.log(`📡 [DB-CONNECTION] Intentando conectar a: ${sanitizedUrl}`);
}

const { Pool } = pg;

if (!dbUrl) {
  throw new Error("DATABASE_URL must be set. Please check your root .env file.");
}

export const pool = new Pool({ 
  connectionString: dbUrl,
  ssl: dbUrl.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
  // OPTIMIZACIONES PARA EASYPANEL (Conexión remota lenta)
  max: 20,                    // Máximo de conexiones simultáneas
  min: 5,                     // Mínimo de conexiones en pool
  idleTimeoutMillis: 30000,   // Cerrar conexión inactiva después de 30s
  connectionTimeoutMillis: 5000, // Timeout de conexión: 5 segundos
  statement_timeout: 10000,   // Timeout de query: 10 segundos
  query_timeout: 10000,       // Timeout de query: 10 segundos
});
export const db = drizzle(pool, { schema });

export * from "./schema";
