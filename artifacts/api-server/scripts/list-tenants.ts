import { db } from "@workspace/db";
import { tenants } from "@workspace/db/schema";

async function main() {
  const result = await db.select().from(tenants);
  console.log("Tenants in database:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(console.error);