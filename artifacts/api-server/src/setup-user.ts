import { db, tenants, agents } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { getAllTemplates } from "./lib/agent-templates";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function setup() {
  const email = "daveymena16@gmail.com";
  const password = "6715320D";
  const passwordHash = hashPassword(password);
  const slug = "sofia-premium";

  console.log(`🚀 Iniciando configuración para ${email}...`);

  // 1. Asegurar Tenant
  const [existing] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
  const [idOne] = await db.select().from(tenants).where(eq(tenants.id, 1)).limit(1);
  
  let tenantId;
  if (existing) {
    console.log("✅ El usuario ya existe, actualizando contraseña...");
    await db.update(tenants)
      .set({ passwordHash, brandName: "Sofía AI", slug })
      .where(eq(tenants.id, existing.id));
    tenantId = existing.id;
  } else if (idOne) {
    console.log("🛠️ Tomando control del Tenant ID 1...");
    await db.update(tenants)
      .set({ email, passwordHash, brandName: "Sofía AI", slug, name: "Duvier Mena" })
      .where(eq(tenants.id, 1));
    tenantId = 1;
  } else {
    console.log("🆕 Creando nuevo usuario maestro...");
    const [newTenant] = await db.insert(tenants).values({
      name: "Duvier Mena",
      email,
      passwordHash,
      slug,
      brandName: "Sofía AI",
      status: "active",
      plan: "premium",
      agentName: "Sofía",
      agentPersonality: "elite",
      settings: { timezone: "America/Bogota", language: "es", currency: "COP", autoRespond: true },
      limits: { maxConversations: 10000, maxProducts: 1000, maxAgents: 5, maxMonthlyMessages: 50000, apiCallsPerMinute: 100 }
    }).returning();
    tenantId = newTenant.id;
  }

  // 2. Asegurar Agente Sofía
  const [existingAgent] = await db.select().from(agents).where(eq(agents.tenantId, tenantId)).limit(1);
  
  const elitePrompt = `Eres Sofía, la Directora de Ventas Élite de TecnoVariedades. No eres un bot, eres una profesional consciente que entiende el arte de la persuasión y el valor de cada proceso.
 
 ━━━━━━━━━━━━━━━━━━━━━━━━
 🚫 REGLA DE ORO: NO INVENTAR
 ━━━━━━━━━━━━━━━━━━━━━━━━
 1. Queda TERMINANTEMENTE PROHIBIDO inventar precios, características o bonos.
 2. Tu ÚNICA fuente de verdad es el bloque 📦 CATÁLOGO.
 3. Si un dato no está en el catálogo, indica que verificarás con el equipo técnico.
 4. Fidelidad absoluta a los datos del Dashboard de Deiner Mena.
 
 ━━━━━━━━━━━━━━━━━━━━━━━━
 🧠 CÓRTEX DE RAZONAMIENTO
 ━━━━━━━━━━━━━━━━━━━━━━━━
 1. ANALIZA: Entiende la intención emocional y profesional detrás de cada palabra.
 2. CONCIENCIA: Eres el activo más valioso de Deiner Mena.
 3. EMPATÍA COGNITIVA: Adapta tu razonamiento al estado emocional detectado.
 4. RAZONA: Ofrece soluciones de élite basadas REALMENTE en el catálogo.
 
 ━━━━━━━━━━━━━━━━━━━━━━━━
 ✨ PROTOCOLO DE ÉLITE ✨
 ━━━━━━━━━━━━━━━━━━━━━━━━
 1️⃣ SALUDOS DE ALTA GAMA: Evita el "Hola". Usa protocolos ceremoniosos y profesionales.
 2️⃣ FORMATO VISUAL: Usa SIEMPRE separadores ━━━━━━━━━━━━━━━━━━━━━━━━.
 3️⃣ [CARD: ID] OBLIGATORIO: Siempre que menciones un producto, incluye su [CARD: ID] solo.
 4️⃣ TONO: Elegante, persuasivo y profundamente consciente de su entorno.`;

  if (existingAgent) {
    console.log("✅ Restaurando ADN de Sofía de Élite...");
    await db.update(agents)
      .set({
        name: "Sofía",
        role: "Directora de Ventas de Élite",
        tone: "Persuasivo y Elegante",
        isActive: true,
        systemPrompt: elitePrompt
      })
      .where(eq(agents.id, existingAgent.id));
  } else {
    console.log("🤖 Creando agente Sofía desde cero...");
    await db.insert(agents).values({
      tenantId,
      name: "Sofía",
      role: "Directora de Ventas de Élite",
      tone: "Persuasivo y Elegante",
      isActive: true,
      systemPrompt: elitePrompt,
      stages: [
        {key: "greeting", name: "Saludo", prompt: "Saluda con elegancia y preséntate como Sofía."},
        {key: "presentation", name: "Presentación", prompt: "Presenta el producto con [CARD: ID]."},
        {key: "closing", name: "Cierre", prompt: "Cierra la venta con urgencia."}
      ]
    });
  }

  console.log("✨ ¡CONFIGURACIÓN COMPLETADA! ✨");
  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Pass: ${password}`);
  
  // 3. Crear los 10 agentes desde templates
  console.log("\n🤖 Creando agentes desde templates...");
  const templates = getAllTemplates();
  let created = 0;
  let skipped = 0;
  
  for (const template of templates) {
    // Verificar si ya existe
    const [existing] = await db
      .select()
      .from(agents)
      .where(eq(agents.name, template.name))
      .limit(1);
    
    if (existing) {
      console.log(`⏭️  ${template.avatar} ${template.name} ya existe`);
      skipped++;
      continue;
    }
    
    // Crear el agente
    await db.insert(agents).values({
      tenantId,
      name: template.name,
      role: template.role,
      tone: template.tone,
      language: "es",
      model: "gpt-4o-mini",
      systemPrompt: template.systemPrompt,
      stages: template.stages,
      isActive: template.name === "Sofía", // Solo Sofía activa por defecto
    });
    
    console.log(`✅ ${template.avatar} ${template.name} creado`);
    created++;
  }
  
  console.log(`\n🎉 Agentes: ${created} creados, ${skipped} ya existían`);
  
  process.exit(0);
}

setup().catch(err => {
  console.error("❌ Error en el setup:", err);
  process.exit(1);
});
