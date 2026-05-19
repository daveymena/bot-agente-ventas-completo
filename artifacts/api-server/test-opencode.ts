/**
 * Prueba directa del proveedor OpenCode
 * Ejecutar: npx tsx test-opencode.ts
 */

import "@workspace/db"; // ← carga dotenv automáticamente
import { getProviderConfig, createAIClient } from "@workspace/integrations-openai-ai-server";

async function main() {
  console.log("=== PRUEBA PROVIDER OPENCODE ===\n");

  const config = getProviderConfig("opencode");
  if (!config) {
    console.log("❌ OPENCODE no configurado (falta OPENCODE_API_KEY en .env)");
    process.exit(1);
  }

  console.log(`URL:   ${config.baseUrl}`);
  console.log(`Model: ${config.model}`);
  console.log(`Key:   ${config.apiKey.substring(0, 12)}...\n`);

  // Prueba 1: Chat simple
  console.log("--- Prueba 1: Chat simple ---");
  try {
    const client = createAIClient(config);
    const resp = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: "Eres un asistente útil. Responde en máximo 10 palabras." },
        { role: "user", content: "¿Qué productos tienes?" }
      ],
      temperature: 0.3,
      max_tokens: 50,
    });
    console.log(`✅ ${resp.choices[0]?.message?.content?.trim()}`);
  } catch (err: any) {
    console.log(`❌ ${err.message.slice(0, 100)}`);
  }

  // Prueba 2: El sistema de rotación lo usa como fallback
  console.log("\n--- Prueba 2: Usabilidad en code-agent.ts ---");
  console.log("El proveedor OPENCODE está disponible como fallback en:");
  console.log("  • POST /api/code-agent/architect");
  console.log("  • POST /api/code-agent/visual-architect");
  console.log("  • Si se configura aiProvider='opencode' en settings DB");
}

main().catch(console.error);
