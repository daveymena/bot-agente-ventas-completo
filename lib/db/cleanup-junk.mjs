/**
 * Script de limpieza: elimina las imágenes basura que el primer script automático
 * descargó por error (Wikipedia, íconos, fotos sin relación) y resetea esos
 * productos para que el Arquitecto los pueda arreglar con search_product_images.
 */
import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, statSync, unlinkSync } from 'fs';
import path from 'path';

const DB_PATH = path.resolve('../../data/tecnovariedades.db');
const IMAGES_DIR = path.resolve('../../data/images/products');

// Productos que sabemos que recibieron imágenes basura (Trump, dictador, bandera, etc.)
const JUNK_PRODUCT_IDS = [113, 114, 115, 116, 117, 118, 121];

async function run() {
  const SQL = await initSqlJs();
  const buffer = readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  console.log('🧹 Limpiando imágenes basura de productos...\n');

  for (const id of JUNK_PRODUCT_IDS) {
    const res = db.exec(`SELECT id, name, image_url FROM products WHERE id = ${id};`);
    if (res.length === 0 || res[0].values.length === 0) continue;
    
    const [_, name, imageUrl] = res[0].values[0];
    console.log(`[${id}] ${name}`);
    console.log(`  URL actual: ${imageUrl}`);

    // Resetear a cadena vacía para que el Arquitecto sepa que falta
    db.run(`UPDATE products SET image_url = '' WHERE id = ${id};`);
    console.log(`  ✅ Imagen reseteada (vacía). El Arquitecto la buscará con search_product_images.\n`);

    // Eliminar el archivo físico si existe
    if (typeof imageUrl === 'string' && imageUrl.includes('/uploads/products/')) {
      const filename = imageUrl.split('/uploads/products/')[1]?.split('?')[0];
      if (filename) {
        const filepath = path.resolve('../../data/images/products', filename);
        if (existsSync(filepath)) {
          const stats = statSync(filepath);
          // Si es menor a 10KB probablemente es un ícono/sprite basura
          if (stats.size < 50000) {
            unlinkSync(filepath);
            console.log(`  🗑️ Archivo eliminado: ${filename} (${stats.size} bytes - basura)\n`);
          }
        }
      }
    }
  }

  // Guardar la BD
  const data = db.export();
  writeFileSync(DB_PATH, Buffer.from(data));
  console.log('💾 Base de datos guardada.');
  console.log(`\n✅ Listo. ${JUNK_PRODUCT_IDS.length} productos limpiados.`);
  console.log('Ahora el Arquitecto puede buscar imágenes profesionales con search_product_images.');
}

run().catch(console.error);
