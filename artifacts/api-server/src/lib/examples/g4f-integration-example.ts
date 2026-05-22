/**
 * G4F Fallback Integration Example
 * Cómo se integra G4F en el sistema de rotación existente
 * 
 * NOTA: Este es un ejemplo educativo de la integración
 * La lógica real está en fallbackSystem.ts y agent.ts
 */

import { logger } from "./logger";
import { getG4FResponse } from "./providers/g4f-provider";
import { AI_FALLBACK_ORDER, AI_FALLBACK_ENABLED } from "./g4f.config";

/**
 * Simulación del flujo de rotación de proveedores
 */
export async function demonstrateProviderRotation(customerMessage: string): Promise<{
  provider: string;
  subProvider?: string | undefined;
  content: string;
  model?: string | undefined;
  timestamp: Date;
}> {
  logger.info(
    { message: customerMessage, providers: AI_FALLBACK_ORDER },
    "[Demo] Iniciando rotación de proveedores"
  );

  const messages = [
    { role: "system" as const, content: "Eres un asistente de ventas de cursos online amable y profesional." },
    { role: "user" as const, content: customerMessage },
  ];

  // Simular intentos con cada proveedor
  for (const provider of AI_FALLBACK_ORDER) {
    logger.info({ provider }, "[Demo] Intentando con proveedor");

    try {
      switch (provider) {
        case "opencode":
          return await tryOpencode(messages);

        case "github_copilot_internal":
          return await tryGithubCopilot(messages);

        case "ollama_local":
          return await tryOllamaLocal(messages);

        case "nvidia":
          return await tryNvidia(messages);

        case "github":
          return await tryGithubModels(messages);

        case "g4f":
          return await tryG4F(messages);

        default:
          logger.warn({ provider }, "[Demo] Proveedor desconocido");
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ provider, error: errorMsg }, "[Demo] Proveedor falló, pasando al siguiente");
      continue;
    }
  }

   // Si todos fallan
   logger.error({}, "[Demo] Todos los proveedores fallaron - usando respuesta fallback");
   return getFallbackResponse();
}

/**
 * Intentar con OpenCode
 */
async function tryOpencode(messages: any[]) {
   logger.info({}, "[Provider] Opencode - Usando OPENCODE_API_URL");
  
  // Simular llamada a OpenCode
  // const response = await fetch(process.env.OPENCODE_API_URL + '/chat/completions', {...})
  
    return {
      provider: "opencode",
      subProvider: undefined,
      content: "Respuesta de OpenCode",
      model: undefined,
      timestamp: new Date(),
    };
}

/**
 * Intentar con GitHub Copilot
 */
async function tryGithubCopilot(messages: any[]) {
   logger.info({}, "[Provider] GitHub Copilot - Usando GITHUB_COPILOT_TOKEN");
  
  // Simular llamada a GitHub Copilot
  // const response = await fetch('https://api.copilot.github.com/chat', {...})
  
   return {
     provider: "github_copilot",
     subProvider: undefined,
     content: "Respuesta de GitHub Copilot",
     model: undefined,
     timestamp: new Date(),
   };
}

/**
 * Intentar con Ollama Local
 */
async function tryOllamaLocal(messages: any[]) {
   logger.info({}, "[Provider] Ollama Local - Usando OLLAMA_LOCAL_URL");
  
  // Simular llamada a Ollama
  // const response = await fetch(process.env.OLLAMA_LOCAL_URL + '/api/chat', {...})
  
  return {
    provider: "ollama_local",
    content: "Respuesta de Ollama Local",
    timestamp: new Date(),
  };
}

/**
 * Intentar con NVIDIA
 */
async function tryNvidia(messages: any[]) {
   logger.info({}, "[Provider] NVIDIA - Usando NVIDIA_API_KEY");
  
  // Simular llamada a NVIDIA API
  // const response = await fetch('https://api.nvidia.com/chat', {...})
  
  return {
    provider: "nvidia",
    content: "Respuesta de NVIDIA",
    timestamp: new Date(),
  };
}

/**
 * Intentar con GitHub Models
 */
async function tryGithubModels(messages: any[]) {
   logger.info({}, "[Provider] GitHub Models - Usando GITHUB_TOKEN");
  
  // Simular llamada a GitHub Models
  // const response = await fetch('https://models.github.com/chat', {...})
  
  return {
    provider: "github_models",
    content: "Respuesta de GitHub Models",
    timestamp: new Date(),
  };
}

/**
 * Intentar con G4F (Último respaldo)
 * 🎯 AQUÍ ES DONDE G4F TOMA EL CONTROL
 */
async function tryG4F(messages: any[]) {
   logger.info({}, "[Provider] G4F - 111+ proveedores disponibles (respaldo final)");
  
  const response = await getG4FResponse(
    messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    "gpt-4-turbo"
  );

  if (!response) {
    throw new Error("G4F no disponible");
  }

  logger.info(
    { actualProvider: response.provider, model: response.model },
    "[Provider] ✅ G4F funcionando"
  );

  return {
    provider: "g4f",
    subProvider: response.provider,
    content: response.content,
    model: response.model,
    timestamp: new Date(),
  };
}

/**
 * Respuesta fallback si todo falla
 */
function getFallbackResponse(): {
   provider: string;
   subProvider?: string | undefined;
   content: string;
   model?: string | undefined;
   timestamp: Date;
} {
   return {
     provider: "fallback",
     subProvider: undefined,
     content: `
       ━━━━━━━━━━━━━━━━━━━━━━━━
       ✨ RESPUESTA AUTOMÁTICA
       
       Gracias por tu mensaje. Nuestro equipo está 
       procesando tu solicitud y te contactará pronto.
       
       En caso de urgencia, contáctanos directamente:
       📞 +57 304 2748709
       ━━━━━━━━━━━━━━━━━━━━━━━━
     `,
     model: undefined,
     timestamp: new Date(),
   };
 }

/**
 * Ejemplo de uso
 */
export async function runExample() {
  const testMessages = [
    "Hola, me interesa el curso de piano",
    "¿Cuál es el precio?",
    "¿Cómo es la garantía?",
  ];

  console.log("\n🤖 DEMOSTRANDO ROTACIÓN DE PROVEEDORES\n");
  console.log(`📋 Orden de rotación: ${AI_FALLBACK_ORDER.join(" → ")}\n`);

  for (const msg of testMessages) {
    console.log(`\n📨 Cliente: "${msg}"\n`);
    
    try {
      const result = await demonstrateProviderRotation(msg);
      console.log(`✅ Proveedor usado: ${result.provider}`);
      if (result.subProvider) {
        console.log(`   Sub-proveedor: ${result.subProvider}`);
      }
      console.log(`📝 Respuesta: ${result.content.substring(0, 100)}...`);
    } catch (error) {
      console.error(`❌ Error:`, error);
    }
  }
}

// Descomentar para ejecutar ejemplo
// runExample().catch(console.error);

/**
 * RESUMEN DEL FLUJO
 * 
 * 1. Cliente envía mensaje
 * 2. Sistema intenta usar OpenCode (1er proveedor)
 * 3. Si falla, intenta GitHub Copilot (2do)
 * 4. Si falla, intenta Ollama Local (3ro)
 * 5. Si falla, intenta NVIDIA (4to)
 * 6. Si falla, intenta GitHub Models (5to)
 * 7. Si todo falla, usa G4F con 111+ proveedores
 * 8. Si G4F también falla, usa respuesta fallback
 * 
 * TODO ESTO ES AUTOMÁTICO Y TRANSPARENTE PARA EL CLIENTE ✅
 */
