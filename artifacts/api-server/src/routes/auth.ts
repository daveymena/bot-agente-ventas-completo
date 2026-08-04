import { Router } from "express";
import { z } from "zod";
import { db, tenants, stores } from "@workspace/db";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { tenantManager } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { generateVerificationCode, sendPasswordResetEmail, sendPasswordChangeConfirmationEmail } from "../lib/email";
import { credencialesEmailDe } from "../lib/tenant-email-credentials";
import { toDbDate } from "../lib/date-utils";
import { authRateLimit, passwordResetRateLimit } from "../middleware/rateLimiting";
import QRCode from "qrcode";
import { decryptSecret, encryptSecret } from "../lib/credentials-vault";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "../lib/totp";
import { twoFactorLimiter } from "../lib/rate-limiter";

const router = Router();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function legacySha256(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// Los hashes de bcrypt siempre arrancan con "$2"; cualquier otra cosa es el
// SHA-256 plano (sin sal) que se usaba antes de esta migración. Esto deja
// entrar a las cuentas viejas durante la transición -- si el hash legacy
// coincide, el login re-hashea la contraseña con bcrypt en el momento (es la
// única vez que se tiene el password en texto plano para poder hacerlo), así
// el hash débil no sobrevive más de un login.
async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; legacy: boolean }> {
  if (storedHash.startsWith("$2")) {
    return { valid: await bcrypt.compare(password, storedHash), legacy: false };
  }
  return { valid: legacySha256(password) === storedHash, legacy: true };
}

const strongPassword = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[a-zA-Z]/, "La contraseña debe incluir al menos una letra")
  .regex(/[0-9]/, "La contraseña debe incluir al menos un número");

const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: strongPassword,
  brandName: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const requestResetSchema = z.object({
  email: z.string().email(),
});

const verifyResetCodeSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: strongPassword,
});

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60 * 1000;

function tenantIdFromRequest(req: any): number | null {
  const id = Number(req.signedCookies?.tenant_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function challengeFor(tenantId: number): string {
  return JSON.stringify({ tenantId, expiresAt: Date.now() + TWO_FACTOR_CHALLENGE_TTL_MS });
}

function readChallenge(req: any): { tenantId: number; expiresAt: number } | null {
  const raw = req.signedCookies?.login_2fa;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.tenantId && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function recoveryHashes(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const values = (metadata as any).security?.twoFactorRecoveryHashes;
  return Array.isArray(values) ? values.filter((v) => typeof v === "string") : [];
}

function withRecoveryHashes(metadata: unknown, hashes: string[]) {
  const base = metadata && typeof metadata === "object" ? metadata as any : {};
  return { ...base, security: { ...(base.security || {}), twoFactorRecoveryHashes: hashes } };
}

async function findValidResetCode(email: string, code: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      email: tenants.email,
      passwordResetCode: tenants.passwordResetCode,
      passwordResetExpiry: tenants.passwordResetExpiry,
    })
    .from(tenants)
    .where(eq(tenants.email, email))
    .limit(1);

  if (!tenant || !tenant.passwordResetCode || !tenant.passwordResetExpiry) return null;
    // Accept one legacy plaintext code during migration, while all newly
    // issued codes are stored hashed.
    if (hashRecoveryCode(code) !== tenant.passwordResetCode && tenant.passwordResetCode !== code) return null;
  if (new Date(tenant.passwordResetExpiry).getTime() < Date.now()) return null;
  return tenant;
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, brandName, slug } = registerSchema.parse(req.body);

    const existingEmail = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.email, email)).limit(1);
    if (existingEmail.length > 0) return res.status(400).json({ error: "El email ya está registrado" });

    const existingSlug = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (existingSlug.length > 0) return res.status(400).json({ error: "El nombre de tienda (slug) ya está en uso" });

    const passwordHash = await hashPassword(password);

    const [newTenant] = await db.insert(tenants).values({
      name,
      email,
      passwordHash,
      slug,
      brandName,
      // "trial", no "active": el plan "basic" (Prueba gratis) dura 7 días
      // (SAAS_PLANS.basic.trialDays) -- validateSaasPlan() en saasValidation.ts
      // SOLO revisa el vencimiento cuando status === "trial". Con "active" el
      // plan gratuito nunca vencía, quedaba gratis para siempre.
      status: "trial",
      plan: "basic",
      agentName: "Sofía",
      agentPersonality: "professional",
      settings: { timezone: "America/Bogota", language: "es", currency: "COP", autoRespond: true },
      limits: { maxConversations: 1000, maxProducts: 100, maxAgents: 1, maxMonthlyMessages: 5000, apiCallsPerMinute: 60 },
    }).returning({ id: tenants.id, name: tenants.name, email: tenants.email, slug: tenants.slug });

    // Crea la tienda pública del tenant automáticamente. Antes NINGÚN tenant
    // (ni siquiera el 1, que ya existía) tenía fila en `stores` -- el catálogo
    // público (GET /api/store/:slug) devolvía 404 siempre ("la tienda no
    // aparece"). El slug de la tienda es SIEMPRE igual al del tenant, para que
    // /tienda/:slug funcione con el mismo slug que usa el resto del sistema.
    try {
      await db.insert(stores).values({ tenantId: newTenant!.id, name: brandName, slug: newTenant!.slug });
    } catch (err) {
      logger.error({ err, tenantId: newTenant!.id }, "[Auth] No se pudo crear la tienda automática del tenant");
    }

    return res.status(201).json({ message: "Registro exitoso", tenant: newTenant });
  } catch (e) {
    return next(e);
  }
});

router.post("/login", authRateLimit, async (req, res, next) => {
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
        twoFactorEnabled: tenants.twoFactorEnabled,
      createdAt: tenants.createdAt,
    }).from(tenants).where(eq(tenants.email, email)).limit(1);

    if (!tenant) {
      console.log(`❌ Login fallido: Usuario ${email} no encontrado en DB.`);
      return res.status(401).json({ error: "Usuario no encontrado" });
    }

    const { valid, legacy } = await verifyPassword(password, tenant.passwordHash || "");
    if (!valid) {
      console.log(`❌ Login fallido: Contraseña incorrecta para ${email}.`);
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    if (legacy) {
      // Ya se validó la contraseña contra el hash viejo -- aprovechar que
      // se tiene el texto plano acá para migrar a bcrypt sin pedirle nada
      // extra al usuario.
      const upgradedHash = await hashPassword(password);
      await db.update(tenants).set({ passwordHash: upgradedHash }).where(eq(tenants.id, tenant.id));
      logger.info({ tenantId: tenant.id }, "[Auth] Hash de contraseña migrado de SHA-256 a bcrypt");
    }

    console.log(`✅ Login exitoso: ${email} (ID: ${tenant.id})`);

    if (tenant.twoFactorEnabled) {
      res.cookie("login_2fa", challengeFor(tenant.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || req.secure,
        sameSite: "lax",
        signed: true,
        maxAge: TWO_FACTOR_CHALLENGE_TTL_MS,
        path: "/",
      });
      return res.json({ requiresTwoFactor: true, message: "Código 2FA requerido" });
    }

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
      isAdmin: tenants.isAdmin,
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
        brandName: tenant.brandName,
        status: tenant.status,
        isAdmin: !!tenant.isAdmin,
        createdAt: tenant.createdAt,
      },
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie("tenant_id");
  res.clearCookie("login_2fa");
  return res.json({ ok: true });
});

router.get("/2fa/status", async (req, res, next) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const [tenant] = await db.select({ enabled: tenants.twoFactorEnabled }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    return res.json({ enabled: !!tenant?.enabled });
  } catch (e) { return next(e); }
});

router.post("/2fa/setup", async (req, res, next) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const secret = generateTotpSecret();
    const [tenant] = await db.select({ email: tenants.email }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const issuer = "VentasPro";
    const label = `${issuer}:${tenant?.email || tenantId}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 280, margin: 2 });
    await db.update(tenants).set({ twoFactorSecret: encryptSecret(secret), twoFactorEnabled: false }).where(eq(tenants.id, tenantId));
    return res.json({ secret, otpauthUrl, qrDataUrl, enabled: false });
  } catch (e) { return next(e); }
});

router.post("/2fa/enable", twoFactorLimiter, async (req, res, next) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const code = String(req.body?.code || "");
    const [tenant] = await db.select({ secret: tenants.twoFactorSecret, metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const secret = tenant?.secret ? decryptSecret(tenant.secret) : "";
    if (!secret || !verifyTotp(secret, code)) return res.status(400).json({ error: "Código 2FA incorrecto" });
    const recoveryCodes = generateRecoveryCodes();
    await db.update(tenants).set({ twoFactorEnabled: true, metadata: withRecoveryHashes(tenant.metadata, recoveryCodes.map(hashRecoveryCode)) }).where(eq(tenants.id, tenantId));
    return res.json({ enabled: true, recoveryCodes });
  } catch (e) { return next(e); }
});

router.post("/2fa/disable", twoFactorLimiter, async (req, res, next) => {
  try {
    const tenantId = tenantIdFromRequest(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });
    const [tenant] = await db.select({ secret: tenants.twoFactorSecret, metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const secret = tenant?.secret ? decryptSecret(tenant.secret) : "";
    if (!secret || !verifyTotp(secret, String(req.body?.code || ""))) return res.status(400).json({ error: "Código 2FA incorrecto" });
    await db.update(tenants).set({ twoFactorEnabled: false, twoFactorSecret: null, metadata: withRecoveryHashes(tenant.metadata, []) }).where(eq(tenants.id, tenantId));
    return res.json({ enabled: false });
  } catch (e) { return next(e); }
});

router.post("/2fa/verify-login", twoFactorLimiter, async (req, res, next) => {
  try {
    const challenge = readChallenge(req);
    if (!challenge) return res.status(401).json({ error: "El desafío 2FA expiró. Inicia sesión otra vez." });
    const [tenant] = await db.select({ id: tenants.id, twoFactorSecret: tenants.twoFactorSecret, metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, challenge.tenantId)).limit(1);
    const secret = tenant?.twoFactorSecret ? decryptSecret(tenant.twoFactorSecret) : "";
    const code = String(req.body?.code || "").replace(/\s/g, "");
    let valid = !!secret && verifyTotp(secret, code);
    if (!valid && tenant) {
      const hashes = recoveryHashes(tenant.metadata);
      const hash = hashRecoveryCode(code);
      if (hashes.includes(hash)) {
        valid = true;
        await db.update(tenants).set({ metadata: withRecoveryHashes(tenant.metadata, hashes.filter((h) => h !== hash)) }).where(eq(tenants.id, tenant.id));
      }
    }
    if (!valid) return res.status(401).json({ error: "Código 2FA incorrecto" });
    res.clearCookie("login_2fa");
    res.cookie("tenant_id", tenant!.id, { httpOnly: true, secure: process.env.NODE_ENV === "production" || req.secure, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 * 1000, signed: true });
    return res.json({ message: "Login exitoso", tenant: { id: tenant!.id } });
  } catch (e) { return next(e); }
});

router.post("/request-password-reset", passwordResetRateLimit, async (req, res, next) => {
  try {
    const { email } = requestResetSchema.parse(req.body);

    const [tenant] = await db
      .select({ id: tenants.id, name: tenants.name, email: tenants.email })
      .from(tenants)
      .where(eq(tenants.email, email))
      .limit(1);

    // Respuesta genérica siempre, exista o no el correo -- si el mensaje
    // cambiara según el caso, este endpoint serviría para averiguar qué
    // emails están registrados en la plataforma probando uno por uno.
    if (tenant) {
      const code = generateVerificationCode();
      const expiry = new Date(Date.now() + RESET_CODE_TTL_MS);

      await db
        .update(tenants)
        .set({ passwordResetCode: hashRecoveryCode(code), passwordResetExpiry: toDbDate(expiry) })
        .where(eq(tenants.id, tenant.id));

      try {
        await sendPasswordResetEmail(tenant.email, code, tenant.name, credencialesEmailDe(tenant));
      } catch (err) {
        logger.error({ err, tenantId: tenant.id }, "[Auth] Fallo enviando email de recuperación");
      }
    }

    return res.json({ message: "Si el correo está registrado, recibirás un código de recuperación en unos minutos." });
  } catch (e) {
    return next(e);
  }
});

router.post("/verify-reset-code", authRateLimit, async (req, res, next) => {
  try {
    const { email, code } = verifyResetCodeSchema.parse(req.body);
    const tenant = await findValidResetCode(email, code);
    if (!tenant) return res.status(400).json({ valid: false, error: "Código inválido o expirado" });
    return res.json({ valid: true });
  } catch (e) {
    return next(e);
  }
});

router.post("/reset-password", authRateLimit, async (req, res, next) => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    const tenant = await findValidResetCode(email, code);
    if (!tenant) return res.status(400).json({ error: "Código inválido o expirado" });

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(tenants)
      .set({ passwordHash, passwordResetCode: null, passwordResetExpiry: null })
      .where(eq(tenants.id, tenant.id));

    try {
      await sendPasswordChangeConfirmationEmail(tenant.email, tenant.name, credencialesEmailDe(tenant));
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "[Auth] Fallo enviando confirmación de cambio de contraseña");
    }

    return res.json({ message: "Contraseña actualizada correctamente" });
  } catch (e) {
    return next(e);
  }
});

export default router;
