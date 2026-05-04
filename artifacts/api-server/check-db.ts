import { db, products } from "@workspace/db";

async function checkProducts() {
  const p = await db.select().from(products);
  p.forEach(product => {
    console.log(`ID: ${product.id} | NAME: ${product.name} | DESC: ${product.description}`);
  });
  process.exit(0);
}

checkProducts();
