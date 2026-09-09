import { Response } from "express";
import { ZodError } from "zod";
import { ERROR_CODES, ERROR_MESSAGES, ERROR_HTTP_STATUS, ErrorCode } from "./error-codes";

export { ERROR_CODES, ERROR_MESSAGES, ERROR_HTTP_STATUS };
export type { ErrorCode };

/**
 * Interfaz para errores personalizados de la aplicación
 */
export interface AppError {
  code: ErrorCode;
  message?: string;
  details?: Record<string, any>;
  statusCode?: number;
}

/**
 * Clase para errores personalizados de la aplicación
 */
export class ApplicationError extends Error implements AppError {
  code: ErrorCode;
  details?: Record<string, any>;
  statusCode: number;

  constructor(code: ErrorCode, details?: Record<string, any>) {
    const message = ERROR_MESSAGES[code];
    super(message);
    this.code = code;
    this.details = details;
    this.statusCode = ERROR_HTTP_STATUS[code];
    this.name = "ApplicationError";
  }
}

/**
 * Envía una respuesta de error estandarizada
 */
export function sendError(
  res: Response,
  code: ErrorCode,
  details?: Record<string, any> | number | string,
  customMessage?: string
) {
  const statusCode = ERROR_HTTP_STATUS[code];
  const message = customMessage || ERROR_MESSAGES[code];

  const response: any = {
    error: message,
    code,
  };

  // Varios callers pasan el status HTTP numérico donde va `details`
  // (sendError(res, CODE, 401)). Ese número no es metadata útil: se ignora.
  if (details && typeof details === "object") {
    response.details = details;
  }

  // En desarrollo, incluir información adicional
  if (process.env.NODE_ENV === "development") {
    response.timestamp = new Date().toISOString();
  }

  return res.status(statusCode).json(response);
}

/**
 * Maneja errores de validación de Zod
 */
export function handleZodError(res: Response, error: ZodError) {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));

  return res.status(400).json({
    error: ERROR_MESSAGES[ERROR_CODES.VALIDATION_INVALID_DATA],
    code: ERROR_CODES.VALIDATION_INVALID_DATA,
    details: { issues },
  });
}

/**
 * Middleware para manejo global de errores
 */
export function errorHandler(
  err: unknown,
  req: any,
  res: Response,
  _next: any
) {
  // Errores de aplicación personalizados
  if (err instanceof ApplicationError) {
    return sendError(res, err.code, err.details);
  }

  // Errores de validación de Zod
  if (err instanceof ZodError) {
    return handleZodError(res, err);
  }

  // Errores genéricos
  if (err instanceof Error) {
    // El STACK va al log del servidor, nunca al cliente.
    //
    // Antes se devolvia `stack` completo en el JSON de cualquier 500: rutas
    // absolutas del servidor (/app/node_modules/.pnpm/drizzle-orm@0.45.2/...),
    // nombres de archivos internos y la estructura del proyecto. Eso le regala
    // a cualquiera el mapa para buscar vulnerabilidades conocidas de cada
    // version, y no le sirve de nada al usuario. Visto en vivo el 2026-08-19:
    // el chat de Marketing devolvia el stack de Drizzle entero.
    //
    // El `message` SI se conserva: es lo unico accionable, y el escudo de
    // seguridad (security-shield.ts) ya ofusca los que contienen datos
    // sensibles antes de llegar aca.
    console.error("Unhandled error:", err);
    const requestId = req.id || req.headers?.["x-request-id"];
    return res.status(500).json({
      error: ERROR_MESSAGES[ERROR_CODES.INTERNAL_SERVER_ERROR],
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      requestId,
      // En desarrollo si conviene tenerlo a mano.
      ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
    });
  }

  // Error desconocido
  req.log?.error({ err }, "Unknown error");
  return res.status(500).json({
    error: ERROR_MESSAGES[ERROR_CODES.INTERNAL_SERVER_ERROR],
    code: ERROR_CODES.INTERNAL_SERVER_ERROR,
  });
}

/**
 * Wrapper para funciones async en rutas Express
 * Captura errores y los pasa al middleware de error
 */
export function asyncHandler(
  fn: (req: any, res: Response, next: any) => Promise<any>
) {
  return (req: any, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
