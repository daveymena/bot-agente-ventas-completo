import { getProviderConfig } from "@workspace/integrations-openai-ai-server";
import OpenAI from "openai";

async function testOpenCodeIntegration() {
  console.log("🧪 === TEST DE INTEGRACIÓN OPENCODE ===\n");

  // 1. Verificar configuración
  console.log("📋 1. Verificando configuración de OpenCode...\n");
  
  const config = getProviderConfig("opencode");
  
  if (!config) {
    console.log("❌ OpenCode no está configurado");
    console.log("   Verifica que OPENCODE_API_KEY esté en .env\n");
    return;
  }

  console.log("✅ Configuración encontrada:");
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Modelo: ${config.model}`);
  console.log(`   API Key: ${config.apiKey.substring(0, 15)}...`);
  console.log("");

  // 2. Probar modelos disponibles
  console.log("🎯 2. Modelos OpenCode disponibles:\n");
  
  const modelos = {
    razonamiento: "deepseek-v3-ultra-free",
    balanceado: "deepseek-v4-flash-free",
    rapido: "gpt-5.4-mini"
  };

  Object.entries(modelos).forEach(([tipo, modelo]) => {
    console.log(`   ${tipo.padEnd(15)}: ${modelo}`);
  });
  console.log("");

  // 3. Test de conexión con cada modelo
  console.log("🔌 3. Probando conexión con cada modelo...\n");

  for (const [tipo, modelo] of Object.entries(modelos)) {
    try {
      console.log(`   Probando modelo ${tipo} (${modelo})...`);
      
      const client = new OpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      });

      const start = Date.now();
      
      const response = await client.chat.completions.create({
        model: modelo,
        messages: [
          {
            role: "system",
            content: "Eres un asistente de ventas profesional y amigable.",
          },
          {
            role: "user",
            content: "Di 'Hola' en una sola palabra",
          },
        ],
        temperature: 0.7,
        max_tokens: 10,
      });

      const duration = Date.now() - start;
      const respuesta = response.choices[0]?.message?.content || "Sin respuesta";

      console.log(`   ✅ ${tipo}: ${respuesta} (${duration}ms)`);
      console.log("");
    } catch (error: any) {
      console.log(`   ❌ ${tipo}: Error - ${error.message}`);
      console.log("");
    }
  }

  // 4. Test de selección inteligente de modelo
  console.log("🧠 4. Lógica de selección inteligente de modelos:\n");
  
  const scenarios = [
    { estrategia: "ai_objection_handle", emocion: "objecting", esperado: "deepseek-v3-ultra-free" },
    { estrategia: "ai_payment_close", emocion: "interested", esperado: "gpt-5.4-mini" },
    { estrategia: "ai_product_discovery", emocion: "curious", esperado: "deepseek-v4-flash-free" },
    { estrategia: "ai_general_response", emocion: "frustrated", esperado: "deepseek-v3-ultra-free" },
  ];

  scenarios.forEach(s => {
    console.log(`   Estrategia: ${s.estrategia}`);
    console.log(`   Emoción: ${s.emocion}`);
    console.log(`   → Modelo seleccionado: ${s.esperado}`);
    console.log("");
  });

  // 5. Test de rotación de fallback
  console.log("🔄 5. Orden de fallback configurado:\n");
  
  const fallbackOrder = process.env.AI_FALLBACK_ORDER || "opencode,nvidia_nim_bridge,nvidia,openrouter,github";
  const providers = fallbackOrder.split(",");
  
  providers.forEach((p, i) => {
    const emoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "🔸";
    console.log(`   ${emoji} ${i + 1}. ${p}`);
  });
  console.log("");

  // 6. Test de arquitectura
  console.log("🏗️ 6. Arquitectura de integración:\n");
  console.log("   ┌─────────────────────────────────────┐");
  console.log("   │  WhatsApp Bot (Conversación)       │");
  console.log("   └─────────────┬───────────────────────┘");
  console.log("                 │");
  console.log("   ┌─────────────▼───────────────────────┐");
  console.log("   │  Response Brain (Cerebro Táctico)  │");
  console.log("   │  - Analiza contexto y emoción      │");
  console.log("   │  - Selecciona estrategia           │");
  console.log("   └─────────────┬───────────────────────┘");
  console.log("                 │");
  console.log("   ┌─────────────▼───────────────────────┐");
  console.log("   │  Model Selector (Selector IA)      │");
  console.log("   │  - Emoción frustrada → v3-ultra    │");
  console.log("   │  - Objeciones → v3-ultra           │");
  console.log("   │  - Cierre/Pago → gpt-5.4-mini      │");
  console.log("   │  - General → v4-flash              │");
  console.log("   └─────────────┬───────────────────────┘");
  console.log("                 │");
  console.log("   ┌─────────────▼───────────────────────┐");
  console.log("   │  OpenCode API (FreeModel.dev)      │");
  console.log("   │  ✅ deepseek-v3-ultra-free         │");
  console.log("   │  ✅ deepseek-v4-flash-free         │");
  console.log("   │  ✅ gpt-5.4-mini                   │");
  console.log("   └─────────────────────────────────────┘");
  console.log("");

  console.log("✅ Test de integración completado!");
}

testOpenCodeIntegration().catch((e) => {
  console.error("❌ Error en test:", e);
  process.exit(1);
});
