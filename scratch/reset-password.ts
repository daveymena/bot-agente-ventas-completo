import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

async function checkAndResetPassword() {
  const email = "daveymena16@gmail.com";
  const newPassword = "6715320D";
  const newHash = hashPassword(newPassword);

  console.log(`🔍 Buscando usuario en la base de datos: ${email}`);
  
  const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
  
  if (!tenant) {
    console.log(`❌ No se encontró el usuario ${email}.`);
    return;
  }
  
  console.log(`✅ Usuario encontrado. ID: ${tenant.id}`);
  console.log(`🔑 Hash actual: ${tenant.passwordHash?.substring(0, 15)}...`);
  console.log(`🔑 Hash esperado para "${newPassword}": ${newHash.substring(0, 15)}...`);
  
  if (tenant.passwordHash !== newHash) {
    console.log(`⚠️ Los hashes no coinciden. Actualizando contraseña en la base de datos...`);
    await db.update(tenants)
      .set({ passwordHash: newHash })
      .where(eq(tenants.id, tenant.id));
    console.log(`✅ Contraseña actualizada con éxito.`);
  } else {
    console.log(`✅ La contraseña en la base de datos ya es correcta.`);
  }
}

checkAndResetPassword().catch(err => console.error("Error:", err));
