const { selectBestAgent } = require('./dist/lib/agent-router');
const { autoReflexionEngine } = require('./dist/lib/auto-reflexion');
const { db } = require('./dist/lib/db'); // Asumiendo que db está exportado en dist

async function testRouter() {
  console.log("--- 🧪 Probando Router: Sofía -> Especialista ---");
  try {
    // Simulamos los datos mínimos necesarios
    const tenantId = 1;
    const convoId = 123;
    const message = "Hola, quiero el curso de piano";

    // Ejecutamos la lógica del router
    const result = await selectBestAgent(message, convoId, tenantId);

    if (result && result.agentName !== "Sofía") {
      console.log("✅ ÉXITO: El router derivó la conversación al especialista:", result.agentName);
    } else {
      console.log("❌ FALLO: El router mantuvo a Sofía o no eligió nadie.");
    }
  } catch (e) {
    console.log("⚠️ Error ejecutando test de router (puede ser por falta de DB real):", e.message);
  }
}

async function testReflexion() {
  console.log("\n--- 🧪 Probando Auto-Reflexión: Curación ---");
  try {
    // Intentamos ejecutar el ciclo de reflexión para un tenant
    const result = await autoReflexionEngine.runAutoReflexion(1);
    console.log("Resultado:", JSON.stringify(result, null, 2));
    console.log("✅ Motor ejecutado correctamente.");
  } catch (e) {
    console.log("⚠️ Error ejecutando test de reflexión:", e.message);
  }
}

async function run() {
  await testRouter();
  await testReflexion();
}

run().catch(console.error);
