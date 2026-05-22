import { db } from "@workspace/db";
import { stores } from "@workspace/db/schema";

async function main() {
  const result = await db.select().from(stores);
  console.log("Stores in database:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(console.error);