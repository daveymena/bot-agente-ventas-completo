import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { tenantManager } from "../lib/tenantManager";
import { logger } from "../lib/logger";

const router = Router();

function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  brandName: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, brandName, slug } = registerSchema.parse(req.body);

    const existingEmail = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.email, email)).limit(1);
    if (existingEmail.length > 0) return res.status(400).json({ error: "El email ya está registrado" });

    const existingSlug = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (existingSlug.length > 0) return res.status(400).json({ error: "El nombre de tienda (slug) ya está en uso" });

    const passwordHash = hashPassword(password);

    const [newTenant] = await db.insert(tenants).values({
      name,
      email,
      passwordHash,
      slug,
      brandName,
      status: "active",
      plan: "basic",
      agentName: "Sofía",
      agentPersonality: "professional",
      settings: { timezone: "America/Bogota", language: "es", currency: "COP", autoRespond: true },
      limits: { maxConversations: 1000, maxProducts: 100, maxAgents: 1, maxMonthlyMessages: 5000, apiCallsPerMinute: 60 },
    }).returning({ id: tenants.id, name: tenants.name, email: tenants.email, slug: tenants.slug });

    return res.status(201).json({ message: "Registro exitoso", tenant: newTenant });
  } catch (e) {
    return next(e);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    console.log(`🔐 Intento de login: ${email}`);

    const [tenant] = await db.select({
      id: tenants.id,
      name: tenants.name,
      email: tenants.email,
      passwordHash: tenants.passwordHash,
      slug: tenants.slug,
      brandName: tenants.brandName,
      brandLogo: tenants.brandLogo,
      status: tenants.status,
      plan: tenants.plan,
      agentName: tenants.agentName,
      agentPersonality: tenants.agentPersonality,
      settings: tenants.settings,
      createdAt: tenants.createdAt,
    }).from(tenants).where(eq(tenants.email, email)).limit(1);

    if (!tenant) {
      console.log(`❌ Login fallido: Usuario ${email} no encontrado en DB.`);
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const incomingHash = hashPassword(password);
    if (tenant.passwordHash !== incomingHash) {
      console.log(`❌ Login fallido: Contraseña incorrecta para ${email}.`);
      console.log(`🔍 Recibido: ${incomingHash.substring(0,10)}... | En DB: ${tenant.passwordHash?.substring(0,10)}...`);
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    console.log(`✅ Login exitoso: ${email} (ID: ${tenant.id})`);

    const isSecure = process.env.NODE_ENV === "production" || req.secure;
    res.cookie("tenant_id", tenant.id, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      signed: true,
    });

    return res.json({ message: "Login exitoso", tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
  } catch (e) {
    return next(e);
  }
});

router.get("/me", async (req, res, next) => {
  try {
    const tenantId = req.signedCookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No session found" });
    }

    const [tenant] = await db.select({
      id: tenants.id,
      name: tenants.name,
      email: tenants.email,
      slug: tenants.slug,
      plan: tenants.plan,
      brandName: tenants.brandName,
      status: tenants.status,
      settings: tenants.settings,
      createdAt: tenants.createdAt,
    }).from(tenants).where(eq(tenants.id, Number(tenantId))).limit(1);

    if (!tenant) {
      return res.status(401).json({ error: "Tenant not found" });
    }

    return res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        slug: tenant.slug,
        plan: tenant.plan,
        status: tenant.status,
        createdAt: tenant.createdAt,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("tenant_id");
  return res.json({ ok: true });
});

export default router;
