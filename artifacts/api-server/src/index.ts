import app from "./app";
import { logger } from "./lib/logger";

// Evitar que errores no manejados de Baileys tumben el servidor
process.on("unhandledRejection", (reason) => {
  logger.warn({ err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason }, "[Global] Unhandled Rejection - ignorada para evitar crash");
});
process.on("uncaughtException", (error) => {
  logger.error({ err: { message: error.message, stack: error.stack } }, "[Global] Uncaught Exception - recuperando...");
});

let port = Number(process.env["PORT"] || "3002");
const host = process.env["HOST"] || "0.0.0.0";

// Fallback if parsing fails (e.g. if it's a shell string like ${PORT:-3002})
if (Number.isNaN(port) || port <= 0) {
  logger.warn({ rawPort: process.env["PORT"] }, "Invalid PORT in env, falling back to 3002");
  port = 3002;
}

app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, host }, "Server listening");
});
 


