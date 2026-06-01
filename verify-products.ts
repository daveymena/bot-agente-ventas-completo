import { db, products, ensureDbReady } from "@workspace/db";

async function verifyProducts() {
  console.log("🔍 Verificando productos en la base de datos...\n");

  await ensureDbReady();

  // Obtener todos los productos
  const allProducts = await db.select().from(products);
  
  console.log(`📊 Total de productos: ${allProducts.length}\n`);

  // Mostrar los primeros 10 productos
  console.log("📋 Primeros 10 productos:\n");
  allProducts.slice(0, 10).forEach((p, i) => {
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   💰 Precio: $${p.price} ${p.currency}`);
    console.log(`   📁 Categoría: ${p.category}`);
    console.log(`   🔗 Drive: ${p.driveUrl}`);
    console.log(`   ✅ Activo: ${p.isActive}\n`);
  });

  // Agrupar por categoría
  const byCategory = allProducts.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log("📊 Productos por categoría:");
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count} productos`);
    });

  // Agrupar por precio
  console.log("\n💰 Productos por precio:");
  const byPrice = allProducts.reduce((acc, p) => {
    const price = `$${p.price}`;
    acc[price] = (acc[price] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byPrice)
    .sort((a, b) => parseFloat(a[0].slice(1)) - parseFloat(b[0].slice(1)))
    .forEach(([price, count]) => {
      console.log(`   ${price}: ${count} productos`);
    });

  process.exit(0);
}

verifyProducts().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
