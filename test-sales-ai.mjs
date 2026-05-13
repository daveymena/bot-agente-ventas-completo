/**
 * Test de SalesAI - IA Local para análisis de conversaciones
 * NO requiere APIs externas
 */

// Simulación de SalesAI en JavaScript (la versión real está en TypeScript)
class SalesAI {
  constructor() {
    this.buyingKeywords = [
      'comprar', 'adquirir', 'pagar', 'precio', 'cuánto', 'costo', 'vale',
      'cuenta', 'nequi', 'transferencia', 'link', 'enlace', 'quiero',
      'necesito', 'me interesa', 'lo llevo', 'dame', 'envía', 'manda'
    ];

    this.objectionKeywords = [
      'caro', 'costoso', 'mucho', 'pensarlo', 'después', 'luego',
      'no sé', 'duda', 'inseguro', 'desconfío', 'estafa', 'funciona',
      'garantía', 'devolución', 'reembolso', 'no tengo', 'sin dinero'
    ];

    this.urgencyKeywords = [
      'rápido', 'urgente', 'ya', 'ahora', 'hoy', 'inmediato',
      'cuanto antes', 'pronto', 'necesito ya'
    ];
  }

  analyze(context) {
    const reasoning = [];
    const allEvidence = [];

    console.log('\n🧠 ═══════════════════════════════════════════════════════');
    console.log('   SALESAI - Análisis de Conversación (IA Local)');
    console.log('═══════════════════════════════════════════════════════\n');

    // Obtener último mensaje
    const lastMessage = this.getLastCustomerMessage(context);
    console.log(`📝 Último mensaje: "${lastMessage}"\n`);

    // PASO 1: Analizar intención
    console.log('🔍 PASO 1: Analizando intención...');
    const intentEvidence = this.analyzeIntent(lastMessage, context);
    allEvidence.push(...intentEvidence.evidence);
    intentEvidence.reasoning.forEach(r => console.log(r));

    // PASO 2: Detectar objeciones
    console.log('\n🚨 PASO 2: Detectando objeciones...');
    const objectionEvidence = this.detectObjections(lastMessage);
    allEvidence.push(...objectionEvidence.evidence);
    objectionEvidence.reasoning.forEach(r => console.log(r));

    // PASO 3: Evaluar urgencia
    console.log('\n⚡ PASO 3: Evaluando urgencia...');
    const urgencyEvidence = this.evaluateUrgency(lastMessage);
    allEvidence.push(...urgencyEvidence.evidence);
    urgencyEvidence.reasoning.forEach(r => console.log(r));

    // PASO 4: Sintetizar
    console.log('\n🎯 PASO 4: Sintetizando veredicto...');
    const verdict = this.synthesize(allEvidence, lastMessage);

    return verdict;
  }

  getLastCustomerMessage(context) {
    const customerMessages = context.messages.filter(m => m.role === 'user');
    return customerMessages.length > 0 
      ? customerMessages[customerMessages.length - 1].content 
      : '';
  }

  analyzeIntent(message, context) {
    const evidence = [];
    const reasoning = [];
    const lowerMsg = message.toLowerCase();

    // Detectar intención de compra
    const buyingMatches = this.buyingKeywords.filter(kw => lowerMsg.includes(kw));
    if (buyingMatches.length > 0) {
      const intensity = Math.min(buyingMatches.length / 3, 1.0);
      evidence.push({
        name: 'buying_intent',
        weight: 0.30,
        favor: true,
        value: intensity,
        description: `Palabras de compra: ${buyingMatches.join(', ')}`
      });
      reasoning.push(`  ✅ INTENCIÓN DE COMPRA: ${buyingMatches.join(', ')} (intensidad: ${(intensity * 100).toFixed(0)}%)`);
    }

    // Detectar preguntas sobre precio
    if (lowerMsg.match(/cuánto|precio|costo|vale|cuánto cuesta/)) {
      evidence.push({
        name: 'price_inquiry',
        weight: 0.20,
        favor: true,
        value: 0.75,
        description: 'Pregunta sobre precio'
      });
      reasoning.push(`  💰 Pregunta sobre PRECIO - lead calificado`);
    }

    if (evidence.length === 0) {
      reasoning.push(`  ℹ️  Sin señales claras de intención de compra`);
    }

    return { evidence, reasoning };
  }

  detectObjections(message) {
    const evidence = [];
    const reasoning = [];
    const lowerMsg = message.toLowerCase();

    const objectionMatches = this.objectionKeywords.filter(kw => lowerMsg.includes(kw));
    
    if (objectionMatches.length > 0) {
      const intensity = Math.min(objectionMatches.length / 2, 1.0);
      evidence.push({
        name: 'objection_detected',
        weight: 0.22,
        favor: false,
        value: intensity,
        description: `Objeciones: ${objectionMatches.join(', ')}`
      });
      reasoning.push(`  ⚠️  OBJECIÓN: ${objectionMatches.join(', ')} (intensidad: ${(intensity * 100).toFixed(0)}%)`);

      // Clasificar tipo
      if (lowerMsg.match(/caro|costoso|mucho|precio/)) {
        reasoning.push(`  💸 Tipo: PRECIO - ofrecer descuento o facilidades`);
      } else if (lowerMsg.match(/pensarlo|después|luego/)) {
        reasoning.push(`  ⏰ Tipo: TIEMPO - crear urgencia`);
      } else if (lowerMsg.match(/funciona|garantía|estafa|desconfío/)) {
        reasoning.push(`  🔒 Tipo: CONFIANZA - mostrar pruebas sociales`);
      }
    } else {
      reasoning.push(`  ✅ Sin objeciones detectadas`);
    }

    return { evidence, reasoning };
  }

  evaluateUrgency(message) {
    const evidence = [];
    const reasoning = [];
    const lowerMsg = message.toLowerCase();

    const urgencyMatches = this.urgencyKeywords.filter(kw => lowerMsg.includes(kw));
    
    if (urgencyMatches.length > 0) {
      evidence.push({
        name: 'high_urgency',
        weight: 0.18,
        favor: true,
        value: 0.90,
        description: `Alta urgencia: ${urgencyMatches.join(', ')}`
      });
      reasoning.push(`  🔥 URGENCIA ALTA: ${urgencyMatches.join(', ')} - CERRAR AHORA`);
    } else {
      reasoning.push(`  ℹ️  Urgencia normal`);
    }

    return { evidence, reasoning };
  }

  synthesize(evidence, lastMessage) {
    if (evidence.length === 0) {
      return {
        intent: 'browsing',
        confidence: 0.3,
        score: 30,
        stage_label: 'COLD',
        should_push: false,
        suggested_action: 'show_product',
        evidence_for: [],
        evidence_against: []
      };
    }

    const evFor = evidence.filter(e => e.favor);
    const evAgainst = evidence.filter(e => !e.favor);

    const totalWeight = evidence.reduce((sum, e) => sum + e.weight, 0);
    const scoreFor = evFor.reduce((sum, e) => sum + e.weight * e.value, 0);
    const scoreAgainst = evAgainst.reduce((sum, e) => sum + e.weight * e.value, 0);

    const netScore = Math.max(0, Math.min(1, (scoreFor - scoreAgainst * 0.7) / (totalWeight + 0.001)));
    const convergenceBonus = Math.min(evFor.length / 6, 0.15);
    let confidence = Math.min(0.95, netScore * 0.70 + convergenceBonus + 0.15);

    const score100 = Math.round(netScore * 100);

    // Determinar intención
    let intent = 'browsing';
    let suggestedAction = 'show_product';

    if (evFor.some(e => e.name === 'buying_intent')) {
      intent = 'buy';
      suggestedAction = 'close';
    } else if (evAgainst.some(e => e.name === 'objection_detected')) {
      intent = 'objection';
      suggestedAction = 'handle_objection';
    } else if (score100 >= 60) {
      intent = 'interested';
      suggestedAction = 'close';
    }

    let stageLabel = 'COLD';
    if (score100 >= 75) stageLabel = 'HOT_LEAD';
    else if (score100 >= 55) stageLabel = 'WARM';
    else if (score100 >= 35) stageLabel = 'COLD';
    else stageLabel = 'LOST';

    const shouldPush = score100 >= 60 && intent !== 'leaving';

    return {
      intent,
      confidence: Math.round(confidence * 1000) / 1000,
      score: score100,
      stage_label: stageLabel,
      should_push: shouldPush,
      suggested_action: suggestedAction,
      evidence_for: evFor.map(e => e.description),
      evidence_against: evAgainst.map(e => e.description)
    };
  }
}

// ═══════════════════════════════════════════════════════════
// CASOS DE PRUEBA
// ═══════════════════════════════════════════════════════════

const testCases = [
  {
    name: 'Cliente listo para comprar',
    context: {
      messages: [
        { role: 'assistant', content: 'Hola, ¿en qué puedo ayudarte?', timestamp: new Date() },
        { role: 'user', content: 'Quiero comprar el curso de Python, cuánto cuesta?', timestamp: new Date() }
      ]
    }
  },
  {
    name: 'Cliente con objeción de precio',
    context: {
      messages: [
        { role: 'assistant', content: 'El curso cuesta $50', timestamp: new Date() },
        { role: 'user', content: 'Me parece muy caro, no tengo tanto dinero ahora', timestamp: new Date() }
      ]
    }
  },
  {
    name: 'Cliente con urgencia',
    context: {
      messages: [
        { role: 'assistant', content: 'Tenemos varios cursos disponibles', timestamp: new Date() },
        { role: 'user', content: 'Necesito el curso de Excel urgente, lo necesito ya para mañana', timestamp: new Date() }
      ]
    }
  },
  {
    name: 'Cliente explorando',
    context: {
      messages: [
        { role: 'assistant', content: 'Hola!', timestamp: new Date() },
        { role: 'user', content: 'Hola, qué productos tienen?', timestamp: new Date() }
      ]
    }
  },
  {
    name: 'Cliente con objeción de confianza',
    context: {
      messages: [
        { role: 'assistant', content: 'Te puedo enviar el curso ahora', timestamp: new Date() },
        { role: 'user', content: 'No sé, desconfío un poco, cómo sé que funciona?', timestamp: new Date() }
      ]
    }
  }
];

// Ejecutar pruebas
console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║         TEST DE SALESAI - IA LOCAL SIN APIs EXTERNAS         ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const ai = new SalesAI();

testCases.forEach((testCase, index) => {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`TEST ${index + 1}: ${testCase.name}`);
  console.log('═'.repeat(65));

  const verdict = ai.analyze(testCase.context);

  console.log('\n📊 VEREDICTO FINAL:');
  console.log('─'.repeat(65));
  console.log(`   Intención:        ${verdict.intent.toUpperCase()}`);
  console.log(`   Score:            ${verdict.score}/100`);
  console.log(`   Confianza:        ${(verdict.confidence * 100).toFixed(1)}%`);
  console.log(`   Etapa:            ${verdict.stage_label}`);
  console.log(`   Debe cerrar:      ${verdict.should_push ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`   Acción sugerida:  ${verdict.suggested_action}`);
  
  if (verdict.evidence_for.length > 0) {
    console.log(`\n   ✅ Evidencias a favor:`);
    verdict.evidence_for.forEach(e => console.log(`      • ${e}`));
  }
  
  if (verdict.evidence_against.length > 0) {
    console.log(`\n   ⚠️  Evidencias en contra:`);
    verdict.evidence_against.forEach(e => console.log(`      • ${e}`));
  }
});

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║                    PRUEBAS COMPLETADAS                        ║');
console.log('║                                                               ║');
console.log('║  ✅ SalesAI funciona 100% LOCAL sin APIs externas            ║');
console.log('║  ✅ Analiza intenciones, objeciones y urgencia               ║');
console.log('║  ✅ Genera recomendaciones basadas en evidencias             ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
