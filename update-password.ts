import crypto from "crypto";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";

async function updateUserPassword() {
  const email = "daveymena16@gmail.com";
  const password = "6715320D";
  const passwordHash = crypto.createHash("sha256").update(password).digest("hex");

  try {
    const result = await db.update(tenants)
      .set({ passwordHash })
      .where(eq(tenants.email, email))
      .returning();

    if (result.length === 0) {
      console.log("❌ Usuario no encontrado");
    } else {
      console.log("✅ Contraseña actualizada correctamente:");
      console.log(`Email: ${email}`);
      console.log(`Contraseña: ${password}`);
      console.log(`Hash: ${passwordHash}`);
      console.log(`Tenant ID: ${result[0].id}`);
    }
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

updateUserPassword();
