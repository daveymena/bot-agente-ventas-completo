import app from "./app";
import { logger } from "./lib/logger";
import { runAutoMigrations } from "./lib/autoMigrate";
import { ensureDbReady } from "@workspace/db";

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

async function start() {
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

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, authDir: process.env.WA_AUTH_DIR || "data/.baileys-auth" }, "Server listening — WhatsApp auth persistente");
  });
}

start().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
