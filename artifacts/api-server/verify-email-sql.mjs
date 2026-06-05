import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

const email = "daveymena16@gmail.com";

console.log("🔍 Verificando email manualmente:", email);

try {
  await client.connect();
  
  // Verificar estado actual
  const result = await client.query(
    "SELECT id, name, email, email_verified FROM tenants WHERE email = $1",
    [email]
  );

  if (result.rows.length === 0) {
    console.log("❌ Usuario no encontrado");
    await client.end();
    process.exit(1);
  }

  const user = result.rows[0];
  console.log("📊 Estado actual:");
  console.log("  - ID:", user.id);
  console.log("  - Nombre:", user.name);
  console.log("  - Email:", user.email);
  console.log("  - Email verificado:", user.email_verified);

  // Verificar email
  await client.query(
    `UPDATE tenants 
     SET email_verified = true, 
         email_verification_code = NULL, 
         email_verification_expiry = NULL,
         updated_at = NOW()
     WHERE email = $1`,
    [email]
  );

  console.log("✅ Email verificado exitosamente");
  console.log("Ahora puedes iniciar sesión con:", email);
  
  await client.end();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error);
  await client.end();
  process.exit(1);
}
