/**
 * /api/whatsapp-cloud — webhook y estado del transporte WhatsApp Cloud API.
 *
 * GET  /webhook   verificación de Meta (hub.mode / hub.verify_token / hub.challenge)
 * POST /webhook   mensajes entrantes (firma X-Hub-Signature-256)
 * GET  /status    estado/configuración (sin exponer el token)
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { logger } from "../lib/logger";
import { cloudApiConfig, cloudApiHabilitada, procesarWebhookCloud } from "../lib/whatsapp-cloud-api";

const router: IRouter = Router();

function verifyCloudSignature(req: Request, res: Response, next: NextFunction) {
  const appSecret = process.env.FB_APP_SECRET || "";
  const signature = (req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"]) as string | undefined;
  const rawBody: Buffer | undefined = (req as any).rawBody;

  if (!appSecret) {
    logger.warn("[CloudAPI] FB_APP_SECRET no configurado — firma de webhook NO verificada");
    return next();
  }
  if (!signature || !rawBody) {
    return res.status(403).json({ error: "Missing signature" });
  }
  try {
    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(403).json({ error: "Invalid signature" });
    }
    return next();
  } catch (err) {
    return res.status(403).json({ error: "Signature verification error" });
  }
}

router.get("/webhook", (req: Request, res: Response) => {
  const cfg = cloudApiConfig();
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;

  if (!cfg?.verifyToken) {
    logger.error("[CloudAPI] WHATSAPP_CLOUD_VERIFY_TOKEN sin configurar — no se puede verificar el webhook");
    return res.status(503).json({ error: "Verify token not configured" });
  }
  if (mode === "subscribe" && token === cfg.verifyToken) {
    logger.info("[CloudAPI] Webhook verificado");
    return res.status(200).send(challenge);
  }
  logger.warn({ mode, token }, "[CloudAPI] Intento de verificación fallido");
  return res.status(403).json({ error: "Verification failed" });
});

router.post("/webhook", verifyCloudSignature, async (req: Request, res: Response) => {
  try {
    if (!cloudApiHabilitada()) {
      return res.status(200).json({ ok: true, recibidos: 0, nota: "Cloud API deshabilitada (WHATSAPP_CLOUD_ENABLED=false)" });
    }
    const r = await procesarWebhookCloud(req.body);
    return res.status(200).json({ ok: true, ...r });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[CloudAPI] Error procesando webhook");
    // Meta reintenta si no respondemos 200; devolver 200 evita duplicados.
    return res.status(200).json({ ok: false, error: err?.message });
  }
});

router.get("/status", (_req: Request, res: Response) => {
  const cfg = cloudApiConfig();
  res.json({
    habilitada: cloudApiHabilitada(),
    configurada: !!cfg,
    phoneNumberId: cfg?.phoneNumberId ? `${cfg.phoneNumberId.slice(0, 4)}…${cfg.phoneNumberId.slice(-4)}` : null,
    wabaId: cfg?.wabaId || null,
    tenantId: cfg?.tenantId ?? null,
    tokenHuella: cfg?.token ? `${cfg.token.slice(0, 6)}…${cfg.token.slice(-4)}` : null,
    tieneVerifyToken: !!cfg?.verifyToken,
  });
});

/** Cobro por conversación del negocio logueado (excedente sobre el plan). */
router.get("/cobro", async (req: Request, res: Response) => {
  try {
    const tenant = (req as any).tenant;
    if (!tenant?.id) return res.status(401).json({ error: "No autenticado" });
    const { resumenDeCobro } = await import("../lib/cobro-por-conversacion");
    return res.json(await resumenDeCobro(Number(tenant.id), String(tenant.plan || "free")));
  } catch (err: any) {
    return res.status(500).json({ error: err?.message });
  }
});

export default router;
