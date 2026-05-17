import { db, settings, leads, agents } from "../lib/db/src/index";
import { count } from "drizzle-orm";

async function check() {
  try {
    const settingsCount = await db.select({ count: count() }).from(settings);
    const leadsCount = await db.select({ count: count() }).from(leads);
    const agentsCount = await db.select({ count: count() }).from(agents);
    
    console.log("Database Check:");
    console.log(`Settings: ${settingsCount[0].count}`);
    console.log(`Leads: ${leadsCount[0].count}`);
    console.log(`Agents: ${agentsCount[0].count}`);
    process.exit(0);
  } catch (e) {
    console.error("Database Error:", e);
    process.exit(1);
  }
}

check();
