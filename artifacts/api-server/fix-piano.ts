import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";

async function fixPianoProduct() {
  // Show both piano products first
  const pianoProducts = await db.select().from(products);
  const pianos = pianoProducts.filter(p => 
    p.name.toLowerCase().includes('piano')
  );
  
  console.log("=== PRODUCTOS DE PIANO ENCONTRADOS ===");
  pianos.forEach(p => {
    console.log(`ID: ${p.id} | NAME: ${p.name} | DESC: ${p.description} | PRICE: ${p.price}`);
  });
  
  // Update ID 101 to match the correct 311 description
  const correctProduct = pianos.find(p => p.id === 311);
  if (!correctProduct) {
    console.log("❌ Producto ID 311 no encontrado");
    process.exit(1);
  }
  
  const [updated] = await db.update(products)
    .set({ 
      description: correctProduct.description,
      price: correctProduct.price,
    })
    .where(eq(products.id, 101))
    .returning();
  
  console.log("\n=== PRODUCTO ID 101 ACTUALIZADO ===");
  console.log(`ID: ${updated.id} | NAME: ${updated.name} | DESC: ${updated.description} | PRICE: ${updated.price}`);
  
  process.exit(0);
}

fixPianoProduct().catch(e => { console.error(e); process.exit(1); });
