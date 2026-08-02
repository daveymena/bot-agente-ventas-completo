import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { configCorreoDe, construirMetaCorreo, probarCorreo } from "../lib/tenant-email";
import { tenantManager } from "../lib/tenantManager";

/**
 * Correo saliente del negocio logueado.
 *
 * Sirve para que la confirmación de compra le llegue al comprador desde la
 * marca que le vendió, y no desde "VentasPro" -- que el cliente no reconoce y
 * termina en spam.
 *
 * La contraseña nunca vuelve al navegador.
 */
const router = Router();

const guardarSchema = z.object({
  host: z.string().optional(),
  port: z.coerce.number().int().positive().optional(),
  user: z.string().email().optional().or(z.literal("")),
  // Vacío = "no la cambies". El GET nunca la devuelve, así que el formulario
  // no puede reenviarla.
  pass: z.string().optional(),
  fromName: z.string().optional(),
  enabled: z.boolean().optional(),
});

function tenantIdDe(req: any): number | null {
  const raw = req.signedCookies?.tenant_id;
  const id = Number(raw);
  return raw && Number.isFinite(id) ? id : null;
}

/** GET /api/email-config — estado, sin la contraseña. */
router.get("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cfg = configCorreoDe(tenant);

    return res.json({
      propio: cfg.propio,
      configurado: cfg.propio,
      host: cfg.propio ? cfg.host : "",
      port: cfg.propio ? cfg.port : 587,
      user: cfg.propio ? cfg.user : "",
      fromName: cfg.fromName,
      enabled: cfg.enabled,
    });
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/email-config — guarda, cifrando la contraseña. */
router.put("/", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const parsed = guardarSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Datos inválidos", issues: parsed.error.issues });
    }

    const [row] = await db
      .select({ metadata: tenants.metadata })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const nuevaMeta = construirMetaCorreo(row?.metadata, parsed.data);
    await db.update(tenants).set({ metadata: nuevaMeta as any }).where(eq(tenants.id, tenantId));
    // Sin limpiar la caché, los envíos seguirían usando la config vieja hasta
    // que venza el TTL y el dueño creería que no se guardó.
    tenantManager.clearCache();

    logger.info({ tenantId }, "[CorreoNegocio] Configuración actualizada");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/** POST /api/email-config/test — verifica contra el servidor SMTP real. */
router.post("/test", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const guardada = configCorreoDe(tenant);

    // Prueba lo que se acaba de tipear si vino; si no, lo ya guardado.
    return res.json(await probarCorreo({
      host: String(req.body?.host || "").trim() || guardada.host,
      port: Number(req.body?.port) || guardada.port,
      user: String(req.body?.user || "").trim() || guardada.user,
      pass: String(req.body?.pass || "") || guardada.pass,
    }));
  } catch (err) {
    return next(err);
  }
});

export default router;
