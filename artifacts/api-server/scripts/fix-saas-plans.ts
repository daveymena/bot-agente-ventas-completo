import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

async function fixSaasPlans() {
  try {
    console.log("🔧 Reparando planes SaaS...");

    // Obtener todos los tenants
    const allTenants = await db.select().from(tenants);
    console.log(`📊 Total de tenants: ${allTenants.length}`);

    // Actualizar tenants con planes inválidos
    for (const tenant of allTenants) {
      const validPlans = ["free", "starter", "professional", "enterprise"];
      
      if (!validPlans.includes(tenant.plan)) {
        console.log(`⚠️  Tenant ${tenant.id} (${tenant.email}) tiene plan inválido: "${tenant.plan}"`);
        
        // Actualizar a plan starter
        await db.update(tenants)
          .set({ 
            plan: "starter",
            status: "trial"
          })
          .where(eq(tenants.id, tenant.id));
        
        console.log(`✅ Actualizado a plan "starter" con estado "trial"`);
      } else {
        console.log(`✓ Tenant ${tenant.id} (${tenant.email}) - Plan válido: ${tenant.plan}`);
      }
    }

    console.log("\n✅ Reparación completada");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixSaasPlans();
