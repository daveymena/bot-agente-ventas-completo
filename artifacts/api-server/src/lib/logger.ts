import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // Usar pino-pretty siempre: en producción sin colores ANSI para EasyPanel
  // En desarrollo con colores para mejor legibilidad en terminal
  transport: {
    target: "pino-pretty",
    options: {
      colorize: process.env.NODE_ENV !== "production",
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
      ignore: "pid,hostname",
      singleLine: process.env.NODE_ENV === "production",
    },
  },
});
