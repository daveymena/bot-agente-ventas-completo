import fs from "fs";
import path from "path";
import initSqlJs from "sql.js";

async function run() {
  const SQL = await initSqlJs();
  const dbPath = path.resolve("data/tecnovariedades.db");
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);
  
  db.run("UPDATE products SET price = 20000, currency = 'COP' WHERE tenant_id = 1");
  
  db.run(`INSERT INTO products (tenant_id, name, description, price, currency, category, kind, is_active) 
          VALUES (1, 'MEGAPACK COMPLETO 81 EN 1', 'Acceso total a los 81 megapacks. Todas las categorías incluidas.', 60000, 'COP', 'Megapacks Digitales', 'digital', 1)`);
  
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log("✅ Precios actualizados en la base de datos a 20.000 COP y Megapack 81 a 60.000 COP");
}
run();
