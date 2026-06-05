import { db, agents } from "../../../lib/db/src/index.js";

async function checkMetadata() {
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    if (agent.metadata) {
      console.log(`Agent ${agent.id} metadata:`, JSON.stringify(agent.metadata, null, 2));
    }
  }
  process.exit(0);
}
checkMetadata();
