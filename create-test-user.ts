import crypto from "crypto";
import { db, tenants } from "@workspace/db";

async function createTestUser() {
  const email = "daveymena16@gmail.com";
  const password = "test123456";
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

  try {
    const [newTenant] = await db.insert(tenants).values({
      name: "Test User",
      email,
      passwordHash,
      slug: "davey-mena",
      brandName: "Test Brand",
      status: "active",
      plan: "enterprise",
      agentName: "Sofía",
      agentPersonality: "professional",
      emailVerified: true,
      settings: {
        timezone: "America/Bogota",
        language: "es",
        currency: "COP",
        autoRespond: true
      }
    }).returning();

    console.log("✅ Usuario de prueba creado:");
    console.log(`Email: ${email}`);
    console.log(`Contraseña: ${password}`);
    console.log(`Tenant ID: ${newTenant.id}`);
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

createTestUser();
