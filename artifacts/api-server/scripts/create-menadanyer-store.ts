import { db, stores } from "@workspace/db";
import { eq } from "drizzle-orm";

async function createStore() {
  console.log("🌱 Creating menadanyer store for tenant 1...");

  // Check if store already exists
  const existingStore = await db.select().from(stores).where(eq(stores.slug, "menadanyer")).then(r => r[0]);
  if (existingStore) {
    console.log("✅ Store 'menadanyer' already exists");
    process.exit(0);
  }

  const [store] = await db.insert(stores).values({
    tenantId: 1,
    name: "Menadanyer Store",
    slug: "menadanyer",
  }).returning();

  console.log(`✅ Created store: ${store.name} (slug: ${store.slug})`);
  console.log("🎉 Store creation complete!");
  process.exit(0);
}

createStore().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
