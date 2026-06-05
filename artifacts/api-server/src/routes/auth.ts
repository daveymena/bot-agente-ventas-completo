import { Router } from "express";
import { z } from "zod";
import { pool, tenants } from "@workspace/db";
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
    const emailCheck = await pool.query(`SELECT id FROM tenants WHERE email = $1 LIMIT 1`, [email]);
    if (emailCheck.rows.length > 0) return res.status(400).json({ error: "El email ya está registrado" });
    
    const slugCheck = await pool.query(`SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
    if (slugCheck.rows.length > 0) return res.status(400).json({ error: "El nombre de tienda (slug) ya está en uso" });

    const passwordHash = hashPassword(password);

    const insertResult = await pool.query(
      `INSERT INTO tenants (name, email, password_hash, slug, brand_name, status, plan, agent_name, agent_personality, settings, limits) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, name, email, slug`,
      [name, email, passwordHash, slug, brandName, "active", "basic", "Sofía", "professional", JSON.stringify({ timezone: "America/Bogota", language: "es", currency: "COP", autoRespond: true }), JSON.stringify({ maxConversations: 1000, maxProducts: 100, maxAgents: 1, maxMonthlyMessages: 5000, apiCallsPerMinute: 60 })]
    );
    const newTenant = insertResult.rows[0];

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
    const { rows } = await pool.query(
      `SELECT id, name, email, password_hash, slug, brand_name, brand_logo, status, plan, agent_name, agent_personality, settings, created_at FROM tenants WHERE email = $1 LIMIT 1`,
      [email]
    );
    const tenant = rows[0];
    
    if (!tenant) {
      console.log(`❌ Login fallido: Usuario ${email} no encontrado en DB.`);
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const incomingHash = hashPassword(password);
    if (tenant.password_hash !== incomingHash) {
      console.log(`❌ Login fallido: Contraseña incorrecta para ${email}.`);
      console.log(`🔍 Recibido: ${incomingHash.substring(0,10)}... | En DB: ${tenant.password_hash?.substring(0,10)}...`);
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    console.log(`✅ Login exitoso: ${email} (ID: ${tenant.id})`);

    // Set cookie (Simple session for now)
    const isSecure = process.env.NODE_ENV === "production" || req.secure;
    res.cookie("tenant_id", tenant.id, { 
      httpOnly: true, 
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    return res.json({ message: "Login exitoso", tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } });
  } catch (e) {
    return next(e);
  }
});

// GET CURRENT USER (from cookie)
router.get("/me", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No session found" });
    }
    const { rows } = await pool.query(
      `SELECT id, name, email, slug, plan, brand_name, status, settings, created_at FROM tenants WHERE id = $1 LIMIT 1`,
      [Number(tenantId)]
    );
    const tenant = rows[0];
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
        createdAt: tenant.created_at,
      },
    });
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
