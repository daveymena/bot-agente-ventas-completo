import { db, products } from '@workspace/db';
import { eq } from 'drizzle-orm';

async function repairImages() {
  const brokenIds = [274, 303, 304, 270, 312, 271, 281, 299, 278];
  
  const replacements: Record<number, string> = {
    274: "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800", // Guitarra
    303: "https://images.unsplash.com/photo-1530103862676-fa392239f56e?w=800", // Globos
    304: "https://images.unsplash.com/photo-1512486130939-2c4f79935e4f?w=800", // Lettering
    270: "https://images.unsplash.com/photo-1536240478700-b869070f9279?w=800", // Video/Filmora
    312: "https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800", // Diseño
    271: "https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=800", // Mascotas
    281: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=800", // Locución
    299: "https://images.unsplash.com/photo-1583508915901-b5f84c1dc4a5?w=800", // Illustrator
    278: "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800", // Photography/Lightroom
  };

  console.log("🛠️ Reparando imágenes rotas de LoremFlickr...");

  for (const id of brokenIds) {
    const newUrl = replacements[id];
    if (newUrl) {
      await db.update(products).set({ imageUrl: newUrl }).where(eq(products.id, id));
      console.log(`✅ Producto ${id} actualizado con nueva imagen.`);
    }
  }

  console.log("\n✨ Reparación completada. El catálogo está sano de nuevo.");
  process.exit(0);
}

repairImages();
