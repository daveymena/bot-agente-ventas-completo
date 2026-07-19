#!/usr/bin/env node
/**
 * seed-pg-from-sqlite.mjs — Migra datos de SQLite a PostgreSQL
 * Lee la base SQLite existente y transfiere todos los datos a PostgreSQL.
 * Ejecutar SOLO después de migrate.mjs (para tener las tablas creadas).
 *
 * Uso: node scripts/seed-pg-from-sqlite.mjs
 * Requiere: DATABASE_URL en entorno, y data/tecnovariedades.db existente
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ── Cargar sql.js ──
let initSqlJs;
try {
  initSqlJs = (await import("sql.js")).default;
} catch {
  const req = createRequire(join(rootDir, "package.json"));
  initSqlJs = req("sql.js");
}

// ── Cargar pg ──
let Client;
try {
  const require = createRequire(join(rootDir, "lib/db/package.json"));
  Client = require("pg").Client;
} catch {
  const req = createRequire(join(rootDir, "package.json"));
  Client = req("pg").Client;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL no está definida");
  process.exit(1);
}

const SQLITE_PATH = process.env.SQLITE_PATH || "./data/tecnovariedades.db";
const fullPath = path.resolve(rootDir, SQLITE_PATH);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ No se encontró SQLite: ${fullPath}`);
  process.exit(1);
}

// ── Mapa de tablas a migrar ──
const TABLES_TO_MIGRATE = [
  "tenants", "agents", "product_categories", "products", "leads",
  "conversations", "messages", "activity_events", "settings",
  "stores", "store_categories", "store_products", "payment_links",
  "follow_ups", "subscriptions", "payments", "store_layouts",
  "whatsapp_auth", "personality_profiles", "architect_memory",
  "response_analytics", "prompt_versions", "facebook_drafts",
  "payment_transactions"
];

// Funciones helper
function cleanVal(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    if (t === "[]" || t === "{}") return t;
  }
  return v;
}

function toPgVal(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  // Escapar comillas simples duplicándolas
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function run() {
  // 1. Cargar SQLite
  console.log("📦 Cargando SQLite...");
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(rootDir, "node_modules", "sql.js", "dist", file)
  });
  const buffer = fs.readFileSync(fullPath);
  const sqliteDb = new SQL.Database(buffer);
  console.log(`✅ SQLite cargada: ${fullPath}`);

  // 2. Conectar PostgreSQL
  console.log("\n🔌 Conectando a PostgreSQL...");
  const pgClient = new Client({ connectionString: DATABASE_URL });
  await pgClient.connect();
  console.log("✅ Conectado a PostgreSQL");

  // 3. Migrar cada tabla
  for (const table of TABLES_TO_MIGRATE) {
    try {
      // Obtener columnas de SQLite
      const colInfo = sqliteDb.exec(`PRAGMA table_info(${table})`);
      if (!colInfo.length) {
        console.log(`  ⏭️  ${table}: no existe en SQLite, saltando`);
        continue;
      }

      const columns = colInfo[0].values.map(row => row[1]);
      const colNames = columns.join(", ");
      
      // Obtener datos
      const rows = sqliteDb.exec(`SELECT * FROM ${table}`);
      if (!rows.length || !rows[0].values.length) {
        console.log(`  ⏭️  ${table}: sin datos`);
        continue;
      }

      const data = rows[0].values;
      console.log(`  📤 ${table}: ${data.length} registros`);

      // Construir INSERTs
      let inserted = 0;
      for (const row of data) {
        const vals = row.map(v => {
          if (v === null || v === undefined) return "NULL";
          if (typeof v === "number") return String(v);
          if (typeof v === "bigint") return String(v);
          const s = String(v);
          // Convertir boolean SQLite (0/1)
          if (s === "0" || s === "1") {
            // Verificar si es columna booleana
            const idx = row.indexOf(v);
            if (idx >= 0 && (columns[idx]?.includes("active") || columns[idx]?.includes("enabled") || columns[idx]?.includes("verified"))) {
              return s === "1" ? "true" : "false";
            }
          }
          return `'${s.replace(/'/g, "''")}'`;
        });

        const insertSQL = `INSERT INTO ${table} (${colNames}) VALUES (${vals.join(", ")}) ON CONFLICT DO NOTHING;`;
        try {
          await pgClient.query(insertSQL);
          inserted++;
        } catch (err) {
          // Ignorar errores individuales (duplicados, etc)
        }
      }
      console.log(`  ✅ ${table}: ${inserted}/${data.length} insertados`);
    } catch (err) {
      console.error(`  ❌ ${table}: ${err.message.substring(0, 100)}`);
    }
  }

  console.log("\n🎉 Migración de datos completada");
  await pgClient.end();
  sqliteDb.close();
}

run().catch(err => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
