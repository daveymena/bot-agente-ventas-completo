import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

async function testAI() {
  console.log("🚀 Iniciando prueba de IA local (Simplificada)...");
  
  const copilotToken = process.env.GITHUB_COPILOT_TOKEN;
  console.log("Token Copilot detectado:", copilotToken ? copilotToken.substring(0, 20) + "..." : "NO");

  if (!copilotToken) {
    console.error("❌ GITHUB_COPILOT_TOKEN no encontrado en .env");
    return;
  }

  try {
    console.log("🔧 Creando cliente OpenAI...");
    const client = new OpenAI({
      apiKey: copilotToken,
      baseURL: "https://api.githubcopilot.com",
      defaultHeaders: {
        "Editor-Version": "vscode/1.95.3",
        "Editor-Plugin-Version": "copilot/1.246.0",
        "User-Agent": "GitHubCopilotChat/1.246.0",
        "Openai-Intent": "conversation-panel"
      }
    });
    
    console.log("📡 Enviando mensaje de prueba...");
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hola, ¿quién eres?" }],
    });

    console.log("✅ RESPUESTA RECIBIDA:", completion.choices[0].message.content);
  } catch (error: any) {
    console.error("❌ ERROR EN LA PRUEBA:", error.message);
    if (error.response) {
      console.error("Status:", error.status);
      console.error("Body:", error.body);
    }
  }
}

testAI();
