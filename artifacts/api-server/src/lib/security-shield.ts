/**
 * ============================================================
 * SECURITY SHIELD - Blindaje de Información Sensible
 * ============================================================
 * Protege:
 * - Información interna de la arquitectura
 * - Detalles de creación y desarrollo
 * - APIs y endpoints
 * - Configuración técnica
 * - Datos de infraestructura
 *
 * SOLO visible para ADMIN
 */

import { logger } from "./logger";

export interface SensitiveData {
  apiKeys: Record<string, string>;
  architecture: Record<string, any>;
  internalEndpoints: string[];
  databaseConfig: Record<string, any>;
  creationInfo: Record<string, any>;
  devTools: string[];
}

export class SecurityShield {
  private ADMIN_ONLY_ROUTES = [
    "/api/internal/system",
    "/api/internal/architecture",
    "/api/internal/config",
    "/api/admin/sensitive",
    "/api/admin/system-info",
    "/api/admin/api-keys",
  ];

  private FORBIDDEN_ERROR_DETAILS = [
    "database",
    "connection",
    "api_key",
    "secret",
    "password",
    "token",
    "internal",
    "architecture",
    "version",
  ];

  /**
   * Validar que solo admin accede a datos sensibles
   */
  validateAdminAccess(userId: string, userRole: string, endpoint: string): boolean {
    // Verificar si es endpoint sensible
    const isSensitiveRoute = this.ADMIN_ONLY_ROUTES.some((route) =>
      endpoint.includes(route)
    );

    if (!isSensitiveRoute) {
      return true; // No es sensible, permitir
    }

    // Es sensible → Solo admin
    const isAdmin = userRole === "admin" || userRole === "superadmin";

    if (!isAdmin) {
      logger.warn(
        { userId, endpoint, role: userRole },
        "🚫 Acceso denegado a ruta sensible"
      );
      return false;
    }

    logger.info({ userId, endpoint }, "✅ Admin accedió a datos sensibles");
    return true;
  }

  /**
   * Ofuscar errores - No revelar detalles técnicos
   */
  sanitizeError(error: any): { message: string; code: string } {
    const errorMessage = error?.message || "Error interno";
    const errorCode = error?.code || "INTERNAL_ERROR";

    // Si contiene información sensible → Genérica
    const hasSensitiveInfo = this.FORBIDDEN_ERROR_DETAILS.some((word) =>
      errorMessage.toLowerCase().includes(word)
    );

    if (hasSensitiveInfo) {
      logger.error(
        { originalError: errorMessage },
        "🚫 Error contiene información sensible - Ofuscando"
      );

      return {
        message: "Algo salió mal. Por favor intenta de nuevo.",
        code: "GENERIC_ERROR",
      };
    }

    return {
      message: errorMessage,
      code: errorCode,
    };
  }

  /**
   * Proteger headers sensibles en responses
   */
  sanitizeResponseHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized = { ...headers };

    // Remover headers sensibles
    const sensitiveHeaders = [
      "x-powered-by",
      "server",
      "x-aspnet-version",
      "x-runtime-version",
      "x-api-version",
      "x-internal-trace-id",
    ];

    sensitiveHeaders.forEach((header) => {
      delete sanitized[header.toLowerCase()];
    });

    // Agregar headers de seguridad
    sanitized["x-content-type-options"] = "nosniff";
    sanitized["x-frame-options"] = "DENY";
    sanitized["x-xss-protection"] = "1; mode=block";
    sanitized["strict-transport-security"] = "max-age=31536000";

    return sanitized;
  }

  /**
   * Bloquear acceso a información de desarrollo/infraestructura
   */
  blockDevelopmentPaths(path: string): boolean {
    // "/config" quedó sacado de esta lista: el chequeo de abajo es un simple
    // .includes() (substring, no segmento exacto de path), así que bloqueaba
    // CUALQUIER ruta que tuviera "config" en el camino -- incluidas rutas de
    // negocio reales con ese nombre por convención REST (GET/PUT
    // /api/facebook/config, /api/woocommerce/config). Efecto real: la página
    // de Facebook nunca podía cargar sus credenciales guardadas al abrir
    // (racionalmente devolvía 403 "Acceso denegado" desde ESTE middleware,
    // antes de llegar siquiera a la ruta real), así que el estado de
    // "conectado" arrancaba en null/false siempre en cada carga, aunque las
    // credenciales estuvieran configuradas -- solo se corregía si el usuario
    // apretaba manualmente "Probar conexión" (que pega a /facebook/validate,
    // un path que no contiene "config" y por eso nunca fue bloqueado).
    // Paneles y endpoints de desarrollo: se bloquean como SEGMENTO del path.
    const panelesDeDesarrollo = [
      "/debug",
      "/admin",
      "/admin-panel",
      "/api/internal",
      "/metrics",
      "/health-detailed",
      "/logs",
      "/system",
      "/version",
      "/_internal",
    ];
    // Archivos que no son rutas y nunca deben servirse, esten donde esten:
    // aca si vale buscar la coincidencia en cualquier parte del camino.
    const archivosProhibidos = ["/.env", "/.git"];

    // Se compara por SEGMENTO, no por substring.
    //
    // Es el mismo bug que arriba ya se había pagado con "/config", y que se
    // resolvió sacando la palabra de la lista en vez de arreglar la
    // comparación -- así que volvió a morder con "/admin": `.includes()` hace
    // que CUALQUIER ruta que lleve "admin" en el camino quede bloqueada, y
    // `/api/tenants/admin/list` lo lleva. Efecto real, verificado en vivo el
    // 2026-08-19: el dueño de la plataforma entraba al panel de administración
    // siendo `isAdmin: true` y recibía 403 "Acceso denegado" desde ACÁ, sin
    // llegar nunca a la ruta. O sea que el dashboard de clientes era
    // inalcanzable para todos, siempre.
    //
    // Lo que esta lista quiere frenar son paneles de desarrollo colgando de la
    // raíz (`/admin`, `/debug`, `/metrics`), no rutas de negocio que usan esa
    // palabra por convención REST. Comparando el comienzo del path con el
    // segmento completo, `/admin` sigue bloqueado y `/api/tenants/admin/list`
    // pasa.
    const limpio = path.toLowerCase().split("?")[0]!.replace(/\/+$/, "");
    const isBlocked =
      panelesDeDesarrollo.some((b) => limpio === b || limpio.startsWith(b + "/")) ||
      archivosProhibidos.some((b) => limpio.includes(b));

    if (isBlocked) {
      logger.warn({ path }, "🚫 Acceso bloqueado a path restringido");
      return true;
    }

    return false;
  }

  /**
   * Genérico response para información no disponible
   */
  getGenericResponse(): {
    message: string;
    version: string;
    status: string;
  } {
    return {
      message: "Sistema disponible",
      version: "1.0", // Versión genérica, no real
      status: "operational",
    };
  }

  /**
   * Info REAL (solo para admin)
   */
  getSensitiveSystemInfo(userRole: string): SensitiveData | null {
    if (userRole !== "admin" && userRole !== "superadmin") {
      return null;
    }

    return {
      apiKeys: {
        facebook: process.env.FACEBOOK_APP_ID ? "***CONFIGURED***" : "NOT_SET",
        mercadopago: process.env.MERCADO_PAGO_ACCESS_TOKEN ? "***CONFIGURED***" : "NOT_SET",
        paypal: process.env.PAYPAL_MODE ? "***CONFIGURED***" : "NOT_SET",
        openai: process.env.OPENAI_API_KEY ? "***CONFIGURED***" : "NOT_SET",
      },
      architecture: {
        framework: "Express.js + TypeScript",
        database: "PostgreSQL + Drizzle ORM",
        cache: "Redis",
        messaging: "Bull Queue",
        auth: "JWT + Sessions",
      },
      internalEndpoints: [
        "POST /api/webhooks/mercadopago",
        "POST /api/webhooks/paypal",
        "POST /api/internal/process-payment",
        "GET /api/admin/system-metrics",
        "POST /api/admin/db-backup",
      ],
      databaseConfig: {
        host: process.env.DATABASE_HOST || "localhost",
        port: process.env.DATABASE_PORT || 5432,
        name: process.env.DATABASE_NAME || "agent_sales_bot",
        ssl: process.env.DATABASE_SSL === "true",
      },
      creationInfo: {
        created: "2024-01-15",
        creator: "Claude AI Architecture",
        maintainers: "Admin team only",
        publicInfo: "Closed source - NOT FOR PUBLIC",
      },
      devTools: [
        "TypeScript 5.9.2",
        "Vite 7.3.2",
        "Drizzle ORM 0.45.2",
        "React 19.1.0",
        "Tailwind CSS 4.1.14",
      ],
    };
  }

  /**
   * Middleware de bloqueo para rutas no autorizadas
   */
  async validateRequest(
    req: any,
    userRole?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const path = req.path || req.url;
    const userId = req.userId || "unknown";

    // 1. Bloquear paths de desarrollo
    if (this.blockDevelopmentPaths(path)) {
      return {
        allowed: false,
        reason: "Acceso denegado",
      };
    }

    // 2. Validar acceso a rutas sensibles
    if (!this.validateAdminAccess(userId, userRole || "user", path)) {
      return {
        allowed: false,
        reason: "Se requieren permisos de administrador",
      };
    }

    // 3. OK
    return {
      allowed: true,
    };
  }

  /**
   * Rate limiting para endpoints sensibles
   */
  getRateLimitConfig(path: string): { windowMs: number; maxRequests: number } {
    const isSensitive = this.ADMIN_ONLY_ROUTES.some((route) => path.includes(route));

    if (isSensitive) {
      return {
        windowMs: 15 * 60 * 1000, // 15 minutos
        maxRequests: 10, // Muy restrictivo
      };
    }

    return {
      windowMs: 15 * 60 * 1000,
      maxRequests: 100, // Normal
    };
  }

  /**
   * Logging seguro - No guardar datos sensibles
   */
  safeLog(action: string, data: any): void {
    const sanitized = { ...data };

    // Remover campos sensibles
    const sensitiveFields = [
      "password",
      "token",
      "apiKey",
      "secret",
      "authorization",
      "api_key",
    ];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "***REDACTED***";
      }
    });

    logger.info(sanitized, `🔐 ${action}`);
  }

  /**
   * Generar token de verificación para admin
   */
  generateAdminVerificationToken(adminId: string): string {
    // Token ofuscado - no identifica quién es
    const timestamp = Date.now();
    const hash = Buffer.from(`${adminId}-${timestamp}`).toString("base64");
    return `verify_${hash.substring(0, 32)}`;
  }

  /**
   * Status público (genérico)
   */
  getPublicStatus(): {
    status: "healthy" | "degraded" | "down";
    uptime: string;
    regions: string[];
  } {
    return {
      status: "healthy",
      uptime: "> 99.9%",
      regions: ["Primary"], // No revelar infraestructura
    };
  }
}

export const securityShield = new SecurityShield();
