import { Router } from "express";
import { z } from "zod";
import { db, tenants, stores } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { tenantManager } from "../lib/tenantManager";
import { logger } from "../lib/logger";
import { 
  generateVerificationCode, 
  sendVerificationEmail, 
  sendPasswordResetEmail,
  sendPasswordChangeConfirmationEmail
} from "../lib/email";
import { 
  ApplicationError, 
  sendError, 
  asyncHandler,
  ERROR_CODES 
} from "../lib/error-handler";
import {
  verificationCodeLimiter,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  twoFactorLimiter
} from "../lib/rate-limiter";

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
router.post("/register", registerLimiter, async (req, res, next) => {
  try {
    const { name, email, password, brandName, slug } = registerSchema.parse(req.body);
    
    // Check if email or slug exists
    const existing = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (existing.length > 0) {
      throw new ApplicationError(ERROR_CODES.AUTH_EMAIL_ALREADY_REGISTERED);
    }
    
    const existingSlug = await db.select().from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (existingSlug.length > 0) {
      throw new ApplicationError(ERROR_CODES.AUTH_SLUG_ALREADY_IN_USE);
    }

    const passwordHash = hashPassword(password);

    // Generar código de verificación
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    const [newTenant] = await db.insert(tenants).values({
      name,
      email,
      passwordHash,
      slug,
      brandName,
      status: "trial",
      plan: "starter",
      agentName: "Sofía",
      agentPersonality: "professional",
      emailVerified: false, // Requiere verificación
      emailVerificationCode: verificationCode,
      emailVerificationExpiry: verificationExpiry,
      settings: {
        timezone: "America/Bogota",
        language: "es",
        currency: "COP",
        autoRespond: true
      },
      limits: {
        maxConversations: 100,
        maxProducts: 50,
        maxAgents: 1,
        maxMonthlyMessages: 1000,
        apiCallsPerMinute: 60
      }
    }).returning();

    // Crear la tienda automáticamente para el nuevo tenant
    try {
      await db.insert(stores).values({
        tenantId: newTenant.id,
        name: brandName,
        slug: slug,
        theme: {}
      });
      logger.info({ tenantId: newTenant.id, slug }, "[Auth] Store created for new tenant");
    } catch (storeErr) {
      logger.warn({ tenantId: newTenant.id, err: storeErr }, "[Auth] Could not create store for new tenant");
    }

    // Enviar email de verificación
    const sent = await sendVerificationEmail(email, verificationCode, name);
    
    if (!sent) {
      logger.warn({ email }, "[Auth] Error enviando email de verificación, pero cuenta creada");
    }

    // Auto-verificar email automáticamente
    try {
      await db.update(tenants).set({ emailVerified: true, emailVerificationCode: null, emailVerificationExpiry: null }).where(eq(tenants.id, newTenant.id));
      logger.info({ email }, "[Auth] Email auto-verificado");
    } catch (verifyErr) {
      logger.warn({ email, err: verifyErr }, "[Auth] Error en auto-verificación");
    }

    // Establecer cookie de sesión (auto-login)
    res.cookie("tenant_id", newTenant.id.toString(), {
      httpOnly: false,
      secure: false, // Permitir proxies HTTP
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
    });

    logger.info({ email }, "[Auth] Registro exitoso, auto-verificado, auto-login");
    return res.status(201).json({
      message: "Registro exitoso. Bienvenido!",
      tenant: { id: newTenant.id, email: newTenant.email, name: newTenant.name, brandName: newTenant.brandName, slug: newTenant.slug },
      autoLoggedIn: true
    });
  } catch (e) {
    return next(e);
  }
});

// LOGIN
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    console.log(`🔐 Intento de login: ${email}`);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    
    if (!tenant) {
      console.log(`❌ Login fallido: Usuario ${email} no encontrado en DB.`);
      throw new ApplicationError(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    const incomingHash = hashPassword(password);
    if (tenant.passwordHash !== incomingHash) {
      console.log(`❌ Login fallido: Contraseña incorrecta para ${email}.`);
      console.log(`🔍 Recibido: ${incomingHash.substring(0,10)}... | En DB: ${tenant.passwordHash?.substring(0,10)}...`);
      throw new ApplicationError(ERROR_CODES.AUTH_INVALID_CREDENTIALS);
    }

    console.log(`✅ Login exitoso: ${email} (ID: ${tenant.id})`);

    // Set cookie (Sesión persistente de 30 días)
    // Sin domain específico para que funcione tanto en localhost como en EasyPanel
    res.cookie("tenant_id", tenant.id.toString(), { 
      httpOnly: false,
      secure: false, // Permitir proxies HTTP
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    console.log(`🍪 Cookie establecida: tenant_id=${tenant.id}`);

    return res.json({ 
      message: "Login exitoso", 
      tenant: { 
        id: tenant.id, 
        name: tenant.name, 
        slug: tenant.slug,
        email: tenant.email,
        plan: tenant.plan,
        status: tenant.status,
        emailVerified: tenant.emailVerified
      } 
    });
  } catch (e) {
    return next(e);
  }
});

// LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("tenant_id", { path: "/" });
  console.log(`🚪 Logout exitoso`);
  return res.json({ ok: true });
});

// GET CURRENT SESSION
router.get("/me", async (req, res, next) => {
  try {
    // Aceptar tanto cookie como header X-Tenant-Id (funciona detrás de Easypanel HTTPS proxy)
    const tenantId = req.cookies?.tenant_id || req.headers["x-tenant-id"];
    
    console.log(`🔍 Verificando sesión. Cookie tenant_id: ${req.cookies?.tenant_id}, Header X-Tenant-Id: ${req.headers["x-tenant-id"]}`);
    console.log(`🔍 Todas las cookies:`, req.cookies);
    
    if (!tenantId) {
      console.log(`❌ No hay cookie de sesión ni header X-Tenant-Id`);
      return res.status(401).json({ 
        error: "No session found",
        debug: {
          cookies: req.cookies,
          hasCookieHeader: !!req.headers.cookie,
          hasXTenantHeader: !!req.headers["x-tenant-id"]
        }
      });
    }

    try {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, Number(tenantId))).limit(1);
      
      if (!tenant) {
        console.log(`❌ Tenant no encontrado para ID: ${tenantId}`);
        res.clearCookie("tenant_id", { path: "/" });
        return res.status(401).json({ error: "Session invalid" });
      }

      console.log(`✅ Sesión válida para tenant: ${tenant.name} (ID: ${tenant.id})`);

      // Calcular días restantes si es trial
      let trialDaysRemaining = null;
      if (tenant.status === "trial") {
        const trialDays = 7; // Free plan trial days
        const createdAt = new Date(tenant.createdAt);
        const trialExpiry = new Date(
          createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000
        );
        const now = new Date();
        trialDaysRemaining = Math.max(
          0,
          Math.ceil((trialExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );
      }

      // EXCEPCIÓN VIP: Usuario administrador con acceso gratuito de por vida
      const isVIP = tenant.email === "daveymena16@gmail.com";

      if (isVIP) {
        return res.json({ 
          tenant: { 
            id: tenant.id, 
            name: tenant.name, 
            email: tenant.email,
            slug: tenant.slug,
            plan: "enterprise",
            status: "active",
            trialDaysRemaining: 9999,
            createdAt: tenant.createdAt,
          } 
        });
      }

      return res.json({ 
        tenant: { 
          id: tenant.id, 
          name: tenant.name, 
          email: tenant.email,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
          trialDaysRemaining,
          createdAt: tenant.createdAt,
        } 
      });
    } catch (dbError) {
      // Fallback cuando BD falla - retornar usuario de prueba
      console.warn(`⚠️ BD error en /me, usando fallback local:`, dbError);
      return res.json({ 
        tenant: { 
          id: 1,
          name: "Davey Mena",
          email: "daveymena16@gmail.com",
          slug: "davey-mena",
          plan: "enterprise",
          status: "active",
          trialDaysRemaining: 9999,
          createdAt: new Date().toISOString(),
        } 
      });
    }
  } catch (e) {
    return next(e);
  }
});

// Demo login - para testing sin BD
router.post("/demo-login", (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production" });
  }
  
  res.cookie("tenant_id", "1", { 
    httpOnly: false,
    secure: false,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  return res.json({ 
    message: "Demo login successful", 
    tenant: { 
      id: 1,
      name: "Davey Mena",
      email: "daveymena16@gmail.com",
      slug: "davey-mena",
      plan: "enterprise",
      status: "active",
    } 
  });
});

export default router;


// ============================================================
// VERIFICACIÓN DE EMAIL
// ============================================================

const sendVerificationCodeSchema = z.object({
  email: z.string().email(),
});

// Enviar código de verificación
router.post("/send-verification-code", verificationCodeLimiter, async (req, res, next) => {
  try {
    const { email } = sendVerificationCodeSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant) {
      throw new ApplicationError(ERROR_CODES.AUTH_NOT_AUTHENTICATED);
    }

    if (tenant.emailVerified) {
      throw new ApplicationError(ERROR_CODES.AUTH_EMAIL_ALREADY_VERIFIED);
    }

    // Generar código de 6 dígitos
    const code = generateVerificationCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Guardar código en la base de datos
    await db.update(tenants)
      .set({
        emailVerificationCode: code,
        emailVerificationExpiry: expiry,
      })
      .where(eq(tenants.id, tenant.id));

    // Enviar email
    const sent = await sendVerificationEmail(email, code, tenant.name);
    
    if (!sent) {
      throw new ApplicationError(ERROR_CODES.INTERNAL_SERVER_ERROR);
    }

    logger.info({ email }, "[Auth] Código de verificación enviado");
    return res.json({ message: "Código enviado a tu email" });
  } catch (e) {
    return next(e);
  }
});

// Verificar código de email
router.post("/verify-email", verificationCodeLimiter, async (req, res, next) => {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant) {
      throw new ApplicationError(ERROR_CODES.NOT_FOUND);
    }

    if (tenant.emailVerified) {
      throw new ApplicationError(ERROR_CODES.AUTH_EMAIL_ALREADY_VERIFIED);
    }

    if (!tenant.emailVerificationCode || !tenant.emailVerificationExpiry) {
      throw new ApplicationError(ERROR_CODES.AUTH_NO_VERIFICATION_CODE);
    }

    // Verificar que el código no haya expirado
    if (new Date() > new Date(tenant.emailVerificationExpiry)) {
      throw new ApplicationError(ERROR_CODES.AUTH_VERIFICATION_CODE_EXPIRED);
    }

    // Verificar el código
    if (tenant.emailVerificationCode !== code) {
      throw new ApplicationError(ERROR_CODES.AUTH_VERIFICATION_CODE_INVALID);
    }

    // Marcar email como verificado
    await db.update(tenants)
      .set({
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null,
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ email }, "[Auth] Email verificado exitosamente");
    return res.json({ message: "Email verificado exitosamente" });
  } catch (e) {
    return next(e);
  }
});

// Resend email verification code
const resendVerificationEmailSchema = z.object({
  email: z.string().email(),
});

router.post("/resend-verification-email", async (req, res, next) => {
  try {
    const { email } = resendVerificationEmailSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant) {
      // Por seguridad, no revelar si el email existe
      return res.json({ message: "Si el email existe, recibirás un nuevo código de verificación" });
    }

    if (tenant.emailVerified) {
      return res.status(400).json({ error: "El email ya está verificado" });
    }

    // Generar nuevo código
    const verificationCode = generateVerificationCode();
    const verificationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await db.update(tenants)
      .set({
        emailVerificationCode: verificationCode,
        emailVerificationExpiry: verificationExpiry,
      })
      .where(eq(tenants.id, tenant.id));

    // Enviar email
    const sent = await sendVerificationEmail(email, verificationCode, tenant.name);
    
    if (!sent) {
      logger.error({ email }, "[Auth] Error enviando nuevo código de verificación");
    }

    logger.info({ email }, "[Auth] Nuevo código de verificación enviado");
    return res.json({ message: "Si el email existe, recibirás un nuevo código de verificación" });
  } catch (e) {
    return next(e);
  }
});

// ============================================================
// RECUPERACIÓN DE CONTRASEÑA
// ============================================================

const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});

// Solicitar código de recuperación
router.post("/request-password-reset", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email } = requestPasswordResetSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    
    // Por seguridad, siempre devolvemos el mismo mensaje aunque el usuario no exista
    if (!tenant) {
      logger.warn({ email }, "[Auth] Intento de recuperación para email no existente");
      return res.json({ message: "Si el email existe, recibirás un código de recuperación" });
    }

    // Generar código de 6 dígitos
    const code = generateVerificationCode();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    // Guardar código en la base de datos
    await db.update(tenants)
      .set({
        passwordResetCode: code,
        passwordResetExpiry: expiry,
      })
      .where(eq(tenants.id, tenant.id));

    // Enviar email
    const sent = await sendPasswordResetEmail(email, code, tenant.name);
    
    if (!sent) {
      logger.error({ email }, "[Auth] Error enviando código de recuperación");
    }

    logger.info({ email }, "[Auth] Código de recuperación solicitado");
    return res.json({ message: "Si el email existe, recibirás un código de recuperación" });
  } catch (e) {
    return next(e);
  }
});

// Verificar código de recuperación
router.post("/verify-reset-code", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email, code } = verifyResetCodeSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant) {
      throw new ApplicationError(ERROR_CODES.NOT_FOUND);
    }

    if (!tenant.passwordResetCode || !tenant.passwordResetExpiry) {
      throw new ApplicationError(ERROR_CODES.AUTH_NO_RESET_CODE);
    }

    // Verificar que el código no haya expirado
    if (new Date() > new Date(tenant.passwordResetExpiry)) {
      throw new ApplicationError(ERROR_CODES.AUTH_RESET_CODE_EXPIRED);
    }

    // Verificar el código
    if (tenant.passwordResetCode !== code) {
      throw new ApplicationError(ERROR_CODES.AUTH_RESET_CODE_INVALID);
    }

    logger.info({ email }, "[Auth] Código de recuperación verificado");
    return res.json({ message: "Código verificado. Puedes cambiar tu contraseña." });
  } catch (e) {
    return next(e);
  }
});

// Restablecer contraseña
router.post("/reset-password", passwordResetLimiter, async (req, res, next) => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant) {
      throw new ApplicationError(ERROR_CODES.NOT_FOUND);
    }

    if (!tenant.passwordResetCode || !tenant.passwordResetExpiry) {
      throw new ApplicationError(ERROR_CODES.AUTH_NO_RESET_CODE);
    }

    // Verificar que el código no haya expirado
    if (new Date() > new Date(tenant.passwordResetExpiry)) {
      throw new ApplicationError(ERROR_CODES.AUTH_RESET_CODE_EXPIRED);
    }

    // Verificar el código
    if (tenant.passwordResetCode !== code) {
      throw new ApplicationError(ERROR_CODES.AUTH_RESET_CODE_INVALID);
    }

    // Cambiar la contraseña
    const newPasswordHash = hashPassword(newPassword);
    await db.update(tenants)
      .set({
        passwordHash: newPasswordHash,
        passwordResetCode: null,
        passwordResetExpiry: null,
      })
      .where(eq(tenants.id, tenant.id));

    // Enviar confirmación de cambio
    const confirmationSent = await sendPasswordChangeConfirmationEmail(email, tenant.name);
    if (!confirmationSent) {
      logger.warn({ email }, "[Auth] Contraseña restablecida pero no se pudo enviar confirmación");
    }

    logger.info({ email }, "[Auth] Contraseña restablecida exitosamente");
    return res.json({ message: "Contraseña restablecida exitosamente. Revisa tu email para confirmación." });
  } catch (e) {
    return next(e);
  }
});

// ============================================================
// 2FA (AUTENTICACIÓN DE DOS FACTORES) - OPCIONAL
// ============================================================

// Nota: Para implementar 2FA completo, necesitarías instalar:
// npm install speakeasy qrcode
// 
// Por ahora, dejamos los endpoints preparados pero comentados
// para que puedas activarlos cuando quieras implementar 2FA

/*
import speakeasy from "speakeasy";
import QRCode from "qrcode";

// Generar secreto 2FA
router.post("/2fa/generate", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, Number(tenantId))).limit(1);
    if (!tenant) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Generar secreto
    const secret = speakeasy.generateSecret({
      name: `VentasPro (${tenant.email})`,
      issuer: "VentasPro"
    });

    // Guardar secreto temporal (no activado aún)
    await db.update(tenants)
      .set({ twoFactorSecret: secret.base32 })
      .where(eq(tenants.id, tenant.id));

    // Generar QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return res.json({
      secret: secret.base32,
      qrCode: qrCodeUrl,
      message: "Escanea el código QR con Google Authenticator o similar"
    });
  } catch (e) {
    return next(e);
  }
});

// Activar 2FA
router.post("/2fa/enable", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    const { code } = z.object({ code: z.string().length(6) }).parse(req.body);

    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, Number(tenantId))).limit(1);
    if (!tenant || !tenant.twoFactorSecret) {
      return res.status(400).json({ error: "Primero genera un secreto 2FA" });
    }

    // Verificar el código
    const verified = speakeasy.totp.verify({
      secret: tenant.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: "Código incorrecto" });
    }

    // Activar 2FA
    await db.update(tenants)
      .set({ twoFactorEnabled: true })
      .where(eq(tenants.id, tenant.id));

    logger.info({ email: tenant.email }, "[Auth] 2FA activado");
    return res.json({ message: "2FA activado exitosamente" });
  } catch (e) {
    return next(e);
  }
});

// Desactivar 2FA
router.post("/2fa/disable", async (req, res, next) => {
  try {
    const tenantId = req.cookies?.tenant_id;
    const { password } = z.object({ password: z.string() }).parse(req.body);

    if (!tenantId) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, Number(tenantId))).limit(1);
    if (!tenant) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Verificar contraseña
    const passwordHash = hashPassword(password);
    if (tenant.passwordHash !== passwordHash) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }

    // Desactivar 2FA
    await db.update(tenants)
      .set({
        twoFactorEnabled: false,
        twoFactorSecret: null
      })
      .where(eq(tenants.id, tenant.id));

    logger.info({ email: tenant.email }, "[Auth] 2FA desactivado");
    return res.json({ message: "2FA desactivado exitosamente" });
  } catch (e) {
    return next(e);
  }
});

// Verificar código 2FA durante login
router.post("/2fa/verify", async (req, res, next) => {
  try {
    const { email, code } = z.object({
      email: z.string().email(),
      code: z.string().length(6)
    }).parse(req.body);

    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    if (!tenant || !tenant.twoFactorEnabled || !tenant.twoFactorSecret) {
      return res.status(400).json({ error: "2FA no está activado" });
    }

    // Verificar el código
    const verified = speakeasy.totp.verify({
      secret: tenant.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2
    });

    if (!verified) {
      return res.status(400).json({ error: "Código incorrecto" });
    }

    return res.json({ message: "Código 2FA verificado" });
  } catch (e) {
    return next(e);
  }
});
*/

// CHECK EMAIL AVAILABILITY (para validación en tiempo real)
router.post("/check-email", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    
    const existing = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    
    return res.json({ 
      available: existing.length === 0,
      email 
    });
  } catch (e) {
    return next(e);
  }
});

// AUTO-VERIFY EMAIL (sin requerer entrada de código)
router.post("/verify-email-auto", async (req, res, next) => {
  try {
    const { email } = z.object({ email: z.string().email() }).parse(req.body);
    
    // Buscar el tenant
    const [tenant] = await db.select().from(tenants).where(eq(tenants.email, email)).limit(1);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }

    // Marcar como verificado sin requerer código
    const [updated] = await db.update(tenants)
      .set({ 
        emailVerified: true,
        emailVerificationCode: null,
        emailVerificationExpiry: null 
      })
      .where(eq(tenants.id, tenant.id))
      .returning();

    logger.info({ email }, "[Auth] Email auto-verificado");
    return res.json({ 
      message: "Email verificado automáticamente",
      emailVerified: true 
    });
  } catch (e) {
    return next(e);
  }
});
