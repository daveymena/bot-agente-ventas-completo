// @ts-nocheck
import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

async function fixProductImages() {
  try {
    const allProducts = await db.select().from(products);
    logger.info(`Checking ${allProducts.length} products for image fixes...`);

    for (const product of allProducts) {
      if (!product.imageUrl || product.imageUrl.includes("placeholder") || product.imageUrl.includes("example.com")) {
        const query = encodeURIComponent(product.name || "product");
        const newImage = `https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=500&auto=format&fit=crop&sig=${product.id}`;
        
        await db.update(products)
          .set({ imageUrl: newImage })
          .where(eq(products.id, product.id));
         
        logger.info(`Fixed image for product: ${product.name}`);
      }
    }
    logger.info("Image fix process completed.");
  } catch (error) {
    logger.error(error, "Error fixing product images");
  }
}

fixProductImages();
