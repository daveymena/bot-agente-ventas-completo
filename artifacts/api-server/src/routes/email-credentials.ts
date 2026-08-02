import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  credencialesEmailDe,
  enmascararEmailPass,
  probarSMTP,
} from "../lib/tenant-email-credentials";
import { tenantManager } from "../lib/tenantManager";
import { encryptSecret } from "../lib/credentials-vault";

/**
 * Credenciales SMTP del negocio logueado.
 *
 * Cada cliente carga acá SU configuración de correo para que los emails
 * (confirmaciones de pedido, verificación, reset de password, activación)
 * salgan de SU cuenta y no de la del dueño de la plataforma.
 *
 * Los secretos NUNCA vuelven al navegador. El GET devuelve solo si están
 * configurados y los últimos caracteres. Se guardan cifrados.
 */
const router = Router();

const guardarSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().email().optional(),
  pass: z.string().optional(),
  from: z.string().optional(),
  enabled: z.boolean().optional(),
});

function tenantIdDe(req: any): number | null {
  const raw = req.signedCookies?.tenant_id;
  const id = Number(raw);
  return raw && Number.isFinite(id) ? id : null;
}

async function leerMetadata(tenantId: number): Promise<any> {
  const [row] = await db
    .select({ metadata: tenants.metadata })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const meta = row?.metadata as any;
  if (!meta) return {};
  if (typeof meta === "string") {
    try { return JSON.parse(meta); } catch { return {}; }
  }
  return meta;
}

/** GET /api/email/credentials — estado, sin secretos. */
router.get("/credentials", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesEmailDe(tenant);
    const meta = await leerMetadata(tenantId);
    const em = meta.emailCredentials || {};

    return res.json({
      propias: cred.propias,
      configurado: !!em.host && !!em.user && !!em.pass,
      enabled: cred.enabled,
      host: em.host || "",
      port: em.port || 587,
      secure: em.secure ?? false,
      user: em.user || "",
      pass: em.pass ? enmascararEmailPass(cred.pass) : "",
      from: em.from || "",
    });
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/email/credentials — guarda, cifrando la password. */
router.put("/credentials", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const parsed = guardarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", issues: parsed.error.issues });
    }
    const b = parsed.data;
    const meta = await leerMetadata(tenantId);
    const current = meta.emailCredentials || {};
    const nuevo: any = { ...current };

    // Solo se pisa la password si mandaron una nueva y no vacía.
    if (b.pass) nuevo.pass = encryptSecret(b.pass.trim());
    // messengerVerifyToken no aplica a email; aquí solo ciframos pass.
    if (b.host !== undefined) nuevo.host = b.host.trim();
    if (b.port !== undefined) nuevo.port = b.port;
    if (b.secure !== undefined) nuevo.secure = b.secure;
    if (b.user !== undefined) nuevo.user = b.user.trim();
    if (b.from !== undefined) nuevo.from = b.from.trim();
    if (b.enabled !== undefined) nuevo.enabled = b.enabled;

    meta.emailCredentials = nuevo;
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    tenantManager.clearCache();

    logger.info({ tenantId }, "[EmailTenant] Credenciales SMTP actualizadas");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/email/credentials/test — prueba contra servidor SMTP real.
 * Prueba lo que se acaba de tipear si viene en el body; si no, lo guardado.
 */
router.post("/credentials/test", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesEmailDe(tenant);

    // Si mandaron credenciales nuevas en el body, probar esas; si no, las guardadas.
    const testCreds = {
      host: String(req.body?.host || "").trim() || cred.host,
      port: Number(req.body?.port || cred.port),
      secure: req.body?.secure !== undefined ? req.body.secure : cred.secure,
      user: String(req.body?.user || "").trim() || cred.user,
      pass: String(req.body?.pass || "").trim() || cred.pass,
    };

    return res.json(await probarSMTP(testCreds));
  } catch (err) {
    return next(err);
  }
});

export default router;
