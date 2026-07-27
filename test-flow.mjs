import { config } from "dotenv";
import path from "path";
import fs from "fs";

// Load env
let currentDir = process.cwd();
let rootEnvPath = path.resolve(currentDir, ".env");
for (let i = 0; i < 5; i++) {
    if (fs.existsSync(rootEnvPath)) break;
    currentDir = path.dirname(currentDir);
    rootEnvPath = path.resolve(currentDir, ".env");
}
config({ path: rootEnvPath });

console.log("USE_SQLITE:", process.env.USE_SQLITE);
console.log("CWD:", process.cwd());

// Force SQLite for local testing
process.env.USE_SQLITE = "true";

const { db, ensureDbReady, conversations, messages, tenants, agents, settings, products } = await import("@workspace/db");
const { runAgentReply } = await import("./src/lib/agent.ts");
const { getActiveAgent } = await import("./src/lib/agent-router.ts");
const { loadConversationMemory } = await import("./src/lib/conversation-engine.ts");

async function main() {
    console.log("\n===== TEST START =====");
    await ensureDbReady();
    console.log("DB ready");

    // Check existing data
    const [existingTenant] = await db.select().from(tenants).limit(1);
    console.log("Tenant:", existingTenant?.name || "NONE");

    const [existingAgent] = await db.select().from(agents).where(foo => foo.isActive === true).limit(1);
    console.log("Active Agent:", existingAgent?.name || "NONE");

    const [existingSettings] = await db.select().from(settings).limit(1);
    console.log("Settings:", existingSettings?.businessName || "NONE");

    const allProducts = await db.select().from(products).limit(5);
    console.log("Products:", allProducts.length);

    // Create test conversation
    const [convo] = await db.insert(conversations).values({
        tenantId: 1,
        contactName: "Test",
        contactPhone: "573042748687",
        status: "ai",
        currentStage: "greeting"
    }).returning();
    console.log("Conversation created:", convo.id);

    // Save test message
    await db.insert(messages).values({
        conversationId: convo.id,
        role: "customer",
        content: "Hola, qué productos tienen?"
    });
    console.log("Message saved");

    // Test getActiveAgent
    const agent = await getActiveAgent("Hola, qué productos tienen?", convo.id, 1);
    console.log("Active agent:", agent?.name || null);

    // Test loadConversationMemory
    const memory = await loadConversationMemory(convo.id);
    console.log("Memory loaded, last customer message:", memory.lastCustomerMessage?.substring(0, 50));

    // Test runAgentReply
    try {
        const reply = await runAgentReply(convo.id);
        console.log("Reply received:", !!reply);
        if (reply) {
            console.log("Content:", reply.content?.substring(0, 100));
            console.log("Stage:", reply.stage);
            console.log("Parts:", reply.parts?.length);
            if (reply.parts) {
                for (const p of reply.parts) {
                    console.log(`  Part kind=${p.kind}, content=${p.kind === 'text' ? p.content?.substring(0, 50) : `productId=${p.productId}`}`);
                }
            }
        }
    } catch (err) {
        console.error("runAgentReply error:", err.message);
        console.error(err.stack);
    }

    console.log("===== TEST END =====");
}

main().catch(err => {
    console.error("Fatal:", err);
    process.exit(1);
});
