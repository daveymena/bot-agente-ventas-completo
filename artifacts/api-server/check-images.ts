import { db, products } from '@workspace/db';
import { eq } from 'drizzle-orm';

async function checkImages() {
  console.log("🔍 Iniciando escaneo de imágenes en la base de datos...");
  const allProducts = await db.select().from(products);
  const results = [];

  for (const p of allProducts) {
    if (p.imageUrl && p.imageUrl.startsWith('http')) {
      try {
        const res = await fetch(p.imageUrl, { method: 'HEAD', timeout: 5000 });
        if (res.status === 404) {
          results.push({ id: p.id, name: p.name, url: p.imageUrl, status: 404 });
        }
      } catch (e) {
        results.push({ id: p.id, name: p.name, url: p.imageUrl, status: 'error' });
      }
    }
  }

  if (results.length > 0) {
    console.log(`\n❌ Se encontraron ${results.length} imágenes rotas:`);
    console.table(results);
  } else {
    console.log("\n✅ Todas las imágenes del catálogo están funcionando correctamente.");
  }
  process.exit(0);
}

checkImages();
