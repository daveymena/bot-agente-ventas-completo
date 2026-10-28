// Cargar .env ANTES que cualquier otro import — app.ts y sus dependencias
// leen process.env en el momento en que se importan (CORS origins, secretos
// de cookie, config de proveedores IA, etc.). Sin esto, ningún script de
// arranque local (nodemon, tsx directo, run.ps1) cargaba el .env — quedaban
// todas las claves (IA, Facebook, WhatsApp) vacías y el bot "no funcionaba".
// Se resuelve relativo a este archivo (no a process.cwd()) para que
// funcione igual corriendo desde src/ (tsx) o desde dist/ (bundle de
// esbuild), sin importar desde qué directorio se lanzó el proceso.
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { instalarApagadoOrdenado } from "./lib/apagado-ordenado";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

// IMPORTANTE: import() dinámico, no estático. Un `import app from "./app"`
// estático se resuelve y ejecuta ANTES que el loadDotenv() de arriba (los
// imports estáticos de un módulo se instancian antes de que corra el cuerpo
// del propio módulo) — app.ts leería process.env vacío. El import dinámico
// sí respeta el orden de ejecución real, así que corre después de cargar
// el .env.
async function start() {
  const role = process.env.VENTASPRO_PROCESS_ROLE || "combined";
  if (!new Set(["combined", "gateway", "worker"]).has(role)) {
    throw new Error(`VENTASPRO_PROCESS_ROLE inválido: ${role}. Usa combined, gateway o worker.`);
  }
  if ((role === "gateway" || role === "worker") &&
      (process.env.WHATSAPP_GATEWAY_TOKEN || "").length < 32) {
    throw new Error("Los roles gateway/worker requieren un WHATSAPP_GATEWAY_TOKEN de al menos 32 caracteres.");
  }
  if (role === "worker") {
    if (!process.env.WHATSAPP_GATEWAY_URL) {
      throw new Error("El rol worker requiere WHATSAPP_GATEWAY_URL.");
    }
    const gatewayUrl = new URL(process.env.WHATSAPP_GATEWAY_URL);
    if (process.env.NODE_ENV === "production" && gatewayUrl.protocol !== "https:") {
      throw new Error("WHATSAPP_GATEWAY_URL debe usar HTTPS en producción.");
    }
    if (gatewayUrl.pathname !== "/" || gatewayUrl.search || gatewayUrl.hash) {
      throw new Error("WHATSAPP_GATEWAY_URL debe ser el origen del gateway, sin ruta, query ni fragmento.");
    }
  }

  const { initializeMessagePersistence } = await import("./lib/message-queue/postgres-store");
  await initializeMessagePersistence();
  const { logger } = await import("./lib/logger");
  const { ensureDbReady } = await import("@workspace/db");

  // No importar app.ts todavía: ese módulo arranca WhatsApp y varios
  // programadores como efecto lateral. Primero deja lista la base y aplica
  // las migraciones para que ningún worker toque un esquema a medio preparar.
  logger.info("[DB] Esperando inicialización de base de datos...");
  await ensureDbReady();
  logger.info("[DB] Base de datos lista");

  const { runAutoMigrations } = await import("./lib/autoMigrate");
  if (role !== "worker") await runAutoMigrations();

  // Solo después del esquema listo arrancan los sockets y schedulers.
  const { default: app } = await import("./app");

  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // Claves de IA guardadas desde la pantalla de Configuración: se vuelcan al
  // entorno para que los proveedores las usen igual que las del .env.
  try {
    const { cargarClavesEnEntorno } = await import("./lib/ai-keys");
    await cargarClavesEnEntorno();
  } catch (err) {
    logger.warn({ err }, "[AIKeys] no se pudieron cargar las claves guardadas");
  }

  // ── La plataforma siempre tiene que tener un dueño ─────────────────────
  // Si NO existe ningún administrador, se promueve al tenant dueño del deploy
  // (PLATFORM_TENANT_ID, por defecto 1). Sin esto, una instalación nueva queda
  // sin nadie que pueda administrar clientes: el backend ya permitía crear al
  // primer admin, pero la única pantalla que lo ofrecía exigía ser admin --
  // el huevo y la gallina, verificado en vivo el 2026-08-19.
  //
  // Solo corre cuando el conteo de admins es CERO, así que no puede quitarle
  // ni darle permisos a nadie una vez que la plataforma tiene su dueño.
  try {
    const { db, tenants } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tenants)
      .where(eq(tenants.isAdmin, true));
    if (Number(n) === 0) {
      const dueno = Number(process.env.PLATFORM_TENANT_ID || 1);
      await db.update(tenants).set({ isAdmin: true }).where(eq(tenants.id, dueno));
      logger.warn({ tenantId: dueno }, "[Bootstrap] No había ningún administrador: se promovió al dueño de la plataforma");
    }
  } catch (err) {
    // Nunca impedir que el servidor arranque por esto.
    logger.warn({ err }, "[Bootstrap] no se pudo verificar si existe un administrador");
  }

  app.listen(port, "0.0.0.0", (err: any) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, host: "0.0.0.0", role, authDir: process.env.WA_AUTH_DIR || "data/.baileys-auth" }, "Server listening");

    // Revisión periódica de disponibilidad en Dropi (cada DROPI_REVISION_HORAS,
    // 6 por defecto; 0 la apaga). Dropify no sincroniza stock: si el
    // proveedor archiva un producto, nadie se entera hasta que un cliente lo
    // pide (#323). Ver lib/dropi-disponibilidad.ts.
    if (role !== "worker") {
      import("./lib/dropi-disponibilidad").then(({ programarRevisionDeDropi }) => {
        programarRevisionDeDropi(async () => {
          const { db, tenants } = await import("@workspace/db");
          const filas = await db.select({ id: tenants.id }).from(tenants);
          return filas.map((t: any) => Number(t.id));
        });
      }).catch((err) => logger.warn({ err }, "[Dropi] No se pudo programar la revisión de disponibilidad"));
    }

    // Cerrar el socket de WhatsApp ANTES de morir. Sin esto, un deploy mata
    // el proceso con la sesión a medio cerrar y WhatsApp entrega los mensajes
    // de esa ventana a un socket muerto: no se encolan y no se reenvían.
    // Le costó al negocio dos clientes que venían de anuncios pagos.
    instalarApagadoOrdenado();
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
