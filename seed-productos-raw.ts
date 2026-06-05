import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { storeTemplates } from "./packages/tienda/src/store/templates";

const DB_PATH = path.resolve("data/tecnovariedades.db");

async function seed() {
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  let db: import("sql.js").Database;
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log(`📦 DB cargada: ${DB_PATH}`);
  } else {
    db = new SQL.Database();
    console.log(`📦 DB creada: ${DB_PATH}`);
  }

  db.run("PRAGMA journal_mode=DELETE;");
  db.run("PRAGMA foreign_keys=ON;");

  // Create tables if not exist
  const tables = [
    `CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT, slug TEXT)`,
    `CREATE TABLE IF NOT EXISTS product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER, name TEXT NOT NULL, description TEXT NOT NULL, price REAL DEFAULT 0, currency TEXT DEFAULT 'USD', category_id INTEGER, category TEXT, kind TEXT DEFAULT 'digital', image_url TEXT, is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
  ];
  for (const sql of tables) {
    try { db.run(sql); } catch (err) { console.error("Error:", err); }
  }

  // Check if products exist
  const existing = db.exec("SELECT COUNT(*) as c FROM products");
  if (existing.length > 0 && existing[0].values[0][0] > 0) {
    console.log("✅ Ya hay productos");
    db.close();
    return;
  }

  let total = 0;
  for (const template of storeTemplates) {
    console.log(`\n📁 ${template.icon} ${template.name}`);
    db.run("INSERT INTO product_categories (tenant_id, name) VALUES (?, ?)", [1, template.name]);
    const catId = (db.exec("SELECT last_insert_rowid()")[0].values[0][0]) as number;

    for (const tp of template.defaultProducts) {
      db.run(
        "INSERT INTO products (tenant_id, name, description, price, currency, category_id, category, kind, image_url, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        [1, tp.name, tp.description, tp.price, "USD", catId, template.name, tp.type === "digital" ? "digital" : "physical", tp.image]
      );
      total++;
      console.log(`  ✅ ${tp.name} - $${tp.price}`);
    }
  }

  // Save to disk
  db.run("PRAGMA wal_checkpoint(TRUNCATE);");
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log(`\n🎉 ${total} productos creados y guardados 💾`);

  // Verify immediately
  const verifyDb = new SQL.Database(fs.readFileSync(DB_PATH));
  const verifyCount = verifyDb.exec("SELECT COUNT(*) FROM products")[0].values[0][0];
  console.log(`🔍 Verificación inmediata: ${verifyCount} productos en disco`);
  verifyDb.close();

  db.close();
}

seed().catch(e => { console.error("❌ Error:", e); process.exit(1); });
