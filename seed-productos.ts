import { db, productCategories, products, saveDbToDisk } from "@workspace/db";
import { ensureDbReady } from "@workspace/db";

async function seedProductos() {
  await ensureDbReady();
  console.log("🌱 Sembrando productos desde plantillas...\n");

  const { storeTemplates } = await import("./packages/tienda/src/store/templates");

  // Verificar si ya hay productos
  const existentes = await db.select().from(products).limit(1);
  if (existentes.length > 0) {
    console.log("✅ Ya hay productos en la base de datos");
    process.exit(0);
  }

  const tenantId = 1;
  let totalProductos = 0;

  for (const template of storeTemplates) {
    console.log(`\n📁 ${template.icon} ${template.name}`);

    // Crear categoría
    const [cat] = await db.insert(productCategories).values({
      tenantId,
      name: template.name,
    }).returning();

    // Crear productos de esta categoría
    for (const tp of template.defaultProducts) {
      await db.insert(products).values({
        tenantId,
        name: tp.name,
        description: tp.description,
        price: tp.price,
        currency: "USD",
        categoryId: cat.id,
        category: template.name,
        kind: tp.type === "digital" ? "digital" : "physical",
        imageUrl: tp.image,
        isActive: true,
      });
      totalProductos++;
      console.log(`  ✅ ${tp.name} - $${tp.price}`);
    }
  }

  console.log(`\n🎉 ${totalProductos} productos creados exitosamente`);

  // Guardar a disco
  if (saveDbToDisk) saveDbToDisk();
  console.log("💾 Datos guardados en disco");

  process.exit(0);
}

seedProductos().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
