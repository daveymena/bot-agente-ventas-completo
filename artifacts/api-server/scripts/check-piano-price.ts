import { db, products } from "../../../lib/db/src/index.js";
import { eq } from "drizzle-orm";

async function checkPrice() {
  const all = await db.select().from(products);
  for (const p of all) {
    if (p.name.toLowerCase().includes("piano")) {
      console.log(`ID: ${p.id} | Name: ${p.name} | Price: ${p.price}`);
    }
  }
  process.exit(0);
}
checkPrice();
