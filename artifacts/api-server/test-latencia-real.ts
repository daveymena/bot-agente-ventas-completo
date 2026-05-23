/**
 * TEST DE LATENCIA REAL - Simula preguntas desde WhatsApp
 * Mide cada paso del sistema para identificar el cuello de botella
 */

import { eq } from 'drizzle-orm';
import { db, conversations, messages } from '@workspace/db';

// Importar funciones del agente
import { runAgentReply } from './src/lib/agent.js';

interface TimingResult {
  step: string;
  duration: number;
}

const timings: TimingResult[] = [];

async function testLatenciaReal() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║         TEST DE LATENCIA REAL - SISTEMA COMPLETO              ║
║     Simulando preguntas desde WhatsApp con datos reales        ║
╚════════════════════════════════════════════════════════════════╝
`);

  try {
    // ── 1. Obtener o crear conversación de prueba ────────────────────────────
    console.log(`\n📋 PASO 1: Obtener conversación de prueba`);
    let t1 = Date.now();
    
    const [existingConvo] = await db.select()
      .from(conversations)
      .where(eq(conversations.tenantId, 1))
      .limit(1);
    
    let conversationId: number;
    
    if (existingConvo) {
      conversationId = existingConvo.id;
      console.log(`✅ Conversación existente encontrada: ID ${conversationId}`);
    } else {
      console.log(`❌ No hay conversaciones. Creando una nueva...`);
      // Crear conversación de prueba
      const result = await db.insert(conversations).values({
        tenantId: 1,
        contactName: 'Cliente Test',
        contactPhone: '573136174267',
        currentStage: 'greeting',
        hasGreeted: false,
        paymentStatus: 'pending',
      }).returning();
      
      conversationId = result[0].id;
      console.log(`✅ Conversación creada: ID ${conversationId}`);
    }
    
    timings.push({ step: '1. Obtener conversación', duration: Date.now() - t1 });

    // ── 2. Simular preguntas desde WhatsApp ────────────────────────────────
    const preguntas = [
      { pregunta: 'Hola', descripcion: 'Saludo inicial' },
      { pregunta: 'Qué productos tienes?', descripcion: 'Consulta de productos' },
      { pregunta: 'Quiero aprender piano', descripcion: 'Búsqueda de producto específico' },
      { pregunta: 'Cuánto cuesta?', descripcion: 'Consulta de precio' },
      { pregunta: 'Quiero comprar', descripcion: 'Intención de pago' },
    ];

    for (const { pregunta, descripcion } of preguntas) {
      console.log(`\n${'═'.repeat(70)}`);
      console.log(`\n🤖 PREGUNTA: "${pregunta}"`);
      console.log(`📝 Tipo: ${descripcion}`);
      console.log(`\n⏱️ Midiendo latencia...`);

      // ── Guardar mensaje del cliente ────────────────────────────────────
      t1 = Date.now();
      const [savedMessage] = await db.insert(messages).values({
        conversationId,
        role: 'customer',
        content: pregunta,
        metadata: { source: 'whatsapp', test: true },
      }).returning();
      
      const saveTime = Date.now() - t1;
      console.log(`  ⏱️ Guardar mensaje cliente: ${saveTime}ms`);

      // ── Ejecutar respuesta del bot ────────────────────────────────────
      t1 = Date.now();
      const startTotal = Date.now();
      
      console.log(`\n  🔄 Ejecutando runAgentReply...`);
      const result = await runAgentReply(conversationId);
      
      const totalTime = Date.now() - startTotal;
      
      if (!result) {
        console.log(`  ❌ Error: No se obtuvo respuesta`);
        continue;
      }

      console.log(`\n  ✅ Respuesta obtenida:`);
      console.log(`  "${result.content.substring(0, 100)}..."`);
      console.log(`\n  📊 TIEMPOS:`);
      console.log(`  ├─ Tiempo total: ${totalTime}ms`);
      console.log(`  └─ Status: ${totalTime > 5000 ? '🔴 LENTO' : totalTime > 2000 ? '🟡 NORMAL' : '🟢 RÁPIDO'}`);

      timings.push({ step: `Pregunta: "${pregunta}"`, duration: totalTime });
    }

    // ── 3. Resumen de resultados ────────────────────────────────────────────
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`\n📊 RESUMEN DE LATENCIAS:`);
    console.log(`${'═'.repeat(70)}\n`);

    let totalLatencia = 0;
    let maxLatencia = 0;
    let minLatencia = Infinity;

    for (const { step, duration } of timings) {
      const status = duration > 5000 ? '🔴' : duration > 2000 ? '🟡' : '🟢';
      console.log(`${status} ${step.padEnd(40)} ${duration.toString().padStart(6)}ms`);
      
      totalLatencia += duration;
      maxLatencia = Math.max(maxLatencia, duration);
      minLatencia = Math.min(minLatencia, duration);
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📈 ESTADÍSTICAS:`);
    console.log(`  • Promedio: ${(totalLatencia / timings.length).toFixed(0)}ms`);
    console.log(`  • Máximo: ${maxLatencia}ms`);
    console.log(`  • Mínimo: ${minLatencia}ms`);
    console.log(`  • Total: ${totalLatencia}ms`);

    // ── 4. Análisis del problema ────────────────────────────────────────────
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`\n🔍 ANÁLISIS DEL PROBLEMA:`);
    console.log(`${'═'.repeat(70)}\n`);

    if (maxLatencia > 5000) {
      console.log(`🔴 PROBLEMA DETECTADO: Latencia muy alta (${maxLatencia}ms)`);
      console.log(`\n   Posibles causas:`);
      console.log(`   1. ⏳ Llamada a IA tardando (timeout de proveedores)`);
      console.log(`   2. 🗄️  Queries a BD lentas (conexión remota)`);
      console.log(`   3. 🌐 Problema de red/conectividad`);
      console.log(`   4. 💾 Procesamiento de datos pesado`);
      console.log(`\n   Recomendaciones:`);
      console.log(`   • Revisar logs de EasyPanel para ver [TIMING]`);
      console.log(`   • Verificar estado de proveedores de IA`);
      console.log(`   • Verificar conexión a BD (79.143.187.160:5432)`);
      console.log(`   • Reducir más los timeouts de proveedores`);
    } else if (maxLatencia > 2000) {
      console.log(`🟡 LATENCIA NORMAL: ${maxLatencia}ms`);
      console.log(`   Esto es aceptable pero podría mejorarse`);
    } else {
      console.log(`🟢 LATENCIA ÓPTIMA: ${maxLatencia}ms`);
      console.log(`   El sistema está respondiendo rápidamente`);
    }

    console.log(`\n${'═'.repeat(70)}\n`);

  } catch (error) {
    console.error(`\n❌ ERROR:`, error);
    process.exit(1);
  }
}

// Ejecutar test
testLatenciaReal().then(() => {
  console.log(`✅ Test completado`);
  process.exit(0);
}).catch(err => {
  console.error(`❌ Error fatal:`, err);
  process.exit(1);
});
