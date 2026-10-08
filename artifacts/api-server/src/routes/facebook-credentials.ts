import { Router } from "express";
import { z } from "zod";
import { db, tenants } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import {
  credencialesFacebookDe,
  enmascarar,
  probarFacebook,
} from "../lib/tenant-facebook-credentials";
import { tenantManager } from "../lib/tenantManager";
import { encryptSecret } from "../lib/credentials-vault";
import { secretoNuevo, ultimos4 } from "../lib/secretos";

/**
 * Credenciales de Facebook del negocio logueado.
 *
 * Cada cliente carga acá SUS datos de Facebook (token, página, cuenta de
 * anuncios, catálogo, pixel, app) para que sus anuncios y su catálogo usen
 * SU cuenta y no la del dueño de la plataforma.
 *
 * Los secretos NUNCA vuelven al navegador. El GET devuelve solo si están
 * configurados y los últimos caracteres. Se guardan cifrados con el mismo
 * credentials-vault que usa el resto de Facebook (para que
 * parseFacebookMeta los descifre igual).
 */
const router = Router();

const guardarSchema = z.object({
  // Vacío o ausente = "no lo toques". Mismo criterio que payment-credentials.
  accessToken: z.string().optional(),
  appSecret: z.string().optional(),
  pageId: z.string().optional(),
  adAccountId: z.string().optional(),
  pixelId: z.string().optional(),
  catalogId: z.string().optional(),
  appId: z.string().optional(),
  messengerPageToken: z.string().optional(),
  messengerVerifyToken: z.string().optional(),
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

/** GET /api/facebook/credentials — estado, sin secretos. */
router.get("/credentials", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesFacebookDe(tenant);
    const meta = await leerMetadata(tenantId);
    const fb = meta.facebook || {};

    return res.json({
      propias: cred.propias,
      configurado: !!fb.accessToken || !!fb.pageId,
      accessToken: fb.accessToken ? enmascarar(cred.accessToken) : "",
      pageId: fb.pageId || "",
      adAccountId: fb.adAccountId || "",
      pixelId: fb.pixelId || "",
      catalogId: fb.catalogId || "",
      appId: fb.appId || "",
      appSecret: fb.appSecret ? enmascarar(cred.appSecret) : "",
      messengerPageToken: fb.messengerPageToken ? enmascarar(cred.messengerPageToken) : "",
      messengerVerifyToken: fb.messengerVerifyToken ? enmascarar(cred.messengerVerifyToken) : "",
      // Para el placeholder del panel (nunca el valor).
      guardados: {
        accessToken: { tiene: !!fb.accessToken, ultimos4: ultimos4(cred.accessToken) },
        appSecret: { tiene: !!fb.appSecret, ultimos4: ultimos4(cred.appSecret) },
        messengerPageToken: { tiene: !!fb.messengerPageToken, ultimos4: ultimos4(cred.messengerPageToken) },
        messengerVerifyToken: { tiene: !!fb.messengerVerifyToken, ultimos4: ultimos4(cred.messengerVerifyToken) },
      },
      pageName: cred.pageName || "",
      tasks: cred.tasks || [],
    });
  } catch (err) {
    return next(err);
  }
});

/** PUT /api/facebook/credentials — guarda, cifrando los secretos. */
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
    const current = meta.facebook || {};
    const nuevo: any = { ...current };

    // Solo se pisa el secreto si mandaron uno NUEVO: vacío o la máscara que
    // devolvió el GET ("••••abcd") no tocan lo guardado. Antes la máscara del
    // verify token se guardaba tal cual y rompía la verificación del webhook.
    const at = secretoNuevo(b.accessToken);
    const as = secretoNuevo(b.appSecret);
    const mpt = secretoNuevo(b.messengerPageToken);
    const mvt = secretoNuevo(b.messengerVerifyToken);
    if (at) nuevo.accessToken = encryptSecret(at);
    if (as) nuevo.appSecret = encryptSecret(as);
    if (mpt) nuevo.messengerPageToken = encryptSecret(mpt);
    // El verify token lo compara el webhook en texto plano (routes/facebook.ts).
    if (mvt) nuevo.messengerVerifyToken = mvt;

    const campo = (k: keyof typeof b) => (b[k] !== undefined ? b[k] : current[k] || "");
    nuevo.pageId = campo("pageId");
    nuevo.adAccountId = campo("adAccountId");
    nuevo.pixelId = campo("pixelId");
    nuevo.catalogId = campo("catalogId");
    nuevo.appId = campo("appId");

    meta.facebook = nuevo;
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    tenantManager.clearCache();

    logger.info({ tenantId }, "[FacebookTenant] Credenciales actualizadas");
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/facebook/credentials/test — prueba contra Graph API.
 * Prueba lo que se acaba de tipear si viene en el body; si no, lo guardado.
 */
router.post("/credentials/test", async (req, res, next) => {
  try {
    const tenantId = tenantIdDe(req);
    if (!tenantId) return res.status(401).json({ error: "No autenticado" });

    const tenant = await tenantManager.getTenantById(tenantId);
    const cred = credencialesFacebookDe(tenant);

    const token = secretoNuevo(req.body?.accessToken) || cred.accessToken;
    const pageId = String(req.body?.pageId || "").trim() || cred.pageId || undefined;

    return res.json(await probarFacebook(token, pageId));
  } catch (err) {
    return next(err);
  }
});

export default router;
