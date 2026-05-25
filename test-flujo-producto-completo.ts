/**
 * Test Completo de Flujo de Producto
 * Simula una pregunta sobre un producto y verifica que se muestra correctamente
 */

import { computeDecision, ConversationMemory } from "./src/lib/conversation-engine";
import { db, products, conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";

// Productos de prueba
const testProducts = [
  {
    id: 1,
    name: "Mega Pack de Piano",
    description: "Aprende piano desde cero con 150 clases",
    price: "20000",
    currency: "COP",
    category: "música",
    categoryId: 1,
    isActive: true,
    features: ["150 clases", "Acceso permanente", "Soporte"],
    paymentLink: "https://mercadopago.com/checkout/piano",
    deliveryLink: "https://drive.google.com/piano",
  },
  {
    id: 2,
    name: "DJ Producción Musical Mega Pack",
    description: "Producción musical con FL Studio y Ableton",
    price: "60000",
    currency: "COP",
    category: "música",
    categoryId: 1,
    isActive: true,
    features: ["FL Studio", "Ableton Live", "Teoría musical"],
    paymentLink: "https://mercadopago.com/checkout/dj",
    deliveryLink: "https://drive.google.com/dj",
  },
  {
    id: 3,
    name: "Curso de Inglés Avanzado",
    description: "Aprende inglés profesional",
    price: "30000",
    currency: "COP",
    category: "idiomas",
    categoryId: 2,
    isActive: true,
    features: ["Conversación", "Gramática", "Pronunciación"],
    paymentLink: "https://mercadopago.com/checkout/ingles",
    deliveryLink: "https://drive.google.com/ingles",
  },
];

// Mapa de categorías
const categoryMap = new Map([
  [1, "música"],
  [2, "idiomas"],
  [3, "ofimática"],
]);

// Memoria de conversación simulada
const mockMemory: ConversationMemory = {
  conversationId: "test-123",
  tenantId: 1,
  userId: "user-123",
  currentProductId: null,
  sentProductIds: new Set(),
  messageHistory: [],
  emotionalState: "neutral",
  stage: "greeting",
  lastIntent: "greeting",
  contextSummary: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Test cases
const testCases = [
  {
    query: "Me interesa el megapack de piano",
    expectedProductId: 1,
    expectedProductName: "Mega Pack de Piano",
    description: "Búsqueda principal - debe encontrar Piano",
  },
  {
    query: "¿Cuánto cuesta el piano?",
    expectedProductId: 1,
    expectedProductName: "Mega Pack de Piano",
    description: "Pregunta sobre precio - debe encontrar Piano",
  },
  {
    query: "Quiero aprender dj producción",
    expectedProductId: 2,
    expectedProductName: "DJ Producción Musical Mega Pack",
    description: "Búsqueda de DJ - debe encontrar DJ Producción",
  },
  {
    query: "¿Tienen cursos de inglés?",
    expectedProductId: 3,
    expectedProductName: "Curso de Inglés Avanzado",
    description: "Búsqueda de idioma - debe encontrar Inglés",
  },
];

// Función para ejecutar test
async function runTest(testCase: any) {
  console.log(`\n📝 Test: ${testCase.description}`);
  console.log(`   Query: "${testCase.query}"`);
  console.log(`   Esperado: ${testCase.expectedProductName} (ID: ${testCase.expectedProductId})`);

  try {
    // Ejecutar decisión del motor
    const decision = await computeDecision(
      mockMemory,
      testCase.query,
      testProducts,
      categoryMap
    );

    console.log(`\n   📊 Decisión del Motor:`);
    console.log(`   - Intent: ${decision.intent}`);
    console.log(`   - Stage: ${decision.stage}`);
    console.log(`   - Should Send Card: ${decision.shouldSendCard}`);

    if (decision.productToShow) {
      console.log(`\n   🎯 Producto a Mostrar:`);
      console.log(`   - ID: ${decision.productToShow.id}`);
      console.log(`   - Nombre: ${decision.productToShow.name}`);
      console.log(`   - Precio: ${decision.productToShow.price} ${decision.productToShow.currency}`);
      console.log(`   - Descripción: ${decision.productToShow.description}`);

      // Verificar si es el producto correcto
      if (decision.productToShow.id === testCase.expectedProductId) {
        console.log(`\n   ✅ PASÓ: Encontró el producto correcto`);
        return { passed: true, productId: decision.productToShow.id };
      } else {
        console.log(`\n   ❌ FALLÓ: Encontró producto incorrecto`);
        console.log(`   Esperado ID: ${testCase.expectedProductId}`);
        console.log(`   Encontrado ID: ${decision.productToShow.id}`);
        return { passed: false, productId: decision.productToShow.id };
      }
    } else {
      console.log(`\n   ⚠️ No hay producto a mostrar`);
      console.log(`   Reasoning: ${decision.reasoning}`);
      return { passed: false, productId: null };
    }
  } catch (error) {
    console.log(`\n   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return { passed: false, error: true };
  }
}

// Ejecutar todos los tests
async function runAllTests() {
  console.log("🧪 TEST COMPLETO DE FLUJO DE PRODUCTO\n");
  console.log("=".repeat(70));

  const results = [];

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    results.push(result);
  }

  console.log("\n" + "=".repeat(70));
  console.log("\n📊 RESULTADOS:\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`✅ Pasados: ${passed}/${testCases.length}`);
  console.log(`❌ Fallidos: ${failed}/${testCases.length}`);
  console.log(`Porcentaje: ${Math.round((passed / testCases.length) * 100)}%`);

  if (failed === 0) {
    console.log(`\n🎉 ¡TODOS LOS TESTS PASARON!`);
    console.log(`\n✅ El código está usando la lógica correcta para mostrar productos.`);
  } else {
    console.log(`\n⚠️ Algunos tests fallaron. Revisa la lógica de búsqueda.`);
  }

  console.log("\n" + "=".repeat(70));
}

// Ejecutar
runAllTests().catch(console.error);
