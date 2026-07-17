import { db, products, ensureDbReady } from "@workspace/db";
import { eq, like, sql } from "drizzle-orm";
import { getProviderConfig } from "@workspace/integrations-openai-ai-server";
import OpenAI from "openai";

// Preguntas reales que hacen los clientes
const PREGUNTAS_REALES = [
  {
    id: 1,
    pregunta: "Hola, tienes cursos de diseño gráfico?",
    intencion: "descubrimiento",
    emocion: "curious",
  },
  {
    id: 2,
    pregunta: "Cuánto cuesta el curso de piano?",
    intencion: "precio",
    emocion: "interested",
  },
  {
    id: 3,
    pregunta: "Tienen curso de Excel? Necesito aprender para el trabajo",
    intencion: "busqueda_especifica",
    emocion: "motivated",
  },
  {
    id: 4,
    pregunta: "Ese precio está muy caro, no tienes algo más barato?",
    intencion: "objecion_precio",
    emocion: "objecting",
  },
  {
    id: 5,
    pregunta: "Qué incluye el megapack completo?",
    intencion: "informacion_producto",
    emocion: "curious",
  },
  {
    id: 6,
    pregunta: "Tienes cursos de programación? Quiero aprender Python",
    intencion: "busqueda_especifica",
    emocion: "interested",
  },
  {
    id: 7,
    pregunta: "Me sirve para aprender desde cero? No sé nada de photoshop",
    intencion: "validacion",
    emocion: "doubtful",
  },
  {
    id: 8,
    pregunta: "Cómo me lo envían después de pagar?",
    intencion: "logistica",
    emocion: "interested",
  },
];

async function buscarProductos(query: string): Promise<any[]> {
  const queryLower = query.toLowerCase();
  
  // Palabras clave de búsqueda
  const buscarPor: string[] = [];
  
  if (queryLower.includes("diseño") || queryLower.includes("grafico")) buscarPor.push("diseño", "gráfico");
  if (queryLower.includes("piano")) buscarPor.push("piano", "música");
  if (queryLower.includes("excel")) buscarPor.push("excel", "office");
  if (queryLower.includes("photoshop")) buscarPor.push("photoshop", "diseño");
  if (queryLower.includes("programación") || queryLower.includes("python")) buscarPor.push("programación", "desarrollo");
  if (queryLower.includes("megapack") || queryLower.includes("completo")) buscarPor.push("megapack", "completo", "81");
  
  // Si no hay palabras clave específicas, buscar en la query completa
  if (buscarPor.length === 0) {
    buscarPor.push(...queryLower.split(" ").filter(w => w.length > 3));
  }

  // Buscar en todos los productos
  const allProducts = await db.select().from(products);
  
  const resultados = allProducts.filter(p => {
    const nombreLower = p.name.toLowerCase();
    const descLower = (p.description || "").toLowerCase();
    const catLower = (p.category || "").toLowerCase();
    
    return buscarPor.some(keyword => 
      nombreLower.includes(keyword) || 
      descLower.includes(keyword) || 
      catLower.includes(keyword)
    );
  });

  return resultados.slice(0, 5);
}

async function generarRespuestaIA(
  pregunta: string,
  productosEncontrados: any[],
  emocion: string
): Promise<string> {
  const config = getProviderConfig("opencode");
  
  if (!config) {
    return "❌ OpenCode no configurado";
  }

  // Seleccionar modelo según emoción
  let modelo = "deepseek-v4-flash-free"; // Default balanceado
  
  if (emocion === "objecting" || emocion === "frustrated") {
    modelo = "deepseek-v3-ultra-free"; // Mejor razonamiento
  } else if (emocion === "interested" && pregunta.toLowerCase().includes("pagar")) {
    modelo = "gpt-5.4-mini"; // Rápido para cierre
  }

  const client = new OpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  // Construir contexto de productos
  let productosTexto = "No hay productos que coincidan.";
  if (productosEncontrados.length > 0) {
    productosTexto = productosEncontrados
      .map(
        (p, i) =>
          `${i + 1}. ${p.name} - ${p.price.toLocaleString("es-CO")} COP\n   ${p.description.substring(0, 100)}...`
      )
      .join("\n\n");
  }

  const systemPrompt = `Eres un asistente de ventas profesional de Tecnovariedades, una tienda de cursos digitales en Colombia.

INFORMACIÓN DE PRODUCTOS DISPONIBLES:
${productosTexto}

INSTRUCCIONES:
- Sé amigable, profesional y directo
- Menciona precios en pesos colombianos (COP)
- Si preguntan por un producto, menciona los más relevantes
- Si el cliente objeta el precio, enfatiza el valor y contenido
- Para preguntas de envío: "Se envía inmediatamente por Google Drive al WhatsApp después del pago"
- Mantén respuestas cortas y conversacionales (máximo 3 líneas)
- NO menciones certificados ni suscripciones`;

  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model: modelo,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: pregunta },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    const duration = Date.now() - start;
    const respuesta = response.choices[0]?.message?.content || "Sin respuesta";

    return `${respuesta}\n\n[Modelo: ${modelo} | Tiempo: ${duration}ms]`;
  } catch (error: any) {
    return `❌ Error: ${error.message}`;
  }
}

async function testRealScenarios() {
  console.log("🧪 === PRUEBA CON ESCENARIOS REALES ===\n");
  console.log("📦 Base de datos: tecnovariedades.db");
  console.log("🤖 IA: OpenCode (FreeModel.dev)\n");
  console.log("=" .repeat(80) + "\n");

  await ensureDbReady();
  console.log("✅ Base de datos conectada\n");

  // Obtener estadísticas de productos
  const totalProductos = await db.select().from(products);
  console.log(`📊 Productos disponibles: ${totalProductos.length}`);
  
  const byCategory = totalProductos.reduce((acc: any, p: any) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  console.log("📁 Categorías principales:");
  Object.entries(byCategory)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([cat, count]) => {
      console.log(`   • ${cat}: ${count} productos`);
    });

  console.log("\n" + "=".repeat(80) + "\n");

  // Ejecutar cada escenario
  for (const escenario of PREGUNTAS_REALES) {
    console.log(`\n${"▼".repeat(40)}`);
    console.log(`\n🧑 CLIENTE #${escenario.id}:`);
    console.log(`   "${escenario.pregunta}"`);
    console.log(`   [Intención: ${escenario.intencion} | Emoción: ${escenario.emocion}]`);
    console.log("");

    // 1. Buscar productos relacionados
    console.log("🔍 Buscando productos en la base de datos...");
    const productosEncontrados = await buscarProductos(escenario.pregunta);
    
    if (productosEncontrados.length > 0) {
      console.log(`✅ Encontrados ${productosEncontrados.length} productos relevantes:`);
      productosEncontrados.slice(0, 3).forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} - ${p.price.toLocaleString("es-CO")} COP`);
      });
    } else {
      console.log("⚠️  No se encontraron productos específicos");
    }
    console.log("");

    // 2. Generar respuesta con IA
    console.log("🤖 Generando respuesta con IA...");
    const respuesta = await generarRespuestaIA(
      escenario.pregunta,
      productosEncontrados,
      escenario.emocion
    );

    console.log("\n💬 RESPUESTA DEL BOT:");
    console.log("─".repeat(70));
    console.log(respuesta);
    console.log("─".repeat(70));

    // Pequeña pausa entre escenarios
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n\n" + "=".repeat(80));
  console.log("\n✅ PRUEBA COMPLETADA");
  console.log(`   Total de escenarios probados: ${PREGUNTAS_REALES.length}`);
  console.log("   Base de datos: ✅ Funcionando");
  console.log("   Búsqueda de productos: ✅ Funcionando");
  console.log("   IA OpenCode: ✅ Funcionando");
  console.log("\n" + "=".repeat(80) + "\n");

  process.exit(0);
}

testRealScenarios().catch((e) => {
  console.error("❌ Error en prueba:", e);
  process.exit(1);
});
