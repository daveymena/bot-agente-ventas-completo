import { db, conversations, messages, products } from "@workspace/db";

async function cleanData() {
  try {
    console.log("🧹 Limpiando conversaciones y mensajes...\n");
    
    // Obtener todas las conversaciones
    const allConvos = await db.select().from(conversations);
    console.log(`📊 Conversaciones encontradas: ${allConvos.length}`);
    
    if (allConvos.length > 0) {
      // Eliminar todos los mensajes
      await db.delete(messages);
      console.log(`✅ Mensajes eliminados`);
      
      // Eliminar todas las conversaciones
      await db.delete(conversations);
      console.log(`✅ Conversaciones eliminadas`);
    }
    
    console.log("\n📦 Revisando productos en la base de datos...\n");
    
    // Obtener productos
    const allProducts = await db.select().from(products);
    console.log(`📊 Total de productos: ${allProducts.length}`);
    
    if (allProducts.length === 0) {
      console.log("⚠️  No hay productos en la base de datos");
    } else {
      console.log("\n📋 Primeros 10 productos:");
      allProducts.slice(0, 10).forEach((p, i) => {
        console.log(`\n${i + 1}. ${p.name}`);
        console.log(`   ID: ${p.id}`);
        console.log(`   Precio: ${p.price}`);
        console.log(`   Activo: ${p.isActive}`);
        console.log(`   Categoría ID: ${p.categoryId}`);
      });
    }
    
    console.log("\n✅ Limpieza completada");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

cleanData();
