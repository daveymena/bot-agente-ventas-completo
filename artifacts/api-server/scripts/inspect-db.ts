import { db, agents } from "@workspace/db";

async function main() {
  try {
    const allAgents = await db.select().from(agents);
    console.log(`Found ${allAgents.length} agents:`);
    allAgents.forEach(a => {
      console.log(`- ID: ${a.id}, Name: ${a.name}, Active: ${a.isActive}`);
    });
  } catch (e) {
    console.error("Error inspecting agents table:", e);
  }
}

main();
