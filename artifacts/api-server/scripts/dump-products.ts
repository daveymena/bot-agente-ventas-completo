import { db, products } from "../../../lib/db/src/index.js";
import { asc } from "drizzle-orm";

async function dumpProducts() {
  const all = await db.select().from(products).orderBy(asc(products.id));
  console.log("Total products:", all.length);
  for (const p of all) {
    console.log(`ID: ${p.id} | Name: ${p.name}`);
  }
  process.exit(0);
}
dumpProducts();
