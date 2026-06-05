/**
 * Test Simple de Búsqueda de Productos
 * Verifica la lógica sin dependencias
 */

// Simulación de normalizeText
function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .replace(/ñ/g, "n")
    .replace(/[^\w\sáéíóúñü]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Productos de prueba
const testProducts = [
  {
    id: 1,
    name: "Mega Pack de Piano",
    description: "Aprende piano desde cero con 150 clases",
    category: "música",
  },
  {
    id: 2,
    name: "DJ Producción Musical Mega Pack",
    description: "Producción musical con FL Studio y Ableton",
    category: "música",
  },
  {
    id: 3,
    name: "Piano Digital",
    description: "Teclado electrónico con 88 teclas",
    category: "música",
  },
];

// Función de búsqueda simplificada
function findProduct(query, products) {
  const normalized = normalizeText(query);
  const words = normalized.split(/\s+/).filter(w => w.length > 2);

  console.log(`\n📝 Búsqueda: "${query}"`);
  console.log(`   Normalizado: "${normalized}"`);
  console.log(`   Palabras: [${words.join(", ")}]`);

  let bestMatch = null;
  let bestScore = 0;

  for (const product of products) {
    const productName = normalizeText(product.name);
    const productDesc = normalizeText(product.description);
    const combined = `${productName} ${productDesc}`;

    // Contar coincidencias
    const nameHits = words.filter(w => productName.includes(w)).length;
    const descHits = words.filter(w => productDesc.includes(w)).length;
    const totalHits = nameHits + descHits;

    // Calcular score
    let score = 0;
    if (nameHits === words.length) score = 100; // Todas en nombre
    else if (nameHits > 0) score = 50 + nameHits * 10; // Algunas en nombre
    else if (descHits > 0) score = 20 + descHits * 5; // En descripción
    else if (words.some(w => combined.includes(w))) score = 10; // Coincidencia genérica

    console.log(`   ${product.name}: score=${score} (nombre=${nameHits}, desc=${descHits})`);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
  }

  if (bestMatch) {
    console.log(`   ✅ Encontrado: ${bestMatch.name} (score: ${bestScore})`);
    return bestMatch;
  } else {
    console.log(`   ❌ No encontrado`);
    return null;
  }
}

// Tests
console.log("🧪 TESTS DE BÚSQUEDA DE PRODUCTOS\n");
console.log("=".repeat(60));

const tests = [
  { query: "megapack de piano", expected: "Mega Pack de Piano" },
  { query: "piano", expected: "Mega Pack de Piano" },
  { query: "dj producción", expected: "DJ Producción Musical Mega Pack" },
  { query: "teclado", expected: "Piano Digital" },
  { query: "mega pack música", expected: "Mega Pack de Piano" },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = findProduct(test.query, testProducts);

  if (result && result.name === test.expected) {
    console.log(`   ✅ PASÓ\n`);
    passed++;
  } else {
    console.log(`   ❌ FALLÓ - Esperado: ${test.expected}\n`);
    failed++;
  }
}

console.log("=".repeat(60));
console.log(`\n📊 RESULTADOS:`);
console.log(`   ✅ Pasados: ${passed}/${tests.length}`);
console.log(`   ❌ Fallidos: ${failed}/${tests.length}`);
console.log(`   Porcentaje: ${Math.round((passed / tests.length) * 100)}%`);

if (failed === 0) {
  console.log(`\n🎉 ¡TODOS LOS TESTS PASARON!`);
} else {
  console.log(`\n⚠️ Algunos tests fallaron.`);
}

console.log("\n" + "=".repeat(60));
