import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, tenants, leads, conversations, messages } from "@workspace/db";
import { facebookService as fb } from "../lib/facebook";
import { whatsapp } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ─── Facebook Lead Ads Webhook ──────────────────────────────────────────────
// GET /facebook/lead-ads/webhook — Facebook verificaciòn del webhook (challenge)
router.get("/lead-ads/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;

  const verifyToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || "salesbot_verify_2024";

  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[Facebook] Webhook verificado exitosamente");
    return res.status(200).send(challenge);
  }

  logger.warn({ mode, token }, "[Facebook] Intento de verificaciòn de webhook fallido");
  return res.status(403).json({ error: "Verification failed" });
});

// POST /facebook/lead-ads/webhook — Recibir leads de Facebook Lead Ads
router.post("/lead-ads/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    logger.info({ entryCount: body.entry?.length }, "[Facebook] Lead webhook recibido");

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "leadgen") {
          const leadgenId = change.value?.leadgen_id;
          const pageId = change.value?.page_id;
          const formId = change.value?.form_id;

          if (!leadgenId) continue;

          logger.info({ leadgenId, pageId, formId }, "[Facebook] Nuevo lead recibido");

          // Obtener datos del lead desde Facebook Graph API
          const tenantId = 1;
          const [tenant] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
          const meta = tenant?.metadata ? (typeof tenant.metadata === "string" ? JSON.parse(tenant.metadata) : tenant.metadata) : {};
          const accessToken = meta.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "";

          if (!accessToken) {
            logger.warn("[Facebook] No hay token de acceso configurado para obtener lead");
            continue;
          }

          let leadData: any = null;
          try {
            const response = await fetch(
              `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${accessToken}`
            );
            leadData = await response.json();
            logger.info({ leadData }, "[Facebook] Datos del lead obtenidos");
          } catch (err: any) {
            logger.error({ err }, "[Facebook] Error obteniendo datos del lead");
            continue;
          }

          if (!leadData || leadData.error) {
            logger.error({ fbError: leadData?.error }, "[Facebook] Error en respuesta de Graph API");
            continue;
          }

          // Extraer campos del lead
          const fieldData = leadData.field_data || [];
          const getFieldValue = (name: string): string => {
            const field = fieldData.find((f: any) => f.name === name);
            return field?.values?.[0] || "";
          };

          const fullName = getFieldValue("full_name") || getFieldValue("name") || "Lead Facebook";
          const phone = getFieldValue("phone_number") || getFieldValue("phone") || getFieldValue("whatsapp") || "";
          const email = getFieldValue("email") || "";
          const city = getFieldValue("city") || "";
          const comments = getFieldValue("comments") || getFieldValue("message") || "";

          if (!phone) {
            logger.warn({ leadgenId, fullName, email }, "[Facebook] Lead sin teléfono, no se puede contactar por WhatsApp");
            continue;
          }

          // Limpiar formato de teléfono
          const cleanPhone = phone.replace(/[^0-9]/g, "");
          const phoneWithCountry = cleanPhone.startsWith("57") ? cleanPhone : `57${cleanPhone}`;

          // Crear lead en DB
          const [newLead] = await db.insert(leads).values({
            tenantId,
            name: fullName,
            phone: phoneWithCountry,
            email,
            stage: "new",
            source: "facebook_lead",
          }).returning();

          // Crear conversación
          const [newConversation] = await db.insert(conversations).values({
            tenantId,
            contactName: fullName,
            contactPhone: phoneWithCountry,
            status: "ai",
            currentStage: "greeting",
            leadId: newLead.id,
          }).returning();

          // Guardar mensaje inicial del lead
          const initialMessage = comments || `Hola, vi sus productos en Facebook y me interesa recibir información.`;
          await db.insert(messages).values({
            conversationId: newConversation.id,
            role: "customer",
            content: initialMessage,
          });

          logger.info(
            { leadId: newLead.id, conversationId: newConversation.id, phone: phoneWithCountry },
            "[Facebook] Lead creado y conversación iniciada"
          );

          // Enviar mensaje de bienvenida por WhatsApp si está conectado
          if (whatsapp.isConnected()) {
            const welcomeMessage = `¡Hola ${fullName}! 👋\n\nGracias por tu interés en nuestros productos. Soy ${meta.brandName || "Sofía"}, tu asesora virtual.\n\n¿En qué puedo ayudarte hoy?`;
            await whatsapp.sendText(phoneWithCountry, welcomeMessage);
            logger.info({ phone: phoneWithCountry }, "[Facebook] Mensaje de bienvenida enviado por WhatsApp");
          } else {
            logger.warn({ phone: phoneWithCountry }, "[Facebook] WhatsApp no conectado, no se pudo enviar bienvenida");
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[Facebook] Error procesando lead webhook");
    res.status(200).json({ received: true });
  }
});

// GET /facebook/config — leer configuración actual (desde metadata)
router.get("/config", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const [tenant] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta = tenant?.metadata ? (typeof tenant.metadata === "string" ? JSON.parse(tenant.metadata) : tenant.metadata) : {};
    const cfg = meta.facebook || {};
    return res.json({
      accessToken: cfg.accessToken ? "•••••" + cfg.accessToken.slice(-4) : "",
      pixelId: cfg.pixelId || "",
      catalogId: cfg.catalogId || "",
      pageId: cfg.pageId || "",
      adAccountId: cfg.adAccountId || "",
      hasToken: !!cfg.accessToken,
    });
  } catch (e) { return next(e); }
});

// PUT /facebook/config — guardar configuración (en metadata)
router.put("/config", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const [tenant] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta = tenant?.metadata ? (typeof tenant.metadata === "string" ? JSON.parse(tenant.metadata) : tenant.metadata) : {};
    const current = meta.facebook || {};
    const body = req.body || {};
    meta.facebook = {
      accessToken: body.accessToken || current.accessToken || "",
      pixelId: body.pixelId || current.pixelId || "",
      catalogId: body.catalogId || current.catalogId || "",
      pageId: body.pageId || current.pageId || "",
      adAccountId: body.adAccountId || current.adAccountId || "",
      appId: body.appId || current.appId || "",
      appSecret: body.appSecret || current.appSecret || "",
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

router.get("/validate", async (_req, res, next) => {
  try {
    return res.json(await fb.validate());
  } catch (e) { return next(e); }
});

router.post("/create-ad/:productId", async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const { budget, startDate, targeting } = req.body;
    const result = await fb.createAdForProduct(productId, budget || 5000, startDate, targeting);
    if (!result) return res.status(500).json({ error: "Error al crear el anuncio" });
    return res.json(result);
  } catch (e) { return next(e); }
});

router.get("/suggest-audience/:productId", async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const result = await fb.suggestAudience(productId);
    if (!result) return res.status(404).json({ error: "No se pudo generar sugerencia de audiencia" });
    return res.json(result);
  } catch (e) { return next(e); }
});

router.post("/sync-catalog", async (_req, res, next) => {
  try {
    return res.json(await fb.syncCatalog());
  } catch (e) { return next(e); }
});

export default router;
