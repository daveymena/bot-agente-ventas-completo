import { db, settings } from "@workspace/db";

async function checkSettings() {
  const [s] = await db.select().from(settings).limit(1);
  console.log("⚙️ CURRENT SETTINGS:");
  console.log(JSON.stringify(s, null, 2));
}

checkSettings();
