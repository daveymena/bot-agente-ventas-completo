import type { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const unauthorized = (m = "Iniciá sesión para continuar.") => new HttpError(401, m);
export const forbidden = (m = "No tenés permiso para esto.") => new HttpError(403, m);
export const notFound = (m = "No encontrado.") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);
export const paymentRequired = (m: string, d?: unknown) => new HttpError(402, m, d);

/** Envuelve un handler async para que los errores lleguen al middleware de errores (Express 5 ya lo hace, pero esto tipa mejor). */
export function h(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      throw badRequest("Datos inválidos", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    throw e;
  }
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details ?? null });
    return;
  }
  const anyErr = err as any;
  if (anyErr?.name === "MulterError") {
    res.status(400).json({ error: anyErr.code === "LIMIT_FILE_SIZE" ? "El archivo supera el tamaño máximo permitido." : `Error de carga: ${anyErr.message}` });
    return;
  }
  if (anyErr?.type === "entity.too.large") {
    res.status(413).json({ error: "El cuerpo de la petición es demasiado grande." });
    return;
  }
  console.error("[stock] error no controlado:", err);
  res.status(500).json({ error: "Error interno. Intentalo de nuevo." });
}

export function pageParams(q: Record<string, unknown>, defaults = { perPage: 40, max: 100 }) {
  const page = Math.max(1, Number(q.page) || 1);
  const perPage = Math.min(defaults.max, Math.max(1, Number(q.perPage) || defaults.perPage));
  return { page, perPage, offset: (page - 1) * perPage };
}
