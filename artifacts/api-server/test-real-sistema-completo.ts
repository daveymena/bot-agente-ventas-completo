/**
 * TEST REAL DEL SISTEMA COMPLETO
 * Usa base de datos real, métodos reales, información real
 * Simula preguntas sobre productos y verifica que se muestran correctamente
 */

import { db, products, conversations, messages, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { computeDecision, ConversationMemory } from "./src/lib/conversation-engine";
import { config } from "dotenv";
import path from "path";

// Cargar variables de entorno
config({ path: path.resolve(process.cwd(), ".env") });

// Tenant real (usuario de prueba)
const TENANT_ID = 1;
const USER_ID = "test-user-" + Date.now();

// Preguntas de prueba sobre productos
const testQueries = [
  "Me interesa el megapack de piano",
  "¿Cuánto cuesta el piano?",
  "Quiero aprender dj producción",
  "¿Tienen cursos de inglés?",
  "Muéstrame los cursos disponibles",
];

async function runRealTest() {
  console.log("🧪 TEST REAL DEL SISTEMA COMPLETO\n");
  console.log("=".repeat(70));

  try {
    // 1. Verificar conexión a BD
    console.log("\n📊 PASO 1: Verificar conexión a base de datos");
    const tenantCheck = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, TENANT_ID))
      .limit(1);

    if (tenantCheck.length === 0) {
      console.log(`❌ Tenant ${TENANT_ID} no encontrado`);
      return;
    }

    const tenant = tenantCheck[0];
    console.log(`✅ Tenant encontrado: ${tenant.name} (ID: ${tenant.id})`);

    // 2. Cargar productos reales de la BD
    console.log("\n📊 PASO 2: Cargar productos reales de la BD");
    const productList = await db
      .select()
      .from(products)
      .where(eq(products.tenantId, TENANT_ID))
      .limit(100);

    console.log(`✅ Productos cargados: ${productList.length}`);
    if (productList.length > 0) {
      console.log(`   Primeros 5 productos:`);
      productList.slice(0, 5).forEach((p) => {
        console.log(`   - ${p.name} (ID: ${p.id}, Precio: ${p.price})`);
      });
    }

    // 3. Crear mapa de categorías real
    console.log("\n📊 PASO 3: Crear mapa de categorías");
    const categoryMap = new Map<number, string>();
    const uniqueCategories = [...new Set(productList.map((p) => p.categoryId))];
    uniqueCategories.forEach((catId) => {
      if (catId) {
        const product = productList.find((p) => p.categoryId === catId);
        if (product && product.category) {
          categoryMap.set(catId, product.category);
        }
      }
    });
    console.log(`✅ Categorías mapeadas: ${categoryMap.size}`);

    // 4. Crear conversación real
    console.log("\n📊 PASO 4: Crear conversación real en BD");
    const [conversation] = await db
      .insert(conversations)
      .values({
        tenantId: TENANT_ID,
        contactName: "Test User",
        contactPhone: "+573001234567",
        status: "active",
      })
      .returning();

    console.log(`✅ Conversación creada: ${conversation.id}`);

    // 5. Crear memoria de conversación real
    const memory: ConversationMemory = {
      history: [],
      hasGreeted: false,
      currentStage: "greeting",
      currentProductId: null,
      currentProductName: null,
      sentProductIds: new Set(),
      lastCustomerMessage: "",
      lastAgentMessage: "",
      messageCount: 0,
      isNewSession: true,
      sessionStartedAt: new Date(),
      paymentStatus: null,
      paymentMethod: null,
      paymentAmount: null,
      paidAt: null,
    };

    // 6. Ejecutar tests con preguntas reales
    console.log("\n📊 PASO 5: Ejecutar tests con preguntas reales\n");
    console.log("=".repeat(70));

    let passedTests = 0;
    let failedTests = 0;

    for (const query of testQueries) {
      console.log(`\n📝 Pregunta: "${query}"`);

      try {
        // Ejecutar decisión del motor con datos REALES
        const decision = await computeDecision(
          memory,
          query,
          productList,
          categoryMap
        );

        console.log(`   Intent: ${decision.intent}`);
        console.log(`   Stage: ${decision.stage}`);
        console.log(`   Should Send Card: ${decision.shouldSendCard}`);

        if (decision.productToShow) {
          console.log(`\n   🎯 Producto a Mostrar:`);
          console.log(`   - ID: ${decision.productToShow.id}`);
          console.log(`   - Nombre: ${decision.productToShow.name}`);
          console.log(`   - Precio: ${decision.productToShow.price} ${decision.productToShow.currency}`);
          console.log(`   - Descripción: ${decision.productToShow.description?.substring(0, 50)}...`);

          // Guardar mensaje en BD
          await db.insert(messages).values({
            conversationId: conversation.id,
            tenantId: TENANT_ID,
            role: "user",
            content: query,
            metadata: {
              productId: decision.productToShow.id,
              intent: decision.intent,
            },
          });

          console.log(`   ✅ PASÓ - Producto encontrado y guardado en BD`);
          passedTests++;
        } else {
          console.log(`   ⚠️ No hay producto a mostrar`);
          console.log(`   Reasoning: ${decision.reasoning}`);

          // Guardar mensaje en BD
          await db.insert(messages).values({
            conversationId: conversation.id,
            tenantId: TENANT_ID,
            role: "user",
            content: query,
            metadata: {
              intent: decision.intent,
              noProduct: true,
            },
          });

          console.log(`   ⚠️ ADVERTENCIA - Sin producto`);
          failedTests++;
        }
      } catch (error) {
        console.log(`   ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
        failedTests++;
      }
    }

    // 7. Resumen final
    console.log("\n" + "=".repeat(70));
    console.log(`\n📊 RESULTADOS FINALES:`);
    console.log(`   ✅ Tests pasados: ${passedTests}/${testQueries.length}`);
    console.log(`   ❌ Tests fallidos: ${failedTests}/${testQueries.length}`);
    console.log(`   Porcentaje: ${Math.round((passedTests / testQueries.length) * 100)}%`);

    // 8. Verificar datos guardados en BD
    console.log(`\n📊 PASO 6: Verificar datos guardados en BD`);
    const savedMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));

    console.log(`✅ Mensajes guardados: ${savedMessages.length}`);
    savedMessages.forEach((msg) => {
      console.log(`   - "${msg.content}" (productId: ${msg.metadata?.productId || "none"})`);
    });

    if (passedTests === testQueries.length) {
      console.log(`\n🎉 ¡TODOS LOS TESTS PASARON!`);
      console.log(`\n✅ El sistema está funcionando correctamente:`);
      console.log(`   ✅ Base de datos conectada`);
      console.log(`   ✅ Productos cargados correctamente`);
      console.log(`   ✅ Búsqueda de productos funciona`);
      console.log(`   ✅ Datos guardados en BD`);
      console.log(`   ✅ Sistema REAL funcionando`);
    } else {
      console.log(`\n⚠️ Algunos tests fallaron. Revisa los logs.`);
    }

    console.log("\n" + "=".repeat(70));
  } catch (error) {
    console.error("❌ ERROR CRÍTICO:", error);
  }
}

// Ejecutar test
runRealTest().catch(console.error);
