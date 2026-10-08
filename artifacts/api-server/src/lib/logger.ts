import pino from "pino";
import { redactarSecretos } from "./secretos";

/**
 * Campos que NUNCA se imprimen, se llamen como se llamen en el objeto del log.
 * Antes solo se tapaban los headers: `logger.info({ token }, ...)` (activación
 * de cuenta, webhooks) dejaba el token entero en el log de EasyPanel.
 */
const CAMPOS_SECRETOS = [
  "token", "accessToken", "userAccessToken", "pageAccessToken", "refreshToken", "botToken",
  "apiKey", "api_key", "secret", "clientSecret", "appSecret", "consumerKey", "consumerSecret",
  "password", "pass", "passwordHash", "smtpPassword", "githubToken", "copilotSessionToken",
  "authorization", "Authorization", "cookie",
];

const RUTAS_REDACTADAS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers['set-cookie']",
  ...CAMPOS_SECRETOS,
  ...CAMPOS_SECRETOS.map((c) => `*.${c}`),
];

/** Textos sueltos del log (mensajes, err.message, stacks) sin URLs con clave ni tokens. */
function limpiarArgumento(arg: unknown): unknown {
  if (typeof arg === "string") return redactarSecretos(arg);
  if (arg && typeof arg === "object" && !Array.isArray(arg)) {
    let copia: Record<string, unknown> | null = null;
    for (const [k, v] of Object.entries(arg as Record<string, unknown>)) {
      if (typeof v === "string") {
        const limpio = redactarSecretos(v);
        if (limpio !== v) {
          copia = copia || { ...(arg as Record<string, unknown>) };
          copia[k] = limpio;
        }
      }
    }
    return copia || arg;
  }
  return arg;
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: RUTAS_REDACTADAS, censor: "[oculto]" },
  hooks: {
    logMethod(args, method) {
      return method.apply(this, args.map(limpiarArgumento) as any);
    },
  },
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
