import { createAIClient, getProviderConfig, getProviderConfigFromSettings } from "../lib/integrations-openai-ai-server/src/index.ts";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../artifacts/api-server/.env") });

async function testArchitect() {
  console.log("🚀 Testing AI Architect...");
  
  const aiConfig = getProviderConfig("nvidia") || getProviderConfig("github");
  
  if (!aiConfig) {
    console.error("❌ No AI configuration found in environment variables.");
    process.exit(1);
  }
  
  console.log(`📡 Using provider: ${aiConfig.baseUrl}, Model: ${aiConfig.model}`);
  
  try {
    const client = createAIClient(aiConfig);
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      messages: [
        { role: "system", content: "You are a helpful assistant. Respond in JSON format with a 'reply' field." },
        { role: "user", content: "Hola, ¿quién eres?" }
      ],
      response_format: { type: "json_object" }
    });
    
    console.log("✅ Response received:");
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error("💥 Error during AI call:");
    console.error(error);
  }
}

testArchitect();
