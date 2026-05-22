import { db } from "@workspace/db";
import { stores, store_categories, store_products } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding store data...");

  const existingStore = await db.select().from(stores).where(eq(stores.slug, "tecnovariedades")).then(r => r[0]);
  if (existingStore) {
    console.log("✅ Store 'tecnovariedades' already exists");
    process.exit(0);
  }

  const [store] = await db.insert(stores).values({
    tenantId: 3,
    name: "TecnoVariedades",
    slug: "tecnovariedades",
    theme: { primaryColor: "#4f46e5", secondaryColor: "#7c3aed" }
  }).returning();

  console.log(`✅ Created store: ${store.name} (slug: ${store.slug})`);

  const categories = await db.insert(store_categories).values([
    { storeId: store.id, name: "Categoría 1", sortOrder: 0 },
    { storeId: store.id, name: "Categoría 2", sortOrder: 1 }
  ]).returning();

  console.log(`✅ Created ${categories.length} categories`);

  const products = await db.insert(store_products).values([
    { storeId: store.id, categoryId: categories[0].id, title: "Producto 1", price: "99.99", thumbUrl: "", description: "Descripción del producto 1" },
    { storeId: store.id, categoryId: categories[0].id, title: "Producto 2", price: "149.99", thumbUrl: "", description: "Descripción del producto 2" },
    { storeId: store.id, categoryId: categories[1].id, title: "Producto 3", price: "199.99", thumbUrl: "", description: "Descripción del producto 3" }
  ]).returning();

  console.log(`✅ Created ${products.length} products`);
  console.log("🎉 Store seeding complete!");
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Seed error:", e);
  process.exit(1);
});