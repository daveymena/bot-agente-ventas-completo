import { Request, Response, NextFunction } from "express";
import { ApplicationError, ERROR_CODES } from "./error-handler";

/**
 * Almacenamiento en memoria para rate limiting
 * En producción, usar Redis
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Limpia entradas expiradas del store
 */
function cleanupStore() {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Middleware de rate limiting
 * @param windowMs - Ventana de tiempo en milisegundos
 * @param maxRequests - Máximo de solicitudes por ventana
 * @param keyGenerator - Función para generar la clave (por defecto IP)
 */
export function rateLimit(
  windowMs: number = 60000, // 1 minuto por defecto
  maxRequests: number = 5, // 5 solicitudes por defecto
  keyGenerator?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Limpiar store cada 10 minutos
    if (Math.random() < 0.01) {
      cleanupStore();
    }

    // Generar clave
    const key = keyGenerator
      ? keyGenerator(req)
      : req.ip || req.socket.remoteAddress || "unknown";

    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || record.resetTime < now) {
      // Nueva ventana
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    // Incrementar contador
    record.count++;

    if (record.count > maxRequests) {
      throw new ApplicationError(ERROR_CODES.AUTH_RATE_LIMIT_EXCEEDED, {
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    // Agregar headers informativos
    res.set("X-RateLimit-Limit", maxRequests.toString());
    res.set("X-RateLimit-Remaining", (maxRequests - record.count).toString());
    res.set(
      "X-RateLimit-Reset",
      new Date(record.resetTime).toISOString()
    );

    next();
  };
}

/**
 * Rate limiter específico para verificación de códigos
 * Máximo 5 intentos por 15 minutos
 */
export const verificationCodeLimiter = rateLimit(
  15 * 60 * 1000, // 15 minutos
  5, // 5 intentos
  (req) => {
    // Usar email como clave si está disponible
    const email = req.body?.email || req.ip || "unknown";
    return `verify-code:${email}`;
  }
);

/**
 * Rate limiter específico para login
 * Máximo 10 intentos por 15 minutos
 */
export const loginLimiter = rateLimit(
  15 * 60 * 1000, // 15 minutos
  10, // 10 intentos
  (req) => {
    // Usar email como clave si está disponible
    const email = req.body?.email || req.ip || "unknown";
    return `login:${email}`;
  }
);

/**
 * Rate limiter específico para registro
 * Máximo 3 intentos por hora
 */
export const registerLimiter = rateLimit(
  60 * 60 * 1000, // 1 hora
  3, // 3 intentos
  (req) => {
    // Usar email como clave si está disponible
    const email = req.body?.email || req.ip || "unknown";
    return `register:${email}`;
  }
);

/**
 * Rate limiter específico para solicitud de código de recuperación
 * Máximo 3 intentos por hora
 */
export const passwordResetLimiter = rateLimit(
  60 * 60 * 1000, // 1 hora
  3, // 3 intentos
  (req) => {
    // Usar email como clave si está disponible
    const email = req.body?.email || req.ip || "unknown";
    return `password-reset:${email}`;
  }
);

/**
 * Rate limiter específico para 2FA
 * Máximo 5 intentos por 15 minutos
 */
export const twoFactorLimiter = rateLimit(
  15 * 60 * 1000, // 15 minutos
  5, // 5 intentos
  (req) => {
    // Usar email como clave si está disponible
    const email = req.body?.email || req.ip || "unknown";
    return `2fa:${email}`;
  }
);
