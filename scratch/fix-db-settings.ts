import { db, settings } from "../lib/db/src/index";

async function main() {
  await db.update(settings).set({
    aiProvider: "opencode"
  });
  console.log("DB settings updated!");
  process.exit(0);
}
main();
