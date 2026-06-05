// Script para insertar Megapacks en la base de datos SQLite
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Leer el archivo JSON
const megapacksPath = path.join(__dirname, 'megapacks-organized.json');
const products = JSON.parse(fs.readFileSync(megapacksPath, 'utf8'));

console.log(`\n📊 Cargando ${products.length} Megapacks desde JSON...\n`);

// Conectar a la base de datos
const dbPath = path.join(__dirname, 'data', 'tecnovariedades.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err.message);
    process.exit(1);
  }
  console.log('✅ Conectado a la base de datos:', dbPath);
});

// Crear tabla si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER DEFAULT 1,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    price REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    category_id INTEGER,
    category TEXT,
    kind TEXT DEFAULT 'digital',
    image_url TEXT,
    drive_folder_id TEXT,
    drive_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )
`, (err) => {
  if (err) {
    console.error('❌ Error al crear tabla:', err.message);
    db.close();
    process.exit(1);
  }
  console.log('✅ Tabla products lista\n');
});

// Insertar productos
let inserted = 0;
let errors = 0;

products.forEach((product, index) => {
  const sql = `
    INSERT INTO products 
    (tenant_id, name, description, price, currency, category_id, category, kind, image_url, drive_folder_id, drive_url, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `;
  
  const params = [
    1, // tenant_id
    product.name,
    product.description,
    product.price,
    product.currency,
    1, // category_id
    product.category,
    product.kind,
    product.image_url,
    product.drive_folder_id,
    product.drive_url
  ];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error(`❌ Error al insertar ${product.name}:`, err.message);
      errors++;
    } else {
      inserted++;
      if (inserted % 10 === 0) {
        console.log(`   Insertados: ${inserted}/${products.length}`);
      }
    }
    
    // Cerrar cuando termine
    if (inserted + errors === products.length) {
      console.log(`\n✅ ¡Completado!`);
      console.log(`   Insertados: ${inserted}`);
      console.log(`   Errores: ${errors}`);
      db.close();
    }
  });
});
