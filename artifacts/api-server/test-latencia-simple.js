/**
 * TEST DE LATENCIA REAL - Script simple para medir tiempos
 * Ejecuta: node test-latencia-simple.js
 */

const http = require('http');

// Función para hacer request HTTP al servidor
function makeRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3002,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          data: data,
          headers: res.headers
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testLatencia() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         TEST DE LATENCIA REAL - SISTEMA COMPLETO              ║
║     Simulando preguntas desde WhatsApp con datos reales        ║
╚════════════════════════════════════════════════════════════════╝
`);

  const preguntas = [
    { pregunta: 'Hola', descripcion: 'Saludo inicial' },
    { pregunta: 'Qué productos tienes?', descripcion: 'Consulta de productos' },
    { pregunta: 'Quiero aprender piano', descripcion: 'Búsqueda de producto específico' },
    { pregunta: 'Cuánto cuesta?', descripcion: 'Consulta de precio' },
    { pregunta: 'Quiero comprar', descripcion: 'Intención de pago' },
  ];

  const timings = [];

  for (const { pregunta, descripcion } of preguntas) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`\n🤖 PREGUNTA: "${pregunta}"`);
    console.log(`📝 Tipo: ${descripcion}`);
    console.log(`\n⏱️ Midiendo latencia...`);

    const startTime = Date.now();
    
    try {
      // Simular envío de mensaje a través de API
      const response = await makeRequest(`/api/message?text=${encodeURIComponent(pregunta)}`);
      const duration = Date.now() - startTime;

      console.log(`\n  ✅ Respuesta obtenida en ${duration}ms`);
      console.log(`  Status: ${response.status}`);
      
      const status = duration > 5000 ? '🔴 LENTO' : duration > 2000 ? '🟡 NORMAL' : '🟢 RÁPIDO';
      console.log(`  ${status}`);

      timings.push({ pregunta, duration });

    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      timings.push({ pregunta, duration: -1 });
    }
  }

  // Resumen
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`\n📊 RESUMEN DE LATENCIAS:`);
  console.log(`${'═'.repeat(70)}\n`);

  let totalLatencia = 0;
  let maxLatencia = 0;
  let minLatencia = Infinity;
  let validCount = 0;

  for (const { pregunta, duration } of timings) {
    if (duration > 0) {
      const status = duration > 5000 ? '🔴' : duration > 2000 ? '🟡' : '🟢';
      console.log(`${status} "${pregunta.substring(0, 30).padEnd(30)}" ${duration.toString().padStart(6)}ms`);
      
      totalLatencia += duration;
      maxLatencia = Math.max(maxLatencia, duration);
      minLatencia = Math.min(minLatencia, duration);
      validCount++;
    }
  }

  if (validCount > 0) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📈 ESTADÍSTICAS:`);
    console.log(`  • Promedio: ${(totalLatencia / validCount).toFixed(0)}ms`);
    console.log(`  • Máximo: ${maxLatencia}ms`);
    console.log(`  • Mínimo: ${minLatencia}ms`);
    console.log(`  • Total: ${totalLatencia}ms`);

    // Análisis
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`\n🔍 ANÁLISIS:`);
    console.log(`${'═'.repeat(70)}\n`);

    if (maxLatencia > 5000) {
      console.log(`🔴 PROBLEMA: Latencia muy alta (${maxLatencia}ms)`);
      console.log(`\n   Causas probables:`);
      console.log(`   1. ⏳ Llamada a IA tardando`);
      console.log(`   2. 🗄️  Queries a BD lentas`);
      console.log(`   3. 🌐 Problema de red`);
      console.log(`\n   Soluciones:`);
      console.log(`   • Revisar logs: [TIMING]`);
      console.log(`   • Verificar proveedores de IA`);
      console.log(`   • Verificar conexión a BD`);
    } else if (maxLatencia > 2000) {
      console.log(`🟡 LATENCIA NORMAL: ${maxLatencia}ms`);
    } else {
      console.log(`🟢 LATENCIA ÓPTIMA: ${maxLatencia}ms`);
    }
  }

  console.log(`\n${'═'.repeat(70)}\n`);
}

// Ejecutar
testLatencia().catch(console.error);
