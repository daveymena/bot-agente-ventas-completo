import { db, agents } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAllTemplates } from "../lib/agent-templates";

/**
 * Script para crear los 10 agentes desde los templates
 * Solo crea agentes que no existan ya
 */
async function seedAgents() {
  console.log("🤖 Iniciando seed de agentes...");
  
  const templates = getAllTemplates();
  let created = 0;
  let skipped = 0;
  
  for (const template of templates) {
    // Verificar si ya existe un agente con este nombre
    const [existing] = await db
      .select()
      .from(agents)
      .where(eq(agents.name, template.name))
      .limit(1);
    
    if (existing) {
      console.log(`⏭️  Agente "${template.name}" ya existe, saltando...`);
      skipped++;
      continue;
    }
    
    // Crear el agente
    await db.insert(agents).values({
      tenantId: 1, // Tenant por defecto
      name: template.name,
      role: template.role,
      tone: template.tone,
      language: "es",
      model: "gpt-4o-mini",
      systemPrompt: template.systemPrompt,
      stages: template.stages,
      isActive: template.name === "Sofía", // Solo Sofía activa por defecto
    });
    
    console.log(`✅ Agente "${template.name}" (${template.avatar}) creado`);
    created++;
  }
  
  console.log(`\n🎉 Seed completado:`);
  console.log(`   ✅ ${created} agentes creados`);
  console.log(`   ⏭️  ${skipped} agentes ya existían`);
  console.log(`   📊 Total: ${templates.length} templates procesados\n`);
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAgents()
    .then(() => {
      console.log("✅ Seed exitoso");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error en seed:", error);
      process.exit(1);
    });
}

export { seedAgents };
