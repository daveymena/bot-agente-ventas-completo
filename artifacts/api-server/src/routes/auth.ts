import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { tenantManager } from "../lib/tenantManager";
import { logger } from "../lib/logger";

const router = Router();

// Helper to hash password
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

// REGISTER
router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, brandName, slug } = registerSchema.parse(req.body);
    
    // Check if email or slug exists
    const existing = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (existing.length > 0) return res.status(400).json({ error: "El email ya está registrado" });
    
    const existingSlug = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
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
      settings: {
        timezone: "America/Bogota",
        language: "es",
        currency: "COP",
        autoRespond: true
      },
      limits: {
        maxConversations: 1000,
        maxProducts: 100,
        maxAgents: 1,
        maxMonthlyMessages: 5000,
        apiCallsPerMinute: 60
      }
    }).returning();

    return res.status(201).json({ message: "Registro exitoso", tenant: newTenant });
  } catch (e) {
    return next(e);
  }
});

// LOGIN
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    console.log(`🔐 Intento de login: ${email}`);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    
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

    // Set cookie (Simple session for now)
    res.cookie("tenant_id", tenant.id, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.json({ message: "Login exitoso", tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
  } catch (e) {
    return next(e);
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("tenant_id");
  return res.json({ ok: true });
});

export default router;
