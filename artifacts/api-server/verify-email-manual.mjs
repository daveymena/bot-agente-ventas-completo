import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import dotenv from "dotenv";

dotenv.config();

const email = "daveymena16@gmail.com";

console.log("🔍 Verificando email manualmente:", email);

try {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.email, email))
    .limit(1);

  if (!tenant) {
    console.log("❌ Usuario no encontrado");
    process.exit(1);
  }

  console.log("📊 Estado actual:");
  console.log("  - Email:", tenant.email);
  console.log("  - Email verificado:", tenant.emailVerified);
  console.log("  - Nombre:", tenant.name);

  // Verificar email
  await db
    .update(tenants)
    .set({
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null,
    })
    .where(eq(tenants.email, email));

  console.log("✅ Email verificado exitosamente");
  console.log("Ahora puedes iniciar sesión con:", email);
  
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error);
  process.exit(1);
}
