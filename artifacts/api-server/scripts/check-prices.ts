import { db } from "../src/lib/../../../packages/db/src/index";
// Wait, the correct path from artifacts/api-server/scripts/check-prices.ts to db index:
// api-server is in artifacts/api-server
// lib/db is in lib/db
import { db, products } from "../../../lib/db/src/index.js";

async function check() {
  const all = await db.select().from(products);
  for (const p of all) {
    console.log(`ID: ${p.id} | Price: ${p.price} | Name: ${p.name}`);
  }
  process.exit(0);
}
check();
