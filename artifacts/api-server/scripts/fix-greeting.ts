import { eq } from "drizzle-orm";
import { db, agents } from "../../../lib/db/src/index.js";

async function fixAgentMetadata() {
  const allAgents = await db.select().from(agents);
  for (const agent of allAgents) {
    if (agent.metadata && (agent.metadata as any).brandVoice) {
      let voice = (agent.metadata as any).brandVoice;
      if (voice.phrases && voice.phrases.greeting_new) {
        console.log(`Original greeting_new for agent ${agent.id}: ${voice.phrases.greeting_new}`);
        
        // Remove question
        voice.phrases.greeting_new = voice.phrases.greeting_new.replace(/¿[^?]*\?/g, "").trim();
        
        console.log(`New greeting_new for agent ${agent.id}: ${voice.phrases.greeting_new}`);
        
        await db.update(agents).set({ metadata: agent.metadata }).where(eq(agents.id, agent.id));
      }
    }
  }
  console.log("Done");
  process.exit(0);
}

fixAgentMetadata();
