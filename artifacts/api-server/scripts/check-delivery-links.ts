import { db, products } from "../../../lib/db/src/index.js";

async function checkDeliveryLinks() {
  const all = await db.select().from(products);
  let count = 0;
  for (const p of all) {
    if (p.deliveryLink) {
      console.log(`Product ID: ${p.id} | Name: ${p.name} | DeliveryLink: ${p.deliveryLink}`);
      count++;
    }
  }
  console.log(`\nTotal products with delivery links: ${count} / ${all.length}`);
  process.exit(0);
}
checkDeliveryLinks();
