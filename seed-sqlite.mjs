import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import initSqlJs from "sql.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const SQL = await initSqlJs({
    locateFile: file => path.join(__dirname, "node_modules", "sql.js", "dist", file)
  });

  const dbPath = path.resolve(__dirname, "data/tecnovariedades.db");
  const fullPath = path.resolve(dbPath);
  
  let sqliteDb;
  if (fs.existsSync(fullPath)) {
    const buffer = fs.readFileSync(fullPath);
    sqliteDb = new SQL.Database(buffer);
    console.log(`📦 [SQLite] Base cargada: ${fullPath}`);
  } else {
    console.error("❌ No se encontró la base de datos. Debes arrancar el servidor primero para que la cree.");
    process.exit(1);
  }

  // Verificar la categoría 'Megapacks Digitales'
  let catId = 1;
  try {
    const res = sqliteDb.exec("SELECT id FROM product_categories WHERE tenant_id = 1 LIMIT 1");
    if (res.length > 0 && res[0].values.length > 0) {
      catId = res[0].values[0][0];
    } else {
      sqliteDb.run("INSERT INTO product_categories (tenant_id, name) VALUES (1, 'Megapacks Digitales')");
      const res2 = sqliteDb.exec("SELECT id FROM product_categories WHERE tenant_id = 1 ORDER BY id DESC LIMIT 1");
      catId = res2[0].values[0][0];
    }
  } catch(e) {
    console.error(e);
  }

  // Leer productos
  const jsonPath = path.resolve(__dirname, "products-full.json");
  console.log(`📄 Leyendo productos desde: ${jsonPath}`);
  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const productsData = JSON.parse(rawData);
  console.log(`📊 Total de productos: ${productsData.length}`);

  // Limpiar productos anteriores
  sqliteDb.run("DELETE FROM products WHERE tenant_id = 1");
  console.log("🗑️  Productos anteriores eliminados");

  let inserted = 0;
  let errors = 0;

  for (const p of productsData) {
    try {
      sqliteDb.run(
        `INSERT INTO products 
          (tenant_id, name, description, price, currency, category_id, category, kind, image_url, delivery_link, features, is_active, metadata)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          1,
          p.name,
          p.description,
          p.price,
          p.currency || "USD",
          catId,
          p.category,
          p.kind || "digital",
          p.image_url || null,
          p.deliveryLink || null,
          p.features ? JSON.stringify(p.features) : "[]",
          1,
          JSON.stringify({ drive_folder_id: p.drive_folder_id || null }),
        ]
      );
      inserted++;
    } catch (err) {
      errors++;
      console.error(`   ❌ Error en: ${p.name} — ${err.message}`);
    }
  }

  console.log(`\n✅ COMPLETADO: ${inserted} productos insertados, ${errors} errores`);

  // Guardar DB
  const data = sqliteDb.export();
  fs.writeFileSync(fullPath, Buffer.from(data));
  console.log("💾 Base de datos guardada.");
  
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Error fatal:", err.message);
  process.exit(1);
});
