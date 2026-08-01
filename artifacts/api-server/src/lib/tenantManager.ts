// @ts-nocheck
import { eq, and, sql } from "drizzle-orm";
import { db, tenants, conversations, leads, products, productCategories } from "@workspace/db";
import { logger } from "./logger";
import { dbNow } from "./date-utils";
import { decryptSecret } from "./credentials-vault";
import type { Request, Response, NextFunction } from "express";

// Tenant Context Types
export interface TenantContext {
  id: number;
  slug: string;
  name: string;
  email: string;
  // Dueño de la plataforma: ve y administra TODOS los tenants, no solo el
  // propio. Antes esto se chequeaba comparando req.tenant.email (un campo
  // que TenantContext nunca poblaba) contra un email hardcodeado -- esa
  // comparación era siempre `undefined !== "..."`, así que la ruta de admin
  // (/tenants/admin/:id/action) rechazaba a TODOS, incluido el admin real.
  isAdmin: boolean;
  brandName: string;
  agentPersonality: string;
  agentPrompt: string | null;
  agentName: string;
  settings: {
    timezone: string;
    language: string;
    currency: string;
    autoRespond: boolean;
    workingHours?: {
      enabled: boolean;
      start: string;
      end: string;
      days: number[];
    };
  };
  paymentMethods: {
    mercadopago?: {
      accessToken: string;
      enabled: boolean;
    };
    paypal?: {
      clientId: string;
      clientSecret: string;
      mode: "sandbox" | "live";
      enabled: boolean;
    };
    transfer?: {
      enabled: boolean;
      accounts: Array<{
        type: string;
        number: string;
        name: string;
      }>;
    };
  };
  facebook?: {
    accessToken?: string;
    pixelId?: string;
    catalogId?: string;
    pageId?: string;
    adAccountId?: string;
    appId?: string;
    appSecret?: string;
    messengerPageToken?: string;
    messengerVerifyToken?: string;
    pageName?: string;
    /** Permisos de Facebook sobre la página (CREATE_CONTENT = puede publicar) */
    tasks?: string[];
    connectedAt?: string;
  };
  limits: {
    maxConversations: number;
    maxProducts: number;
    maxAgents: number;
    maxMonthlyMessages: number;
    apiCallsPerMinute: number;
  };
  brandColors?: {
    primary: string;
    secondary: string;
    accent: string;
  };
  plan: string;
}

export interface TenantRequest extends Request {
  tenant?: TenantContext;
}

// Default tenant configuration for single-tenant mode
const DEFAULT_TENANT: TenantContext = {
  id: 1,
  slug: "default",
  name: "TecnoVariedades",
  email: "",
  // Placeholder sin sesión real (usado por procesos internos como WhatsApp/
  // AdStrategist cuando no hay tenant resuelto) -- nunca debe ser admin.
  isAdmin: false,
  brandName: "TecnoVariedades",
  agentPersonality: "professional",
  agentPrompt: null,
  agentName: "Asistente Virtual",
  settings: {
    timezone: "America/Bogota",
    language: "es",
    currency: "COP",
    autoRespond: true,
    workingHours: {
      enabled: false,
      start: "09:00",
      end: "18:00",
      days: [1, 2, 3, 4, 5] // Monday to Friday
    }
  },
  paymentMethods: {
    mercadopago: {
      accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN || "",
      enabled: !!process.env.MERCADO_PAGO_ACCESS_TOKEN
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || "",
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || "",
      mode: (process.env.PAYPAL_MODE as "sandbox" | "live") || "live",
      enabled: !!process.env.PAYPAL_CLIENT_ID
    },
    transfer: {
      enabled: true,
      accounts: [
        {
          type: "Nequi",
          number: process.env.TRANSFER_NUMBER || "3136174267",
          name: process.env.TRANSFER_NAME || "Duvier Mena"
        },
        {
          type: "Daviplata", 
          number: process.env.TRANSFER_NUMBER || "3136174267",
          name: process.env.TRANSFER_NAME || "Duvier Mena"
        }
      ]
    }
  },
  limits: {
    maxConversations: 10000,
    maxProducts: 1000,
    maxAgents: 10,
    maxMonthlyMessages: 50000,
    apiCallsPerMinute: 100
  },
  brandColors: {
    primary: "#10b981",
    secondary: "#3b82f6", 
    accent: "#f59e0b"
  }
};

// Tenant Manager Class
/**
 * Extrae las credenciales de Facebook de tenants.metadata.
 * La metadata puede venir como objeto o como string JSON según el motor de BD
 * (SQLite la guarda serializada), por eso se contemplan ambos casos.
 */
function parseFacebookMeta(metadata: unknown): TenantContext["facebook"] {
  if (!metadata) return undefined;
  try {
    const meta = typeof metadata === "string" ? JSON.parse(metadata) : (metadata as any);
    const fb = meta?.facebook;
    if (!fb) return undefined;
    // accessToken/appSecret/messengerPageToken se guardan encriptados (ver
    // credentials-vault.ts) -- este es el único punto donde se arma
    // TenantContext.facebook, así que desencriptar acá alcanza para que
    // FacebookService y compañía sigan recibiendo el texto plano como
    // siempre, sin tocar cada llamador. decryptSecret() devuelve el valor
    // tal cual si es legacy en texto plano (sin el prefijo enc:v1:).
    return {
      ...fb,
      accessToken: decryptSecret(fb.accessToken),
      appSecret: decryptSecret(fb.appSecret),
      messengerPageToken: decryptSecret(fb.messengerPageToken),
    };
  } catch {
    return undefined;
  }
}

export class TenantManager {
  private tenantCache: Map<string, TenantContext> = new Map();
  // (parseFacebookMeta se define fuera de la clase, al final del archivo)
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Gets tenant by slug with caching
   */
  async getTenantBySlug(slug: string): Promise<TenantContext | null> {
    try {
      // Check cache first
      const cached = this.tenantCache.get(slug);
      const expiry = this.cacheExpiry.get(slug);
      
      if (cached && expiry && Date.now() < expiry) {
        return cached;
      }

      // Query database
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);

      if (!tenant) {
        return null;
      }

      // Convert to TenantContext
      const tenantContext: TenantContext = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        email: tenant.email,
        isAdmin: !!tenant.isAdmin,
        brandName: tenant.brandName,
        agentPersonality: tenant.agentPersonality,
        agentPrompt: tenant.agentPrompt,
        agentName: tenant.agentName,
        settings: tenant.settings || DEFAULT_TENANT.settings,
        paymentMethods: tenant.paymentMethods || DEFAULT_TENANT.paymentMethods,
        limits: tenant.limits || DEFAULT_TENANT.limits,
        brandColors: tenant.brandColors || DEFAULT_TENANT.brandColors,
        plan: tenant.plan || "basic",
        // Credenciales de Facebook guardadas por tenant. Estaban declaradas en
        // TenantContext pero nunca se leían de metadata, así que facebook
        // quedaba undefined y TODO caía al .env global: en multi-cuenta eso
        // significaba que cada tenant usaba la página del dueño del servidor.
        facebook: parseFacebookMeta(tenant.metadata),
      };

      // Cache the result
      this.tenantCache.set(slug, tenantContext);
      this.cacheExpiry.set(slug, Date.now() + this.CACHE_TTL);

      return tenantContext;

    } catch (error) {
      logger.error({ error, slug }, "[TenantManager] Failed to get tenant by slug");
      return null;
    }
  }

  /**
   * Gets tenant by ID with caching
   */
  async getTenantById(id: number): Promise<TenantContext | null> {
    try {
      const cacheKey = `id:${id}`;
      // Check cache first
      const cached = this.tenantCache.get(cacheKey);
      const expiry = this.cacheExpiry.get(cacheKey);
      
      if (cached && expiry && Date.now() < expiry) {
        return cached;
      }

      // Query database
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, id))
        .limit(1);

      if (!tenant) {
        return null;
      }

      // Convert to TenantContext
      const tenantContext: TenantContext = {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        email: tenant.email,
        isAdmin: !!tenant.isAdmin,
        brandName: tenant.brandName,
        agentPersonality: tenant.agentPersonality,
        agentPrompt: tenant.agentPrompt,
        agentName: tenant.agentName,
        settings: tenant.settings || DEFAULT_TENANT.settings,
        paymentMethods: tenant.paymentMethods || DEFAULT_TENANT.paymentMethods,
        limits: tenant.limits || DEFAULT_TENANT.limits,
        brandColors: tenant.brandColors || DEFAULT_TENANT.brandColors,
        plan: tenant.plan || "basic",
        // Credenciales de Facebook guardadas por tenant. Estaban declaradas en
        // TenantContext pero nunca se leían de metadata, así que facebook
        // quedaba undefined y TODO caía al .env global: en multi-cuenta eso
        // significaba que cada tenant usaba la página del dueño del servidor.
        facebook: parseFacebookMeta(tenant.metadata),
      };

      // Cache the result
      this.tenantCache.set(cacheKey, tenantContext);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_TTL);

      return tenantContext;

    } catch (error) {
      logger.error({ error, id }, "[TenantManager] Failed to get tenant by ID");
      return null;
    }
  }

  /**
   * Gets tenant by domain
   */
  async getTenantByDomain(domain: string): Promise<TenantContext | null> {
    try {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.domain, domain))
        .limit(1);

      if (!tenant) {
        return null;
      }

      return this.getTenantBySlug(tenant.slug);

    } catch (error) {
      logger.error({ error, domain }, "[TenantManager] Failed to get tenant by domain");
      return null;
    }
  }

  /**
   * Creates a new tenant
   */
  async createTenant(tenantData: {
    name: string;
    slug: string;
    brandName: string;
    contactEmail?: string;
    agentPersonality?: string;
    settings?: Partial<TenantContext['settings']>;
    paymentMethods?: Partial<TenantContext['paymentMethods']>;
  }): Promise<TenantContext | null> {
     try {
       const [newTenant] = await db
         .insert(tenants)
         .values({
           name: tenantData.name,
           slug: tenantData.slug,
           email: tenantData.contactEmail || tenantData.name + "@example.com",
           brandName: tenantData.brandName,
           agentPersonality: tenantData.agentPersonality || "professional",
           agentName: "Asistente Virtual",
           settings: {
             ...DEFAULT_TENANT.settings,
             ...tenantData.settings
           },
           paymentMethods: {
             ...DEFAULT_TENANT.paymentMethods,
             ...tenantData.paymentMethods
           },
           limits: DEFAULT_TENANT.limits,
           brandColors: DEFAULT_TENANT.brandColors,
           status: "trial",
           plan: "basic"
         })
         .returning();

      if (!newTenant) {
        throw new Error("Failed to create tenant");
      }

      logger.info({ 
        tenantId: newTenant.id, 
        slug: newTenant.slug,
        name: newTenant.name 
      }, "[TenantManager] New tenant created");

      return this.getTenantBySlug(newTenant.slug);

    } catch (error) {
      logger.error({ error, tenantData }, "[TenantManager] Failed to create tenant");
      return null;
    }
  }

  /**
   * Updates tenant configuration
   */
  async updateTenant(tenantId: number, updates: Partial<{
    name: string;
    brandName: string;
    agentPersonality: string;
    agentPrompt: string;
    agentName: string;
    settings: TenantContext['settings'];
    paymentMethods: TenantContext['paymentMethods'];
    brandColors: TenantContext['brandColors'];
  }>): Promise<boolean> {
    try {
      await db
        .update(tenants)
        .set({
          ...updates,
          updatedAt: dbNow()
        })
        .where(eq(tenants.id, tenantId));

      // Clear cache for this tenant
      const tenant = await db
        .select({ slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (tenant[0]) {
        this.tenantCache.delete(tenant[0].slug);
        this.cacheExpiry.delete(tenant[0].slug);
      }

      logger.info({ tenantId, updates }, "[TenantManager] Tenant updated");
      return true;

    } catch (error) {
      logger.error({ error, tenantId, updates }, "[TenantManager] Failed to update tenant");
      return false;
    }
  }

  /**
   * Gets tenant-specific agent prompt
   */
  getTenantAgentPrompt(tenant: TenantContext): string {
    const basePrompt = `Eres ${tenant.agentName}, el asistente virtual de ${tenant.brandName}.`;
    
    const personalityPrompts = {
      professional: "Mantén un tono profesional, amigable y orientado a resultados.",
      casual: "Usa un tono casual, relajado y cercano con los clientes.",
      enthusiastic: "Sé entusiasta, energético y motivador en tus respuestas.",
      consultative: "Actúa como un consultor experto, haciendo preguntas estratégicas."
    };

    const personalityText = personalityPrompts[tenant.agentPersonality as keyof typeof personalityPrompts] 
      || personalityPrompts.professional;

    const workingHoursText = tenant.settings.workingHours?.enabled 
      ? `Nuestro horario de atención es de ${tenant.settings.workingHours.start} a ${tenant.settings.workingHours.end}.`
      : "";

    const customPrompt = tenant.agentPrompt || "";

    return [basePrompt, personalityText, workingHoursText, customPrompt]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * Checks if tenant has reached usage limits
   */
  async checkTenantLimits(tenantId: number): Promise<{
    conversations: { current: number; limit: number; exceeded: boolean };
    products: { current: number; limit: number; exceeded: boolean };
    monthlyMessages: { current: number; limit: number; exceeded: boolean };
  }> {
    try {
      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant[0]) {
        throw new Error("Tenant not found");
      }

      const limits = tenant[0].limits || DEFAULT_TENANT.limits;

      // Count current usage
      const [conversationCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversations)
        .where(eq(conversations.tenantId, tenantId));

      const [productCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(products)
        .where(eq(products.tenantId, tenantId));

      // For monthly messages, we'd need to implement message counting
      // For now, we'll use a placeholder
      const monthlyMessages = 0;

      return {
        conversations: {
          current: conversationCount?.count || 0,
          limit: limits.maxConversations,
          exceeded: (conversationCount?.count || 0) >= limits.maxConversations
        },
        products: {
          current: productCount?.count || 0,
          limit: limits.maxProducts,
          exceeded: (productCount?.count || 0) >= limits.maxProducts
        },
        monthlyMessages: {
          current: monthlyMessages,
          limit: limits.maxMonthlyMessages,
          exceeded: monthlyMessages >= limits.maxMonthlyMessages
        }
      };

    } catch (error) {
      logger.error({ error, tenantId }, "[TenantManager] Failed to check tenant limits");
      throw error;
    }
  }

  /**
   * Gets default tenant for single-tenant mode
   */
  getDefaultTenant(): TenantContext {
    return DEFAULT_TENANT;
  }

  /**
   * Clears tenant cache
   */
  clearCache(slug?: string): void {
    if (slug) {
      this.tenantCache.delete(slug);
      this.cacheExpiry.delete(slug);
    } else {
      this.tenantCache.clear();
      this.cacheExpiry.clear();
    }
  }
}

// Singleton instance
export const tenantManager = new TenantManager();

// Middleware for tenant resolution
export function resolveTenant() {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    try {
      let tenant: TenantContext | null = null;

      // Method 1: Check for tenant slug in headers (for API calls)
      const tenantSlug = req.headers['x-tenant-slug'] as string;
      if (tenantSlug) {
        tenant = await tenantManager.getTenantBySlug(tenantSlug);
      }

      // Method 2: Check for tenant in subdomain (e.g., tenant1.app.com)
      if (!tenant) {
        const host = req.headers.host;
        if (host && host.includes('.')) {
          const subdomain = host.split('.')[0];
          if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
            tenant = await tenantManager.getTenantBySlug(subdomain);
          }
        }
      }

      // Method 3: Check for custom domain
      if (!tenant) {
        const host = req.headers.host;
        if (host) {
          tenant = await tenantManager.getTenantByDomain(host);
        }
      }

      // Method 4: Check for session cookie
      // IMPORTANTE: usar signedCookies, no cookies. La cookie tenant_id es la
      // única prueba de sesión del sistema — sin la firma (cookie-parser +
      // COOKIE_SECRET), cualquiera podría forjar `tenant_id=<numero>` y
      // autenticarse como cualquier tenant sin contraseña.
      if (!tenant) {
        const tenantId = req.signedCookies?.tenant_id;
        if (tenantId) {
          tenant = await tenantManager.getTenantById(Number(tenantId));
        }
      }

      // EXCEPCIÓN TOTAL: No bloquear rutas de autenticación, login o registro
      const isAuthPath = req.path.includes("/auth") || 
                         req.path.includes("/login") || 
                         req.path.includes("/register") ||
                         req.path === "/api/auth/login" ||
                         req.path === "/api/auth/register" ||
                         req.path === "/api/auth/me";

      if (isAuthPath) {
        return next();
      }

      // Method 5: Reject if no tenant resolved
      if (!tenant) {
        return res.status(401).json({ message: "No session found. Please login." });
      }

      // Attach tenant to request
      req.tenant = tenant;

      logger.debug({ 
        tenantId: tenant.id, 
        tenantSlug: tenant.slug,
        method: req.method,
        path: req.path 
      }, "[TenantManager] Tenant resolved for request");

      next();

    } catch (error) {
      logger.error({ error }, "[TenantManager] Failed to resolve tenant");
      return res.status(401).json({ message: "Session error. Please login again." });
    }
  };
}

/**
 * Middleware: exige que el tenant autenticado sea administrador de la
 * plataforma (tenants.is_admin). Debe usarse DESPUÉS de resolveTenant().
 * Reemplaza el patrón anterior de comparar req.tenant.email contra un email
 * hardcodeado -- además de estar hardcodeado, esa comparación nunca
 * funcionó porque TenantContext no incluía email hasta ahora.
 */
export function requireAdmin() {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    if (!req.tenant?.isAdmin) {
      return res.status(403).json({ message: "Acceso solo para administrador de la plataforma" });
    }
    next();
  };
}

// Utility functions for tenant-aware database operations
export function withTenantFilter<T extends { tenantId: any }>(
  query: any,
  tenantId: number
) {
  return query.where(eq(query.tenantId, tenantId));
}

export function addTenantToInsert<T extends Record<string, any>>(
  data: T,
  tenantId: number
): T & { tenantId: number } {
  return { ...data, tenantId };
}

// Export types
export type { TenantRequest };