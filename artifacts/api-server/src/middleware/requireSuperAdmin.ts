import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

// Único correo con acceso a las herramientas de arquitecto (SQL crudo,
// lectura/escritura de código, memoria del arquitecto). Se centraliza aquí
// en vez de repetir la comparación en cada ruta — mismo criterio que ya se
// usaba de forma dispersa en middleware/saasValidation.ts y routes/tenants.ts.
export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "daveymena16@gmail.com";

/**
 * Bloquea cualquier acceso a rutas de arquitecto (architect-tools,
 * architect-memory, code-agent) a menos que el tenant autenticado sea el
 * superadmin de la plataforma. Sin esto, cualquier cliente del SaaS podía
 * ejecutar SQL crudo, leer/escribir código y ver datos de otros tenants.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const tenant = (req as any).tenant;
  if (!tenant || tenant.email !== SUPER_ADMIN_EMAIL) {
    logger.warn(
      { path: req.path, tenantId: tenant?.id, tenantEmail: tenant?.email },
      "[requireSuperAdmin] Acceso denegado a ruta de arquitecto"
    );
    return res.status(403).json({ error: "No autorizado" });
  }
  return next();
}
