#!/usr/bin/env tsx

import { db, conversations, messages } from "@workspace/db";

/**
 * Script para resetear conversaciones y mensajes
 * Mantiene: tenants, agents, products, settings, leads
 * Elimina: conversations, messages
 */

async function resetConversations() {
  console.log("🔄 Iniciando reset de conversaciones...");
  console.log("━".repeat(50));
  
  try {
    // 1. Contar registros antes del reset
    const conversationsBefore = await db.select().from(conversations);
    const messagesBefore = await db.select().from(messages);
    
    console.log("\n📊 Estado actual:");
    console.log(`   Conversaciones: ${conversationsBefore.length}`);
    console.log(`   Mensajes: ${messagesBefore.length}`);
    console.log("");
    
    // 2. Confirmar acción
    console.log("⚠️  ADVERTENCIA: Esta acción eliminará:");
    console.log("   ❌ Todas las conversaciones");
    console.log("   ❌ Todos los mensajes");
    console.log("");
    console.log("✅ Se mantendrán:");
    console.log("   ✓ Tenants y usuarios");
    console.log("   ✓ Agentes");
    console.log("   ✓ Productos");
    console.log("   ✓ Configuraciones");
    console.log("   ✓ Leads (contactos)");
    console.log("");
    
    // 3. Eliminar mensajes primero (foreign key)
    console.log("🗑️  Eliminando mensajes...");
    await db.delete(messages);
    console.log("   ✅ Mensajes eliminados");
    
    // 4. Eliminar conversaciones
    console.log("🗑️  Eliminando conversaciones...");
    await db.delete(conversations);
    console.log("   ✅ Conversaciones eliminadas");
    
    // 5. Verificar
    const conversationsAfter = await db.select().from(conversations);
    const messagesAfter = await db.select().from(messages);
    
    console.log("");
    console.log("━".repeat(50));
    console.log("✅ Reset completado exitosamente");
    console.log("");
    console.log("📊 Estado final:");
    console.log(`   Conversaciones: ${conversationsAfter.length}`);
    console.log(`   Mensajes: ${messagesAfter.length}`);
    console.log("");
    console.log("🎉 Listo para empezar de cero");
    console.log("💡 Los leads, productos y agentes se mantienen intactos");
    console.log("━".repeat(50));
    
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("❌ Error durante el reset:", error);
    console.error("");
    process.exit(1);
  }
}

// Ejecutar
resetConversations();
