/**
 * Prueba rápida de proveedores IA
 * Ejecutar: npx tsx test-providers.ts
 */

import { db, settings as settingsTable } from "@workspace/db";
import { getProviderConfig, getProviderConfigFromSettings, createAIClient } from "@workspace/integrations-openai-ai-server";

async function testProvider(name: string, config: any) {
  if (!config) {
    console.log(`  ⬜ ${name}: no configurado`);
    return;
  }
  const keyPreview = config.apiKey ? config.apiKey.substring(0, 12) + "..." : "sin key";
  console.log(`  🔄 ${name}: ${config.model} | ${keyPreview}`);
  try {
    const client = createAIClient(config);
    const resp = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: "Responde SOLO: OK" }],
      temperature: 0.1,
      max_tokens: 10,
    });
    const text = resp.choices[0]?.message?.content?.trim() || "vacío";
    console.log(`  ✅ ${name}: "${text}"`);
  } catch (err: any) {
    console.log(`  ❌ ${name}: ${err.message.slice(0, 80)}`);
  }
}

async function main() {
  console.log("=== PROVEEDORES IA ===\n");

  const [settings] = await db.select().from(settingsTable).limit(1);
  console.log(`Activo en BD: ${settings?.aiProvider || "ninguno"}\n`);

  // Probar cada proveedor
  await testProvider("nvidia_70b (lento)", getProviderConfig("nvidia"));
  await testProvider("nvidia_8b (rápido)", getProviderConfig("nvidia_fast"));
  await testProvider("github_copilot", getProviderConfig("github_copilot_internal"));
  await testProvider("github_env", getProviderConfig("github"));
  await testProvider("ollama_local", getProviderConfig("ollama_local"));
  await testProvider("settings (BD)", settings ? getProviderConfigFromSettings(settings) : null);

  console.log("\n=== PRUEBA COMPLETA ===");
}

main().catch(console.error);
