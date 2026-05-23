import "dotenv/config";
import { db } from "../src/index.ts";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Creating store_layouts table...");
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS store_layouts (
      id SERIAL PRIMARY KEY,
      store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
      layout_data JSONB NOT NULL DEFAULT '{}',
      version TEXT NOT NULL DEFAULT '1',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log("✓ store_layouts table created successfully");
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
