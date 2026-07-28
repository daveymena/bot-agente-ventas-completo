import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { dbNow } from "../lib/date-utils";

const router = Router();

// Schema de validación para actualización de marca
const updateBrandingSchema = z.object({
  brandName: z.string().min(1).optional(),
  brandLogo: z.string().url().optional().nullable(),
  brandColors: z.object({
    primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    background: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    foreground: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    muted: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  }).optional(),
  brandTheme: z.object({
    mode: z.enum(["light", "dark", "auto"]),
    font: z.string(),
    borderRadius: z.enum(["none", "sm", "md", "lg", "xl"]),
    customCSS: z.string().optional(),
  }).optional(),
  brandSocial: z.object({
    website: z.string().url().optional(),
    facebook: z.string().url().optional(),
    instagram: z.string().url().optional(),
    twitter: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    whatsapp: z.string().optional(),
  }).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  supportEmail: z.string().email().optional(),
});

// GET - Obtener configuración de marca actual
router.get("/", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const [tenant] = await db
      .select({
        brandName: tenants.brandName,
        brandLogo: tenants.brandLogo,
        brandColors: tenants.brandColors,
        brandTheme: tenants.brandTheme,
        brandSocial: tenants.brandSocial,
        contactEmail: tenants.contactEmail,
        contactPhone: tenants.contactPhone,
        supportEmail: tenants.supportEmail,
        slug: tenants.slug,
        domain: tenants.domain,
      })
      .from(tenants)
      .where(eq(tenants.id, Number(tenantId)))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }

    // Valores por defecto si no están configurados
    const branding = {
      brandName: tenant.brandName,
      brandLogo: tenant.brandLogo,
      brandColors: tenant.brandColors || {
        primary: "#f97316",
        secondary: "#fb923c",
        accent: "#a855f7",
        background: "#ffffff",
        foreground: "#1f2937",
        muted: "#f3f4f6",
      },
      brandTheme: tenant.brandTheme || {
        mode: "light",
        font: "Inter",
        borderRadius: "lg",
      },
      brandSocial: tenant.brandSocial || {},
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      supportEmail: tenant.supportEmail,
      slug: tenant.slug,
      domain: tenant.domain,
    };

    return res.json(branding);
  } catch (e) {
    return next(e);
  }
});

// PUT - Actualizar configuración de marca
router.put("/", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const updates = updateBrandingSchema.parse(req.body);

    await db
      .update(tenants)
      .set({
        ...updates,
        updatedAt: dbNow(),
      })
      .where(eq(tenants.id, Number(tenantId)));

    logger.info({ tenantId, updates }, "[Branding] Configuración actualizada");

    return res.json({ message: "Configuración de marca actualizada exitosamente" });
  } catch (e) {
    return next(e);
  }
});

// POST - Subir logo (placeholder - necesitarías implementar upload de archivos)
router.post("/upload-logo", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    // TODO: Implementar upload de archivos con multer o similar
    // Por ahora, solo aceptamos URLs
    const { logoUrl } = z.object({ logoUrl: z.string().url() }).parse(req.body);

    await db
      .update(tenants)
      .set({
        brandLogo: logoUrl,
        updatedAt: dbNow(),
      })
      .where(eq(tenants.id, Number(tenantId)));

    logger.info({ tenantId, logoUrl }, "[Branding] Logo actualizado");

    return res.json({ message: "Logo actualizado exitosamente", logoUrl });
  } catch (e) {
    return next(e);
  }
});

// GET - Vista previa del tema (genera CSS dinámico)
router.get("/preview-theme", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const [tenant] = await db
      .select({
        brandColors: tenants.brandColors,
        brandTheme: tenants.brandTheme,
      })
      .from(tenants)
      .where(eq(tenants.id, Number(tenantId)))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }

    const colors = tenant.brandColors || {
      primary: "#f97316",
      secondary: "#fb923c",
      accent: "#a855f7",
      background: "#ffffff",
      foreground: "#1f2937",
      muted: "#f3f4f6",
    };

    const theme = tenant.brandTheme || {
      mode: "light",
      font: "Inter",
      borderRadius: "lg",
    };

    // Generar CSS dinámico
    const css = `
      :root {
        --color-primary: ${colors.primary};
        --color-secondary: ${colors.secondary};
        --color-accent: ${colors.accent};
        --color-background: ${colors.background};
        --color-foreground: ${colors.foreground};
        --color-muted: ${colors.muted};
        --font-family: ${theme.font}, sans-serif;
        --border-radius: ${theme.borderRadius === "none" ? "0" : theme.borderRadius === "sm" ? "0.25rem" : theme.borderRadius === "md" ? "0.5rem" : theme.borderRadius === "lg" ? "0.75rem" : "1rem"};
      }
      
      ${theme.customCSS || ""}
    `;

    res.setHeader("Content-Type", "text/css");
    return res.send(css);
  } catch (e) {
    return next(e);
  }
});

// GET - Obtener branding público por slug (para páginas públicas)
router.get("/public/:slug", async (req, res, next) => {
  try {
    const { slug } = req.params;

    const [tenant] = await db
      .select({
        brandName: tenants.brandName,
        brandLogo: tenants.brandLogo,
        brandColors: tenants.brandColors,
        brandTheme: tenants.brandTheme,
        brandSocial: tenants.brandSocial,
        contactEmail: tenants.contactEmail,
        contactPhone: tenants.contactPhone,
        slug: tenants.slug,
        domain: tenants.domain,
      })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ error: "Tienda no encontrada" });
    }

    // No incluir información sensible
    const publicBranding = {
      brandName: tenant.brandName,
      brandLogo: tenant.brandLogo,
      brandColors: tenant.brandColors || {
        primary: "#f97316",
        secondary: "#fb923c",
        accent: "#a855f7",
      },
      brandTheme: tenant.brandTheme || {
        mode: "light",
        font: "Inter",
        borderRadius: "lg",
      },
      brandSocial: tenant.brandSocial || {},
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      slug: tenant.slug,
    };

    return res.json(publicBranding);
  } catch (e) {
    return next(e);
  }
});

export default router;
