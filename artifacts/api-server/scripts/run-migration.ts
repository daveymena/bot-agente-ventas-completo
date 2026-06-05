import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("🔧 Applying manual SQL migration...");
  
  try {
    // Add metadata column to agents if not exists
    await db.execute(sql`
      ALTER TABLE agents 
      ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL
    `);
    console.log("✅ agents.metadata column added (or already exists)");
  } catch (e: any) {
    console.error("❌ agents.metadata:", e.message);
  }

  try {
    // Add updated_at column to agents if not exists
    await db.execute(sql`
      ALTER TABLE agents 
      ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW()
    `);
    console.log("✅ agents.updated_at column added (or already exists)");
  } catch (e: any) {
    console.error("❌ agents.updated_at:", e.message);
  }

  try {
    // Add nvidia_api_key to settings if not exists
    await db.execute(sql`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS nvidia_api_key text DEFAULT NULL
    `);
    console.log("✅ settings.nvidia_api_key column added (or already exists)");
  } catch (e: any) {
    console.error("❌ settings.nvidia_api_key:", e.message);
  }

  try {
    // Add nvidia_model to settings if not exists
    await db.execute(sql`
      ALTER TABLE settings 
      ADD COLUMN IF NOT EXISTS nvidia_model text DEFAULT 'meta/llama-3.1-70b-instruct'
    `);
    console.log("✅ settings.nvidia_model column added (or already exists)");
  } catch (e: any) {
    console.error("❌ settings.nvidia_model:", e.message);
  }

  // Verify agents table now works
  try {
    const result = await db.execute(sql`SELECT COUNT(*) as count FROM agents`);
    console.log(`\n✅ agents table accessible — ${(result.rows[0] as any).count} agents found`);
  } catch (e: any) {
    console.error("❌ agents table still broken:", e.message);
  }

  console.log("\n🎉 Migration complete!");
  process.exit(0);
}

migrate().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
