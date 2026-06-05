import { ensureDbReady, products, productCategories } from "@workspace/db";
import * as fs from "fs";
import * as path from "path";

async function seed() {
  console.log("⏳ Conectando a la base de datos Postgres...");
  const { db } = await ensureDbReady();
  console.log("✅ Base de datos conectada.");

  const jsonPath = path.resolve(process.cwd(), "../../products-full.json");
  console.log(`📄 Leyendo productos desde: ${jsonPath}`);
  
  const rawData = fs.readFileSync(jsonPath, "utf-8");
  const productsData = JSON.parse(rawData);

  console.log(`📊 Total de productos a insertar: ${productsData.length}`);

  // Insertar un categoryId por defecto si no existe
  let catId = 1;
  try {
    const cats = await db.select().from(productCategories);
    if (cats.length === 0) {
      const insertedCat = await db.insert(productCategories).values({
        tenantId: 1,
        name: "General"
      }).returning();
      catId = insertedCat[0].id;
    } else {
      catId = cats[0].id;
    }
  } catch(e) {
    console.log("⚠️ Error comprobando categorías, se usará categoryId = 1", e);
  }

  // Insertar cada producto
  let count = 0;
  for (const p of productsData) {
    try {
      await db.insert(products).values({
        tenantId: 1,
        name: p.name,
        description: p.description,
        price: p.price.toString(),
        currency: p.currency || "USD",
        categoryId: catId,
        category: p.category,
        kind: p.kind || "digital",
        imageUrl: p.image_url,
        deliveryLink: p.deliveryLink,
        features: p.features || [],
        isActive: true,
        metadata: JSON.stringify({ drive_folder_id: p.drive_folder_id })
      });
      count++;
      if (count % 10 === 0) {
        console.log(`   Insertados: ${count}/${productsData.length}`);
      }
    } catch (err) {
      console.error(`❌ Error insertando producto: ${p.name}`, err);
    }
  }

  console.log(`\n✅ Proceso completado. Productos insertados: ${count}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Error en el script de seed:", err);
  process.exit(1);
});
