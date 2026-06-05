/**
 * Test de IAs Funcionando
 * Verifica qué proveedores de IA están activos y respondiendo
 */

const https = require("https");
const http = require("http");

// Configuración de IAs
const ias = [
  {
    name: "GitHub Copilot",
    type: "github",
    url: "https://api.github.com/copilot/chat/completions",
    headers: {
      Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoiZ3VpIiwidiI6IjAuMC4wIiwidSI6ImRDdjMrQURQU1BldFk0Z09JLyt3Umc9PSIsInV1Ijoic0VDNE5SZi9Ra3FBYWlIZ1FsTWNWZz09IiwiaWF0IjoxNzc4ODYyMDk2fQ.OA-DQOWYxuE0tSxhR4Egl2x50KSgYyPeu-HjT-JqSrs",
      "Content-Type": "application/json",
    },
    timeout: 5000,
  },
  {
    name: "NVIDIA API",
    type: "nvidia",
    url: "https://integrate.api.nvidia.com/v1/chat/completions",
    headers: {
      Authorization: "Bearer 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",
      "Content-Type": "application/json",
    },
    timeout: 8000,
  },
  {
    name: "OpenCode (EasyPanel)",
    type: "opencode",
    url: "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1/chat/completions",
    headers: {
      Authorization: "Bearer sk_y8Fg5Ccoox-lVH0O8s1qzHaD6b6zrNNVExAxx_pcNZE",
      "Content-Type": "application/json",
    },
    timeout: 10000,
  },
  {
    name: "Ollama Local (EasyPanel)",
    type: "ollama",
    url: "https://tecnovariedades-ollama.er7iaf.easypanel.host/api/chat",
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 15000,
  },
];

// Función para probar una IA
async function testIA(ia) {
  return new Promise((resolve) => {
    console.log(`\n🧪 Probando: ${ia.name}`);
    console.log(`   URL: ${ia.url}`);

    const startTime = Date.now();
    const timeout = setTimeout(() => {
      console.log(`   ⏱️ TIMEOUT (${ia.timeout}ms)`);
      resolve({ name: ia.name, status: "timeout", time: ia.timeout });
    }, ia.timeout);

    const protocol = ia.url.startsWith("https") ? https : http;

    const req = protocol.get(ia.url, { headers: ia.headers }, (res) => {
      clearTimeout(timeout);
      const time = Date.now() - startTime;

      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log(`   ✅ FUNCIONANDO (${time}ms)`);
        resolve({ name: ia.name, status: "ok", time, code: res.statusCode });
      } else if (res.statusCode === 401 || res.statusCode === 403) {
        console.log(`   ⚠️ AUTENTICACIÓN FALLIDA (${res.statusCode})`);
        resolve({ name: ia.name, status: "auth_error", time, code: res.statusCode });
      } else if (res.statusCode === 429) {
        console.log(`   ⚠️ RATE LIMIT (${res.statusCode})`);
        resolve({ name: ia.name, status: "rate_limit", time, code: res.statusCode });
      } else {
        console.log(`   ❌ ERROR HTTP ${res.statusCode} (${time}ms)`);
        resolve({ name: ia.name, status: "error", time, code: res.statusCode });
      }
    });

    req.on("error", (error) => {
      clearTimeout(timeout);
      const time = Date.now() - startTime;
      console.log(`   ❌ ERROR: ${error.message} (${time}ms)`);
      resolve({ name: ia.name, status: "connection_error", time, error: error.message });
    });

    req.end();
  });
}

// Ejecutar tests
async function runTests() {
  console.log("🧪 TEST DE IAs FUNCIONANDO\n");
  console.log("=".repeat(60));

  const results = [];

  for (const ia of ias) {
    const result = await testIA(ia);
    results.push(result);
    // Esperar 1 segundo entre tests para no saturar
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n📊 RESULTADOS:\n");

  const working = results.filter((r) => r.status === "ok");
  const authErrors = results.filter((r) => r.status === "auth_error");
  const errors = results.filter((r) => r.status === "error" || r.status === "connection_error");
  const timeouts = results.filter((r) => r.status === "timeout");

  console.log(`✅ FUNCIONANDO (${working.length}):`);
  working.forEach((r) => {
    console.log(`   • ${r.name} - ${r.time}ms`);
  });

  if (authErrors.length > 0) {
    console.log(`\n⚠️ AUTENTICACIÓN FALLIDA (${authErrors.length}):`);
    authErrors.forEach((r) => {
      console.log(`   • ${r.name} - HTTP ${r.code}`);
    });
  }

  if (errors.length > 0) {
    console.log(`\n❌ ERRORES (${errors.length}):`);
    errors.forEach((r) => {
      console.log(`   • ${r.name} - ${r.error || `HTTP ${r.code}`}`);
    });
  }

  if (timeouts.length > 0) {
    console.log(`\n⏱️ TIMEOUTS (${timeouts.length}):`);
    timeouts.forEach((r) => {
      console.log(`   • ${r.name} - ${r.time}ms`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n🎯 RESUMEN:`);
  console.log(`   Total: ${results.length}`);
  console.log(`   Funcionando: ${working.length}`);
  console.log(`   Errores: ${errors.length + authErrors.length + timeouts.length}`);
  console.log(`   Porcentaje: ${Math.round((working.length / results.length) * 100)}%`);

  if (working.length > 0) {
    console.log(`\n✅ IAs disponibles para usar:`);
    working.forEach((r) => {
      console.log(`   • ${r.name}`);
    });
  }

  console.log("\n" + "=".repeat(60));
}

runTests().catch(console.error);
