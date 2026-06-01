import { db, products, saveDbToDisk, ensureDbReady } from "@workspace/db";
import { readFileSync } from "fs";
import { join } from "path";

async function insertProducts() {
  console.log("🌱 Insertando productos desde Google Drive...\n");

  // Esperar a que la base de datos esté lista
  await ensureDbReady();
  console.log("✅ Base de datos lista\n");

  // Leer el archivo JSON
  const productsPath = join(__dirname, "products-full.json");
  const productsData = JSON.parse(readFileSync(productsPath, "utf8"));

  console.log(`📊 Cargando ${productsData.length} productos...\n`);

  // Verificar si ya hay productos y eliminarlos
  const existentes = await db.select().from(products);
  if (existentes.length > 0) {
    console.log(`⚠️  Encontrados ${existentes.length} productos existentes`);
    console.log("🗑️  Eliminando productos antiguos...");
    await db.delete(products);
    console.log("✅ Productos antiguos eliminados\n");
  }

  let inserted = 0;
  let errors = 0;

  for (const product of productsData) {
    try {
      await db.insert(products).values({
        tenantId: 1,
        name: product.name,
        description: product.description,
        price: product.price,
        currency: product.currency,
        categoryId: 1,
        category: product.category,
        kind: product.kind,
        imageUrl: product.image_url,
        driveFolderId: product.drive_folder_id,
        driveUrl: product.drive_url,
        isActive: true,
      });
      inserted++;
      
      if (inserted % 10 === 0) {
        console.log(`   Insertados: ${inserted}/${productsData.length}`);
      }
    } catch (err) {
      console.error(`❌ Error al insertar ${product.name}:`, err);
      errors++;
    }
  }

  console.log(`\n✅ ¡Completado!`);
  console.log(`   Insertados: ${inserted}`);
  console.log(`   Errores: ${errors}`);

  // Guardar a disco
  if (saveDbToDisk) {
    saveDbToDisk();
    console.log("💾 Datos guardados en disco");
  }

  process.exit(0);
}

insertProducts().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
