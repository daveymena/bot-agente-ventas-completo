import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

async function resetPassword() {
  try {
    const email = "daveymena16@gmail.com";
    const newPassword = "test123456";

    console.log(`🔧 Reseteando contraseña para: ${email}`);

    // Hash the password
    const passwordHash = crypto.createHash("sha256").update(newPassword).digest("hex");

    // Update the tenant
    const result = await db.update(tenants)
      .set({ passwordHash })
      .where(eq(tenants.email, email))
      .returning();

    if (result.length > 0) {
      console.log(`✅ Contraseña actualizada exitosamente`);
      console.log(`📧 Email: ${email}`);
      console.log(`🔑 Nueva contraseña: ${newPassword}`);
    } else {
      console.log(`❌ Usuario no encontrado`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

resetPassword();
