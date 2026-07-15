import { Router, type IRouter } from "express";
import { z } from "zod";
import { tenantManager, type TenantRequest } from "../lib/tenantManager";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Validation schemas
const createTenantSchema = z.object({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
  brandName: z.string().min(1, "Brand name is required"),
  contactEmail: z.string().email().optional(),
  agentPersonality: z.enum(["professional", "casual", "enthusiastic", "consultative"]).optional(),
  settings: z.object({
    timezone: z.string().optional(),
    language: z.string().optional(),
    currency: z.string().optional(),
    autoRespond: z.boolean().optional(),
    workingHours: z.object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      days: z.array(z.number().min(0).max(6))
    }).optional()
  }).optional(),
  paymentMethods: z.object({
    mercadopago: z.object({
      accessToken: z.string(),
      enabled: z.boolean()
    }).optional(),
    paypal: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      mode: z.enum(["sandbox", "live"]),
      enabled: z.boolean()
    }).optional(),
    transfer: z.object({
      enabled: z.boolean(),
      accounts: z.array(z.object({
        type: z.string(),
        number: z.string(),
        name: z.string()
      }))
    }).optional()
  }).optional()
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  brandName: z.string().min(1).optional(),
  agentPersonality: z.enum(["professional", "casual", "enthusiastic", "consultative"]).optional(),
  agentPrompt: z.string().optional(),
  agentName: z.string().optional(),
  settings: z.object({
    timezone: z.string().optional(),
    language: z.string().optional(),
    currency: z.string().optional(),
    autoRespond: z.boolean().optional(),
    workingHours: z.object({
      enabled: z.boolean(),
      start: z.string(),
      end: z.string(),
      days: z.array(z.number().min(0).max(6))
    }).optional()
  }).optional(),
  paymentMethods: z.object({
    mercadopago: z.object({
      accessToken: z.string(),
      enabled: z.boolean()
    }).optional(),
    paypal: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      mode: z.enum(["sandbox", "live"]),
      enabled: z.boolean()
    }).optional(),
    transfer: z.object({
      enabled: z.boolean(),
      accounts: z.array(z.object({
        type: z.string(),
        number: z.string(),
        name: z.string()
      }))
    }).optional()
  }).optional(),
  brandColors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string()
  }).optional()
});

/**
 * Get current tenant information
 * GET /api/tenants/current
 */
router.get("/current", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    // Get tenant usage limits
    const limits = await tenantManager.checkTenantLimits(req.tenant.id);

    return res.json({
      tenant: req.tenant,
      usage: limits
    });

  } catch (error) {
    logger.error({ error }, "[Tenants] Failed to get current tenant");
    return res.status(500).json({ 
      error: "Failed to get tenant information" 
    });
  }
});

/**
 * Create a new tenant
 * POST /api/tenants
 */
router.post("/", async (req, res) => {
  try {
    const validatedData = createTenantSchema.parse(req.body);

    const newTenant = await tenantManager.createTenant(validatedData);

    if (!newTenant) {
      return res.status(400).json({ 
        error: "Failed to create tenant" 
      });
    }

    logger.info({ 
      tenantId: newTenant.id, 
      slug: newTenant.slug 
    }, "[Tenants] New tenant created");

    return res.status(201).json({ 
      tenant: newTenant 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid data", 
        details: error.errors 
      });
    }

    logger.error({ error }, "[Tenants] Failed to create tenant");
    return res.status(500).json({ 
      error: "Failed to create tenant" 
    });
  }
});

/**
 * Update current tenant
 * PUT /api/tenants/current
 */
router.put("/current", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

     const validatedData = updateTenantSchema.parse(req.body);

     const success = await tenantManager.updateTenant(req.tenant.id, validatedData as any);

    if (!success) {
      return res.status(400).json({ 
        error: "Failed to update tenant" 
      });
    }

    // Get updated tenant data
    const updatedTenant = await tenantManager.getTenantBySlug(req.tenant.slug);

    logger.info({ 
      tenantId: req.tenant.id, 
      updates: Object.keys(validatedData) 
    }, "[Tenants] Tenant updated");

    return res.json({ 
      tenant: updatedTenant 
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: "Invalid data", 
        details: error.errors 
      });
    }

    logger.error({ error, tenantId: req.tenant?.id }, "[Tenants] Failed to update tenant");
    return res.status(500).json({ 
      error: "Failed to update tenant" 
    });
  }
});

/**
 * Get tenant usage statistics
 * GET /api/tenants/current/usage
 */
router.get("/current/usage", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const usage = await tenantManager.checkTenantLimits(req.tenant.id);

    return res.json({ usage });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Tenants] Failed to get usage");
    return res.status(500).json({ 
      error: "Failed to get usage statistics" 
    });
  }
});

/**
 * Get tenant agent prompt
 * GET /api/tenants/current/agent-prompt
 */
router.get("/current/agent-prompt", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    const agentPrompt = tenantManager.getTenantAgentPrompt(req.tenant);

    return res.json({ 
      agentPrompt,
      agentName: req.tenant.agentName,
      personality: req.tenant.agentPersonality
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Tenants] Failed to get agent prompt");
    return res.status(500).json({ 
      error: "Failed to get agent prompt" 
    });
  }
});

/**
 * Clear tenant cache
 * POST /api/tenants/current/clear-cache
 */
router.post("/current/clear-cache", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant) {
      return res.status(404).json({ 
        error: "No tenant context found" 
      });
    }

    tenantManager.clearCache(req.tenant.slug);

    logger.info({ tenantId: req.tenant.id }, "[Tenants] Cache cleared");

    return res.json({ 
      message: "Cache cleared successfully" 
    });

  } catch (error) {
    logger.error({ error, tenantId: req.tenant?.id }, "[Tenants] Failed to clear cache");
    return res.status(500).json({ 
      error: "Failed to clear cache" 
    });
  }
});

/**
 * Activate a membership plan using a token/code
 * POST /api/tenants/current/activate-with-token
 */
router.post("/current/activate-with-token", async (req, res) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Lógica simple de tokens: PLAN-ACTIVAR-CODIGO
    // Ejemplo: STARTER-ACTIVAR-2024, PROFESSIONAL-ACTIVAR-7777, ENTERPRISE-ACTIVAR-9999
    const parts = token.toUpperCase().split("-");
    if (parts.length < 2) {
      return res.status(400).json({ error: "Token format invalid" });
    }

    const planId = parts[0].toLowerCase();
    
    // Validar que el plan existe
    const validPlans = ["starter", "professional", "enterprise", "elite", "pro"];
    if (!validPlans.includes(planId)) {
      return res.status(400).json({ error: "Invalid plan in token" });
    }

    // En un entorno real, verificaríamos el token en una base de datos.
    // Para cumplir con el requerimiento de "algo simple", aceptaremos cualquier token que siga el formato
    // pero registraremos la acción.
    
    const success = await tenantManager.updateTenant(tenant.id, { 
      plan: planId 
    });

    if (!success) {
      return res.status(400).json({ error: "Failed to update tenant plan" });
    }

    logger.info({ tenantId: tenant.id, planId, token }, "[Tenants] Plan activated via token");

    return res.json({ 
      success: true,
      message: `¡Felicidades! Tu plan ${planId.toUpperCase()} ha sido activado.`,
      plan: planId
    });

  } catch (error) {
    logger.error({ error }, "[Tenants] Token activation failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── ADMIN ENDPOINTS ────────────────────────────────────────────────────────────

/**
 * Admin: List all tenants with usage stats
 * GET /api/tenants/admin/list
 */
router.get("/admin/list", async (req: TenantRequest, res) => {
  try {
    // Only VIP admin can access
    if (!req.tenant || req.tenant.email !== "daveymena16@gmail.com") {
      return res.status(403).json({ error: "Acceso solo para administrador" });
    }

    const { db, tenants: tenantsTable, conversations, products } = await import("@workspace/db");
    const { sql, eq } = await import("drizzle-orm");

    const allTenants = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);

    // Enrich with usage counts
    const enriched = await Promise.all(allTenants.map(async (t) => {
      const [convCount] = await db.select({ count: sql<number>`count(*)` })
        .from(conversations).where(eq(conversations.tenantId, t.id));
      const [prodCount] = await db.select({ count: sql<number>`count(*)` })
        .from(products).where(eq(products.tenantId, t.id));

      return {
        id: t.id,
        name: t.name,
        email: t.email,
        brandName: t.brandName,
        slug: t.slug,
        plan: t.plan || "free",
        status: t.status || "inactive",
        createdAt: t.createdAt,
        conversationCount: Number(convCount?.count || 0),
        productCount: Number(prodCount?.count || 0),
      };
    }));

    return res.json({ tenants: enriched });
  } catch (error) {
    logger.error({ error }, "[Tenants Admin] List failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Admin: Perform action on a tenant
 * POST /api/tenants/admin/:id/action
 */
router.post("/admin/:id/action", async (req: TenantRequest, res) => {
  try {
    if (!req.tenant || req.tenant.email !== "daveymena16@gmail.com") {
      return res.status(403).json({ error: "Acceso solo para administrador" });
    }

    const tenantId = parseInt(req.params.id);
    const { action } = req.body;

    const { db, tenants: tenantsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");

    let update: any = { updatedAt: new Date().toISOString() };
    let message = "";

    switch (action) {
      case "activate":
        update.status = "active";
        message = "Tenant activado correctamente";
        break;
      case "suspend":
        update.status = "suspended";
        message = "Tenant suspendido";
        break;
      case "upgrade_enterprise":
        update.plan = "enterprise";
        update.status = "active";
        message = "Tenant actualizado a Enterprise";
        break;
      case "downgrade_free":
        update.plan = "free";
        message = "Tenant movido a Free";
        break;
      case "delete":
        await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
        return res.json({ success: true, message: "Tenant eliminado" });
      default:
        return res.status(400).json({ error: "Acción no reconocida" });
    }

    await db.update(tenantsTable).set(update).where(eq(tenantsTable.id, tenantId));
    // Clear cache
    tenantManager.clearCache();

    logger.info({ adminId: req.tenant.id, targetId: tenantId, action }, "[Tenants Admin] Action performed");
    return res.json({ success: true, message });

  } catch (error) {
    logger.error({ error }, "[Tenants Admin] Action failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;