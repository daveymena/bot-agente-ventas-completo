import { db } from "@workspace/db";
import { stores, store_categories, store_products } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const deletedProducts = await db.delete(store_products).where(eq(store_products.storeId, 1));
  console.log(`Deleted ${deletedProducts.count} products`);

  const deletedCategories = await db.delete(store_categories).where(eq(store_categories.storeId, 1));
  console.log(`Deleted ${deletedCategories.count} categories`);

  const deletedStore = await db.delete(stores).where(eq(stores.slug, "sofia-premium"));
  console.log(`Deleted store: sofia-premium`);

  console.log("✅ Done!");
  process.exit(0);
}

main().catch(console.error);