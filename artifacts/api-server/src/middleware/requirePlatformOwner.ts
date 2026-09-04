/**
 * Solo el DUEÑO DE LA PLATAFORMA puede tocar la configuración global.
 *
 * Encontrado en la auditoría previa al lanzamiento (2026-08-22): las rutas de
 * `/api/settings` operan sobre la fila ÚNICA y global de `settings` --
 * `aiProvider`, el token de GitHub, los proveedores de IA-- y estaban abiertas
 * a cualquier cliente con sesión. O sea que un cliente cualquiera podía:
 *
 *   - cambiarle el proveedor de IA a TODA la plataforma (PATCH /api/settings),
 *   - sobrescribir el token de GitHub del dueño (POST /copilot-token),
 *   - agregar o pisar claves de proveedores para todos (POST /add-provider).
 *
 * No hace falta ser malicioso para romperlo: alcanza con que un cliente
 * "pruebe" su propia clave desde su panel.
 *
 * Por qué no alcanza con `isAdmin`: en este deploy el tenant del dueño lo tiene
 * en false (verificado en producción), así que se identifica también por
 * PLATFORM_TENANT_ID, igual que en routes/ai-catalog.ts. Mismo criterio en los
 * dos lados para que no se contradigan.
 */
import type { Response, NextFunction } from "express";
import type { TenantRequest } from "../lib/tenantManager";

export function esDuenoDeLaPlataforma(req: TenantRequest): boolean {
  if (req.tenant?.isAdmin) return true;
  const dueno = Number(process.env.PLATFORM_TENANT_ID || 1);
  return !!req.tenant?.id && req.tenant.id === dueno;
}

export function requirePlatformOwner() {
  return (req: TenantRequest, res: Response, next: NextFunction): void => {
    if (!req.tenant?.id) {
      res.status(401).json({ message: "No autorizado" });
      return;
    }
    if (!esDuenoDeLaPlataforma(req)) {
      // El mensaje explica el porqué: esto no es un error del cliente, es una
      // configuración que no le corresponde. Sin explicación, el que la ve
      // cree que la app se rompió.
      res.status(403).json({
        message:
          "Esta configuración es de la plataforma, no de tu negocio. " +
          "Tus claves y tus ajustes se administran desde Configuración de tu cuenta.",
      });
      return;
    }
    next();
  };
}
