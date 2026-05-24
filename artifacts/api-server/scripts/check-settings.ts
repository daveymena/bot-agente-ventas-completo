import { db, settings } from "../../../lib/db/src/index.js";

async function checkSettings() {
  const allSettings = await db.select().from(settings);
  for (const s of allSettings) {
    console.log(`Setting ID ${s.id}:`);
    if (s.brandVoice) {
      console.log(JSON.stringify(s.brandVoice, null, 2));
    } else {
      console.log("No brandVoice field");
    }
  }
  process.exit(0);
}
checkSettings();
