import { db, products, ensureDbReady } from "@workspace/db";
import { writeFileSync } from "fs";
import { join } from "path";

async function exportAllProducts() {
  console.log("📤 Exportando todos los productos de la base de datos...\n");

  await ensureDbReady();
  console.log("✅ Base de datos lista\n");

  // Obtener todos los productos
  const allProducts = await db.select().from(products);

  console.log(`📊 Total de productos encontrados: ${allProducts.length}\n`);

  // Convertir a formato JSON limpio
  const productsJson = allProducts.map((p) => ({
    id: p.id,
    tenantId: p.tenantId,
    name: p.name,
    description: p.description,
    price: parseFloat(p.price),
    currency: p.currency,
    sku: p.sku,
    categoryId: p.categoryId,
    category: p.category,
    kind: p.kind,
    imageUrl: p.imageUrl,
    highlight: p.highlight,
    features: p.features,
    paymentLink: p.paymentLink,
    deliveryLink: p.deliveryLink,
    isActive: p.isActive,
    metadata: p.metadata,
    createdAt: p.createdAt,
  }));

  // Guardar a archivo JSON
  const outputPath = join(__dirname, "productos-db-completo.json");
  writeFileSync(outputPath, JSON.stringify(productsJson, null, 2), "utf8");

  console.log(`✅ Productos exportados exitosamente a: productos-db-completo.json\n`);

  // Mostrar resumen
  console.log("📊 Resumen de la exportación:");
  console.log(`   Total de productos: ${productsJson.length}`);

  const byPrice = productsJson.reduce((acc, p) => {
    const price = p.price;
    acc[price] = (acc[price] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  console.log("\n💰 Distribución de precios:");
  Object.entries(byPrice)
    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
    .forEach(([price, count]) => {
      console.log(`   ${parseFloat(price).toLocaleString('es-CO')} COP: ${count} productos`);
    });

  const byCategory = productsJson.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("\n📁 Distribución por categoría:");
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} productos`);
    });

  console.log("\n✅ Archivo JSON listo para usar!");

  process.exit(0);
}

exportAllProducts().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
