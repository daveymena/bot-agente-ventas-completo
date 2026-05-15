import dotenv from 'dotenv';
import { createAIClient, getProviderConfig } from './artifacts/api-server/src/lib/integrations-openai-ai-server/src/provider.ts';
import { healthMonitor } from './artifacts/api-server/src/lib/fallbackSystem.ts';

dotenv.config();

async function testAI() {
  console.log("🚀 Iniciando prueba de IA local...");
  
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN;
  console.log("Token Copilot detectado:", copilotToken ? copilotToken.substring(0, 20) + "..." : "NO");

  const config = {
    apiKey: copilotToken,
    baseUrl: "https://api.githubcopilot.com",
    model: "gpt-4o"
  };

  try {
    console.log("🔧 Creando cliente...");
    const client = createAIClient(config);
    
    console.log("📡 Enviando mensaje de prueba...");
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: "Hola, ¿quién eres?" }],
    });

    console.log("✅ RESPUESTA RECIBIDA:", completion.choices[0].message.content);
  } catch (error) {
    console.error("❌ ERROR EN LA PRUEBA:", error);
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Body:", await error.response.text());
    }
  }
}

testAI();
