/**
 * Test de Búsqueda de Productos
 * Verifica que el algoritmo encuentra los productos correctos
 */

import { findBestProductMatch } from "./src/lib/conversation-engine";

// Productos de prueba (simulando BD real)
const testProducts = [
  {
    id: 1,
    name: "Mega Pack de Piano",
    description: "Aprende piano desde cero con 150 clases",
    category: "música",
    categoryId: 1,
  },
  {
    id: 2,
    name: "DJ Producción Musical Mega Pack",
    description: "Producción musical con FL Studio y Ableton",
    category: "música",
    categoryId: 1,
  },
  {
    id: 3,
    name: "Piano Digital",
    description: "Teclado electrónico con 88 teclas",
    category: "música",
    categoryId: 1,
  },
  {
    id: 4,
    name: "Curso de Inglés Avanzado",
    description: "Aprende inglés profesional",
    category: "idiomas",
    categoryId: 2,
  },
  {
    id: 5,
    name: "Excel Avanzado",
    description: "Domina Excel con fórmulas avanzadas",
    category: "ofimática",
    categoryId: 3,
  },
];

// Mapa de categorías
const categoryMap = new Map([
  [1, "música"],
  [2, "idiomas"],
  [3, "ofimática"],
]);

// Tests
async function runTests() {
  console.log("🧪 INICIANDO TESTS DE BÚSQUEDA DE PRODUCTOS\n");
  console.log("=".repeat(60));

  const tests = [
    {
      query: "megapack de piano",
      expectedId: 1,
      expectedName: "Mega Pack de Piano",
      description: "Búsqueda principal - debe encontrar Piano",
    },
    {
      query: "piano",
      expectedId: 1,
      expectedName: "Mega Pack de Piano",
      description: "Búsqueda simple - debe priorizar Mega Pack sobre Piano Digital",
    },
    {
      query: "dj producción",
      expectedId: 2,
      expectedName: "DJ Producción Musical Mega Pack",
      description: "Búsqueda de DJ - debe encontrar DJ Producción",
    },
    {
      query: "inglés",
      expectedId: 4,
      expectedName: "Curso de Inglés Avanzado",
      description: "Búsqueda de idioma - debe encontrar Inglés",
    },
    {
      query: "excel",
      expectedId: 5,
      expectedName: "Excel Avanzado",
      description: "Búsqueda de ofimática - debe encontrar Excel",
    },
    {
      query: "teclado",
      expectedId: 3,
      expectedName: "Piano Digital",
      description: "Búsqueda por descripción - debe encontrar Piano Digital",
    },
    {
      query: "mega pack música",
      expectedId: 1,
      expectedName: "Mega Pack de Piano",
      description: "Búsqueda ambigua - debe priorizar Piano sobre DJ",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    console.log(`\n📝 Test: ${test.description}`);
    console.log(`   Query: "${test.query}"`);
    console.log(`   Esperado: ${test.expectedName} (ID: ${test.expectedId})`);

    try {
      const result = await findBestProductMatch(test.query, testProducts, categoryMap);

      if (!result) {
        console.log(`   ❌ FALLÓ: No encontró ningún producto`);
        failed++;
        continue;
      }

      if (result.product.id === test.expectedId) {
        console.log(`   ✅ PASÓ: Encontró ${result.product.name} (ID: ${result.product.id})`);
        console.log(`   Nivel: ${result.score / 25}`);
        console.log(`   Razonamiento: ${result.reasoning.split("\n")[0]}`);
        passed++;
      } else {
        console.log(`   ❌ FALLÓ: Encontró ${result.product.name} (ID: ${result.product.id})`);
        console.log(`   Razonamiento: ${result.reasoning.split("\n")[0]}`);
        failed++;
      }
    } catch (error) {
      console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\n📊 RESULTADOS:`);
  console.log(`   ✅ Pasados: ${passed}/${tests.length}`);
  console.log(`   ❌ Fallidos: ${failed}/${tests.length}`);
  console.log(`   Porcentaje: ${Math.round((passed / tests.length) * 100)}%`);

  if (failed === 0) {
    console.log(`\n🎉 ¡TODOS LOS TESTS PASARON!`);
  } else {
    console.log(`\n⚠️ Algunos tests fallaron. Revisa la lógica de búsqueda.`);
  }

  console.log("\n" + "=".repeat(60));
}

// Ejecutar tests
runTests().catch(console.error);
