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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

// IMPORTANTE: import() dinámico, no estático. Un `import app from "./app"`
// estático se resuelve y ejecuta ANTES que el loadDotenv() de arriba (los
// imports estáticos de un módulo se instancian antes de que corra el cuerpo
// del propio módulo) — app.ts leería process.env vacío. El import dinámico
// sí respeta el orden de ejecución real, así que corre después de cargar
// el .env.
async function start() {
  const { default: app } = await import("./app");
  const { logger } = await import("./lib/logger");
  const { runAutoMigrations } = await import("./lib/autoMigrate");
  const { ensureDbReady } = await import("@workspace/db");

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

  // Wait for database to be ready before accepting connections
  logger.info("[DB] Esperando inicialización de base de datos...");
  try {
    await ensureDbReady();
    logger.info("[DB] Base de datos lista");
  } catch (err) {
    logger.error({ err }, "[DB] Error en ensureDbReady, continuando de todas formas");
  }

  // Non-blocking database migrations (fires in background)
  runAutoMigrations().catch(() => {});

  // Claves de IA guardadas desde la pantalla de Configuración: se vuelcan al
  // entorno para que los proveedores las usen igual que las del .env.
  try {
    const { cargarClavesEnEntorno } = await import("./lib/ai-keys");
    await cargarClavesEnEntorno();
  } catch (err) {
    logger.warn({ err }, "[AIKeys] no se pudieron cargar las claves guardadas");
  }

  app.listen(port, (err: any) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, authDir: process.env.WA_AUTH_DIR || "data/.baileys-auth" }, "Server listening — WhatsApp auth persistente");
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
