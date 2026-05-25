/**
 * Test Simple de IAs
 * Verifica conectividad básica
 */

const https = require("https");

const ias = [
  {
    name: "GitHub Copilot",
    host: "api.github.com",
    path: "/copilot/chat/completions",
  },
  {
    name: "NVIDIA API",
    host: "integrate.api.nvidia.com",
    path: "/v1/chat/completions",
  },
  {
    name: "OpenCode (EasyPanel)",
    host: "tecnovariedades-provedor-ia.er7iaf.easypanel.host",
    path: "/v1/chat/completions",
  },
  {
    name: "Ollama (EasyPanel)",
    host: "tecnovariedades-ollama.er7iaf.easypanel.host",
    path: "/api/chat",
  },
];

async function testIA(ia) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = setTimeout(() => {
      console.log(`   ⏱️ TIMEOUT`);
      resolve({ name: ia.name, status: "timeout" });
    }, 5000);

    const options = {
      hostname: ia.host,
      path: ia.path,
      method: "HEAD",
      timeout: 5000,
    };

    const req = https.request(options, (res) => {
      clearTimeout(timeout);
      const time = Date.now() - startTime;

      if (res.statusCode < 500) {
        console.log(`   ✅ RESPONDE (HTTP ${res.statusCode}, ${time}ms)`);
        resolve({ name: ia.name, status: "ok", code: res.statusCode, time });
      } else {
        console.log(`   ❌ ERROR HTTP ${res.statusCode} (${time}ms)`);
        resolve({ name: ia.name, status: "error", code: res.statusCode, time });
      }
    });

    req.on("error", (error) => {
      clearTimeout(timeout);
      console.log(`   ❌ ${error.message}`);
      resolve({ name: ia.name, status: "error", error: error.message });
    });

    req.end();
  });
}

async function runTests() {
  console.log("🧪 TEST SIMPLE DE IAs\n");
  console.log("=".repeat(50));

  for (const ia of ias) {
    console.log(`\n🔍 ${ia.name}`);
    console.log(`   Host: ${ia.host}`);
    await testIA(ia);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(50));
}

runTests().catch(console.error);
