import { db, products, ensureDbReady } from "@workspace/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

async function updateDriveUrls() {
  console.log("🔄 Actualizando URLs de Google Drive...\n");

  await ensureDbReady();
  console.log("✅ Base de datos lista\n");

  // Leer el archivo JSON con la información correcta
  const productsPath = join(__dirname, "productos-completos-cop.json");
  const productsData = JSON.parse(readFileSync(productsPath, "utf8"));

  console.log(`📊 Actualizando ${productsData.length} productos...\n`);

  let updated = 0;
  let errors = 0;

  for (const product of productsData) {
    try {
      // Buscar el producto por nombre
      const existing = await db
        .select()
        .from(products)
        .where(eq(products.name, product.name))
        .limit(1);

      if (existing.length > 0) {
        // Actualizar el producto con la información completa
        await db
          .update(products)
          .set({
            description: product.description,
            category: product.category,
            imageUrl: product.image_url,
            deliveryLink: product.drive_url,
          })
          .where(eq(products.id, existing[0].id));

        updated++;

        if (updated % 10 === 0) {
          console.log(`   Actualizados: ${updated}/${productsData.length}`);
        }
      } else {
        console.log(`⚠️  Producto no encontrado: ${product.name}`);
        errors++;
      }
    } catch (err) {
      console.error(`❌ Error al actualizar ${product.name}:`, err);
      errors++;
    }
  }

  console.log(`\n✅ ¡Completado!`);
  console.log(`   Actualizados: ${updated}`);
  console.log(`   Errores: ${errors}`);

  process.exit(0);
}

updateDriveUrls().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
