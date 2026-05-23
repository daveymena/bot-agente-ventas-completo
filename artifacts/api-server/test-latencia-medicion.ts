/**
 * TEST DE LATENCIA - Mide tiempos reales de respuesta del bot
 * Ejecutar con: npx tsx test-latencia-medicion.ts
 */

import { eq } from 'drizzle-orm';
import { db, conversations, messages, tenants } from '@workspace/db';
import { runAgentReply } from './src/lib/agent';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

function separator(char = '=', length = 80) {
  return char.repeat(length);
}

interface TestResult {
  pregunta: string;
  duracion: number;
  status: string;
}

async function runTest() {
  try {
    log(colors.cyan, '\n' + separator('='));
    log(colors.cyan, '⏱️  TEST DE LATENCIA - MEDICIÓN DE TIEMPOS REALES');
    log(colors.cyan, separator('=') + '\n');

    // ── PASO 1: OBTENER O CREAR CONVERSACIÓN ───────────────────────────────
    log(colors.blue, '📋 [PASO 1] OBTENER CONVERSACIÓN DE PRUEBA');
    log(colors.blue, separator('-') + '\n');

    let conversationId: number;
    const [existingConvo] = await db.select()
      .from(conversations)
      .where(eq(conversations.tenantId, 1))
      .limit(1);

    if (existingConvo) {
      conversationId = existingConvo.id;
      log(colors.green, `✅ Conversación existente: ID ${conversationId}\n`);
    } else {
      log(colors.yellow, `⚠️  No hay conversaciones. Creando una nueva...\n`);
      const [newConvo] = await db.insert(conversations).values({
        tenantId: 1,
        contactName: 'Test Latencia',
        contactPhone: '573136174267',
        currentStage: 'greeting',
        hasGreeted: false,
      }).returning();
      conversationId = newConvo.id;
      log(colors.green, `✅ Conversación creada: ID ${conversationId}\n`);
    }

    // ── PASO 2: SIMULAR PREGUNTAS DESDE WHATSAPP ───────────────────────────
    log(colors.blue, '🤖 [PASO 2] SIMULAR PREGUNTAS DESDE WHATSAPP');
    log(colors.blue, separator('-') + '\n');

    const preguntas = [
      'Hola',
      'Qué productos tienes?',
      'Quiero aprender piano',
      'Cuánto cuesta?',
      'Quiero comprar',
    ];

    const resultados: TestResult[] = [];

    for (const pregunta of preguntas) {
      log(colors.magenta, `\n📨 PREGUNTA: "${pregunta}"`);
      
      // Guardar mensaje del cliente
      await db.insert(messages).values({
        conversationId,
        role: 'customer',
        content: pregunta,
        metadata: { source: 'whatsapp', test: true },
      });

      // Medir tiempo de respuesta
      const startTime = Date.now();
      log(colors.white, '   ⏳ Procesando...');
      
      const result = await runAgentReply(conversationId);
      
      const duracion = Date.now() - startTime;
      const status = duracion > 5000 ? '🔴 LENTO' : duracion > 2000 ? '🟡 NORMAL' : '🟢 RÁPIDO';

      log(colors.white, `   ✅ Respuesta: "${result?.content.substring(0, 60)}..."`);
      log(colors.white, `   ⏱️  Tiempo: ${duracion}ms ${status}`);

      resultados.push({ pregunta, duracion, status });
    }

    // ── PASO 3: RESUMEN DE RESULTADOS ──────────────────────────────────────
    log(colors.cyan, '\n' + separator('='));
    log(colors.cyan, '📊 RESUMEN DE LATENCIAS');
    log(colors.cyan, separator('=') + '\n');

    let totalDuracion = 0;
    let maxDuracion = 0;
    let minDuracion = Infinity;

    for (const { pregunta, duracion, status } of resultados) {
      const color = duracion > 5000 ? colors.red : duracion > 2000 ? colors.yellow : colors.green;
      log(color, `${status} "${pregunta.padEnd(30)}" ${duracion.toString().padStart(6)}ms`);
      
      totalDuracion += duracion;
      maxDuracion = Math.max(maxDuracion, duracion);
      minDuracion = Math.min(minDuracion, duracion);
    }

    log(colors.white, '\n' + separator('-'));
    log(colors.white, `📈 ESTADÍSTICAS:`);
    log(colors.white, `   • Promedio: ${(totalDuracion / resultados.length).toFixed(0)}ms`);
    log(colors.white, `   • Máximo: ${maxDuracion}ms`);
    log(colors.white, `   • Mínimo: ${minDuracion}ms`);
    log(colors.white, `   • Total: ${totalDuracion}ms`);

    // ── PASO 4: ANÁLISIS DEL PROBLEMA ──────────────────────────────────────
    log(colors.cyan, '\n' + separator('='));
    log(colors.cyan, '🔍 ANÁLISIS DEL PROBLEMA');
    log(colors.cyan, separator('=') + '\n');

    if (maxDuracion > 5000) {
      log(colors.red, `🔴 PROBLEMA CRÍTICO: Latencia muy alta (${maxDuracion}ms)`);
      log(colors.white, `\n   Causas probables:`);
      log(colors.white, `   1. ⏳ Llamada a IA tardando (timeout de proveedores)`);
      log(colors.white, `   2. 🗄️  Queries a BD lentas (conexión remota a 79.143.187.160)`);
      log(colors.white, `   3. 🌐 Problema de red/conectividad`);
      log(colors.white, `   4. 💾 Procesamiento de datos pesado`);
      log(colors.white, `\n   Soluciones:`);
      log(colors.white, `   • Revisar logs de EasyPanel: buscar [TIMING]`);
      log(colors.white, `   • Verificar estado de proveedores de IA`);
      log(colors.white, `   • Verificar conexión a BD (ping 79.143.187.160)`);
      log(colors.white, `   • Reducir más los timeouts de proveedores`);
      log(colors.white, `   • Considerar usar caché para productos`);
    } else if (maxDuracion > 2000) {
      log(colors.yellow, `🟡 LATENCIA NORMAL: ${maxDuracion}ms`);
      log(colors.white, `   Esto es aceptable pero podría mejorarse`);
    } else {
      log(colors.green, `🟢 LATENCIA ÓPTIMA: ${maxDuracion}ms`);
      log(colors.white, `   El sistema está respondiendo rápidamente`);
    }

    log(colors.cyan, '\n' + separator('=') + '\n');

  } catch (error) {
    log(colors.red, `\n❌ ERROR: ${error}`);
    console.error(error);
    process.exit(1);
  }
}

// Ejecutar test
runTest().then(() => {
  log(colors.green, '✅ Test completado\n');
  process.exit(0);
}).catch(err => {
  log(colors.red, `❌ Error fatal: ${err}\n`);
  process.exit(1);
});
