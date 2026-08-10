import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, tenants, leads, conversations, messages, products, facebookDrafts } from "@workspace/db";
import { facebookMessengerService as fbMessenger } from "../lib/facebook-messenger";
import { facebookCommentsService as fbComments } from "../lib/facebook-comments";
import { channelManager } from "../lib/channel-manager";
import { tenantManager } from "../lib/tenantManager";
import { adStrategist } from "../lib/ad-strategist";
import { buildPostDraft, publishToPage, checkPostingPermission } from "../lib/facebook-page-posts";
import { whatsapp } from "../lib/whatsapp-singleton";
import { logger } from "../lib/logger";
import { encryptSecret, decryptSecret } from "../lib/credentials-vault";

const router: IRouter = Router();

// ─── Verificación de firma de webhooks (X-Hub-Signature-256) ────────────────
// Valida que el payload venga realmente de Facebook usando el App Secret.
// Comportamiento seguro y factible: si no hay App Secret configurado o no llega
// firma, se permite el paso (con warning) para no romper despliegues existentes.
// Si ambos están presentes y NO coinciden, se rechaza con 403.
function verifyFacebookSignature(req: Request, res: Response, next: NextFunction) {
  const appSecret = process.env.FB_APP_SECRET || "";
  const signature = (req.headers["x-hub-signature-256"] || req.headers["x-hub-signature"]) as string | undefined;
  const rawBody: Buffer | undefined = (req as any).rawBody;

  if (!appSecret) {
    logger.warn("[Facebook] FB_APP_SECRET no configurado — firma de webhook NO verificada");
    return next();
  }
  if (!signature || !rawBody) {
    logger.warn("[Facebook] Webhook sin firma o sin body crudo — permitido pero sin verificar");
    return next();
  }

  try {
    const expected = "sha256=" + createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      logger.warn("[Facebook] Firma de webhook inválida — rechazado");
      return res.status(403).json({ error: "Invalid signature" });
    }
    return next();
  } catch (err) {
    logger.error({ err }, "[Facebook] Error verificando firma de webhook");
    return res.status(403).json({ error: "Signature verification error" });
  }
}

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
router.post("/lead-ads/webhook", verifyFacebookSignature, async (req: Request, res: Response) => {
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
          const accessToken = decryptSecret(meta.facebook?.accessToken) || process.env.FB_ACCESS_TOKEN || "";

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

// ─── Facebook Messenger Webhook ────────────────────────────────────────────
// GET /facebook/messenger/webhook — Facebook verification challenge
router.get("/messenger/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"] as string;
  const token = req.query["hub.verify_token"] as string;
  const challenge = req.query["hub.challenge"] as string;
  const verifyToken = process.env.FB_MESSENGER_VERIFY_TOKEN || "salesbot_messenger_2024";
  if (mode === "subscribe" && token === verifyToken) {
    logger.info("[FB-Messenger] Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: "Verification failed" });
});

// POST /facebook/messenger/webhook — Receive messages from Messenger
router.post("/messenger/webhook", verifyFacebookSignature, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.object !== "page") {
      return res.status(200).json({ received: true });
    }

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        const senderPsid = event.sender?.id;
        const messageText = event.message?.text;
        const senderName = event.sender?.name || event.message?.from?.name || "Facebook User";
        const postback = event.postback?.payload;

        if (!senderPsid) continue;

        // Ignorar ecos (mensajes enviados por la propia página) para evitar bucles infinitos
        if (event.message?.is_echo) continue;
        // Ignorar acuses de entrega/lectura (no son mensajes entrantes)
        if (event.delivery || event.read) continue;

        if (messageText) {
          await fbMessenger.handleIncomingMessage(senderPsid, messageText, senderName);
        } else if (postback) {
          await fbMessenger.handleIncomingMessage(senderPsid, postback, senderName);
        }
      }

      for (const event of entry.standby || []) {
        const senderPsid = event.sender?.id;
        const messageText = event.message?.text;
        if (senderPsid && messageText) {
          await fbMessenger.handleIncomingMessage(
            senderPsid,
            messageText,
            event.message?.from?.name || "Facebook User"
          );
        }
      }

      // Facebook envía TODOS los eventos de la página a UNA sola URL de callback.
      // Además de mensajes (entry.messaging), aquí llegan los comentarios en
      // publicaciones/anuncios como entry.changes con field "feed". Los procesamos
      // en el mismo endpoint para que una única URL de webhook cubra Messenger + comentarios.
      for (const change of entry.changes || []) {
        if (change.field === "feed") {
          const value = change.value || {};
          if (value.item === "comment" && value.verb === "add") {
            const fromId = value.from?.id || "";
            const ownPageId = process.env.FB_PAGE_ID || "";
            // No responder los comentarios de la propia página (evita bucles)
            if (fromId && fromId !== ownPageId && value.comment_id && value.message) {
              await channelManager.processMessage({
                channel: "facebook_comment",
                contactId: fromId,
                contactName: value.from?.name || "Usuario",
                text: value.message,
                metadata: { commentId: value.comment_id, postId: value.post_id || "" },
              });
            }
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[FB-Messenger] Error processing webhook");
    res.status(200).json({ received: true });
  }
});

// ─── Facebook Marketplace Webhook ──────────────────────────────────────────
router.post("/marketplace/webhook", verifyFacebookSignature, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.object !== "page") return res.status(200).json({ received: true });

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "marketplace_listings") {
          const value = change.value || {};
          const itemId = value.listing_id || value.item_id;
          const eventType = value.event_type || "unknown";
          const sellerId = value.seller_id;

          logger.info(
            { itemId, eventType, sellerId },
            "[FB-Marketplace] Webhook event received"
          );

          if (eventType === "inquiry" && value.inquirer_id) {
            const inquirerName = value.inquirer_name || "Comprador";
            const inquirerId = value.inquirer_id;
            const message = value.message || "Hola, me interesa este producto";

            await channelManager.processMessage({
              channel: "facebook_messenger",
              contactId: inquirerId,
              contactName: inquirerName,
              text: message,
              metadata: { marketplaceItemId: itemId, eventType },
            });
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[FB-Marketplace] Error processing webhook");
    res.status(200).json({ received: true });
  }
});

// ─── Facebook Comments Webhook ─────────────────────────────────────────────
router.post("/comments/webhook", verifyFacebookSignature, async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body.object !== "page") return res.status(200).json({ received: true });

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field === "feed") {
          const value = change.value || {};
          if (value.item === "comment" && value.verb === "add") {
            const commentId = value.comment_id;
            const message = value.message || "";
            const fromId = value.from?.id || "";
            const fromName = value.from?.name || "Usuario";
            const postId = value.post_id || "";

            if (commentId && message && fromId) {
              await channelManager.processMessage({
                channel: "facebook_comment",
                contactId: fromId,
                contactName: fromName,
                text: message,
                metadata: { commentId, postId },
              });
            }
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[FB-Comments] Error processing webhook");
    res.status(200).json({ received: true });
  }
});

// ─── Messenger & Marketplace Management Endpoints ──────────────────────────
// Mismo motivo que /validate, /create-ad, etc.: el singleton `fbMessenger`
// (importado arriba) se construye una sola vez sin tenant real, así que
// nunca veía el token guardado desde el dashboard. Se instancia por request.
router.get("/messenger/status", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookMessengerService } = await import("../lib/facebook-messenger");
    const svc = new FacebookMessengerService(tenant || undefined);
    const status = svc.getStatus();
    const subscribedApps = await svc.getSubscribedApps();
    return res.json({ ...status, subscribedApps });
  } catch (e) { return next(e); }
});

router.post("/messenger/subscribe", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookMessengerService } = await import("../lib/facebook-messenger");
    const ok = await new FacebookMessengerService(tenant || undefined).subscribeToWebhook();
    return res.json({ ok, message: ok ? "Suscripción exitosa" : "Error al suscribir" });
  } catch (e) { return next(e); }
});

router.get("/messenger/page-info", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookMessengerService } = await import("../lib/facebook-messenger");
    const info = await new FacebookMessengerService(tenant || undefined).getPageInfo();
    return res.json(info || { error: "No se pudo obtener info" });
  } catch (e) { return next(e); }
});

router.post("/messenger/save-token", async (req, res, next) => {
  try {
    const { pageToken } = req.body || {};
    if (!pageToken) {
      return res.status(400).json({ error: "pageToken es requerido" });
    }
    const tenantId = (req as any).tenant?.id || 1;
    const [tenant] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta = tenant?.metadata ? (typeof tenant.metadata === "string" ? JSON.parse(tenant.metadata) : tenant.metadata) : {};
    const encryptedToken = encryptSecret(pageToken);
    meta.facebook = {
      ...(meta.facebook || {}),
      messengerPageToken: encryptedToken,
      accessToken: encryptedToken,
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    // Mismo motivo que en fb-connect: sin limpiar el caché, el tenant
    // sigue sirviendo el token viejo desde memoria hasta 5 minutos.
    tenantManager.clearCache();
    logger.info("[FB-Messenger] Page token saved to tenant metadata");
    return res.json({ ok: true, message: "Token guardado correctamente" });
  } catch (e) { return next(e); }
});

router.post("/marketplace/listings/:productId", async (_req, res) => {
  return res.status(410).json({ error: "Marketplace eliminado. Esta función ya no está disponible." });
});

router.get("/marketplace/listings", async (_req, res) => {
  return res.json({ listings: [], _note: "Marketplace eliminado" });
});

router.post("/marketplace/sync", async (_req, res) => {
  return res.json({ synced: 0, failed: 0, _note: "Marketplace eliminado" });
});

router.delete("/marketplace/listings/:listingId", async (_req, res) => {
  return res.json({ ok: false, _note: "Marketplace eliminado" });
});

// ─── Ad Strategist Endpoints ───────────────────────────────────────────────
// ── Publicaciones ORGÁNICAS en la página (sin pauta) ────────────────────────

/** Diagnóstico: ¿el token puede publicar en el muro? */
router.get("/page/can-post", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const problema = await checkPostingPermission(tenant);
    return res.json({
      canPost: problema === null,
      pageId: tenant?.facebook?.pageId || process.env.FB_PAGE_ID || null,
      reason: problema,
    });
  } catch (e) { return next(e); }
});

/** Genera el texto de la publicación SIN publicar, para revisarlo antes. */
router.get("/page/post-preview/:productId", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const draft = await buildPostDraft(parseInt(req.params.productId), tenant?.slug || "demo");
    return res.json(draft);
  } catch (e: any) {
    if (e?.message === "Producto no encontrado") {
      return res.status(404).json({ error: e.message });
    }
    return next(e);
  }
});

/**
 * Publica en el muro de la página. Acción pública e irreversible desde la app
 * (borrarla hay que hacerlo en Facebook), por eso exige confirm:true explícito
 * en el body en vez de publicar con solo llamar al endpoint.
 */
router.post("/page/publish/:productId", async (req, res, next) => {
  try {
    if (req.body?.confirm !== true) {
      return res.status(400).json({
        error: "Confirmación requerida",
        detail: "Enviá { \"confirm\": true } para publicar en la página. Usá /page/post-preview para revisar el texto antes.",
      });
    }

    const tenant = (req as any).tenant;
    const draft = await buildPostDraft(parseInt(req.params.productId), tenant?.slug || "demo");

    // Permite editar el texto antes de publicar desde el panel
    if (typeof req.body?.message === "string" && req.body.message.trim()) {
      draft.message = req.body.message.trim();
    }

    const result = await publishToPage(draft, tenant);
    if (!result.ok) return res.status(502).json(result);
    return res.json(result);
  } catch (e: any) {
    if (e?.message === "Producto no encontrado") {
      return res.status(404).json({ error: e.message });
    }
    return next(e);
  }
});

// ── Centro de control de campañas ───────────────────────────────────────────
// Estas capacidades ya existían en FacebookService, pero SOLO las usaba el
// agente automático (ad-growth-agent, que además pide aprobación por
// WhatsApp): el admin no tenía forma de ver sus campañas en vivo ni de
// pausar, reactivar o cambiar el presupuesto desde el panel. Tenía que
// entrar al Administrador de Anuncios de Meta para cualquier cosa.

/** Campañas reales de la cuenta, con métricas de la ventana pedida. */
router.get("/campaigns", async (req, res, next) => {
  try {
    const { FacebookService } = await import("../lib/facebook");
    const svc = new FacebookService((req as any).tenant || undefined);
    if (!svc.isConfigured()) return res.json({ campaigns: [], totals: null, connected: false });
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    const data = await svc.getCampaignMetrics({ days });
    return res.json({ ...(data || { campaigns: [], totals: null }), connected: true, days });
  } catch (e) { return next(e); }
});

/** Conjuntos de una campaña: el presupuesto se fija acá, no en la campaña. */
router.get("/campaigns/:id/adsets", async (req, res, next) => {
  try {
    const { FacebookService } = await import("../lib/facebook");
    const svc = new FacebookService((req as any).tenant || undefined);
    return res.json({ adSets: await svc.listAdSets(req.params.id) });
  } catch (e) { return next(e); }
});

router.post("/campaigns/:id/pause", async (req, res, next) => {
  try {
    const { FacebookService } = await import("../lib/facebook");
    const ok = await new FacebookService((req as any).tenant || undefined).pauseCampaign(req.params.id);
    return res.json({ ok, message: ok ? "Campaña pausada. Deja de gastar desde ahora." : "No se pudo pausar la campaña." });
  } catch (e) { return next(e); }
});

router.post("/campaigns/:id/resume", async (req, res, next) => {
  try {
    const { FacebookService } = await import("../lib/facebook");
    const ok = await new FacebookService((req as any).tenant || undefined).resumeCampaign(req.params.id);
    return res.json({ ok, message: ok ? "Campaña reactivada. Vuelve a gastar según su presupuesto." : "No se pudo reactivar la campaña." });
  } catch (e) { return next(e); }
});

/** Presupuesto diario exacto de un conjunto de anuncios (en pesos, no %). */
router.put("/adsets/:id/budget", async (req, res, next) => {
  try {
    const monto = Number(req.body?.dailyBudget);
    const { FacebookService } = await import("../lib/facebook");
    const r = await new FacebookService((req as any).tenant || undefined).setAdSetBudget(req.params.id, monto);
    return res.json({
      ok: r.ok,
      message: r.ok ? `Presupuesto diario actualizado a $${monto.toLocaleString("es-CO")}.` : r.message,
    });
  } catch (e) { return next(e); }
});

/**
 * POST /strategist/upload-image — sube una foto propia del admin (data URL
 * base64, mismo patrón que /api/code-agent/upload) para usarla en un
 * borrador de Facebook (sola o como parte de un carrusel de varias).
 */
router.post("/strategist/upload-image", async (req, res, next) => {
  try {
    const { image, filename } = req.body || {};
    if (!image || typeof image !== "string") return res.status(400).json({ error: "Falta 'image' (data URL base64)" });
    const { saveUploadedImage } = await import("../lib/image-store");
    const rel = await saveUploadedImage(image, filename);
    if (!rel) return res.status(400).json({ error: "No se pudo guardar la imagen" });
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    return res.json({ ok: true, url: base ? `${base}${rel}` : rel, path: rel });
  } catch (e) { return next(e); }
});

router.get("/strategist/drafts", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const drafts = await adStrategist.getDrafts(tenantId);
    return res.json({ drafts });
  } catch (e) { return next(e); }
});

/**
 * GET /strategist/draft/:id/insights — métricas reales de Meta (gasto,
 * impresiones, clics, resultados) para un borrador ya publicado, así el
 * admin ve cómo va gastando/rindiendo el anuncio sin salir del panel.
 */
router.get("/strategist/draft/:id/insights", async (req, res, next) => {
  try {
    const draftId = parseInt(req.params.id);
    const [draft] = await db.select().from(facebookDrafts).where(eq(facebookDrafts.id, draftId)).limit(1);
    if (!draft) return res.status(404).json({ message: "Borrador no encontrado" });
    if (!draft.campaignId) return res.status(400).json({ message: "Este borrador todavía no tiene campaña creada en Meta" });

    const { FacebookService } = await import("../lib/facebook");
    const svc = new FacebookService((req as any).tenant || undefined);
    const allowed = ["today", "yesterday", "last_3d", "last_7d", "last_14d", "last_30d"];
    const datePreset = allowed.includes(String(req.query.datePreset)) ? String(req.query.datePreset) : "last_7d";
    const insights = await svc.getCampaignInsights(draft.campaignId, datePreset);
    return res.json({ insights, datePreset, fbStatus: draft.fbStatus });
  } catch (e) { return next(e); }
});

router.delete("/strategist/draft/:id", async (req, res, next) => {
  try {
    const draftId = parseInt(req.params.id);
    const ok = await adStrategist.deleteDraft(draftId);
    return res.json({ ok });
  } catch (e) { return next(e); }
});

// El frontend (facebook.tsx, editar borrador) ya llamaba a este PUT desde
// hace tiempo -- la ruta nunca existió del lado del servidor, así que
// "Guardar" en el modal de edición siempre daba 404 en silencio.
router.put("/strategist/draft/:id", async (req, res, next) => {
  try {
    const draftId = parseInt(req.params.id);
    const { headline, primaryText, budget, images } = req.body || {};
    const patch: Record<string, any> = { updatedAt: new Date() };
    if (typeof headline === "string") patch.headline = headline;
    if (typeof primaryText === "string") patch.primaryText = primaryText;
    if (budget !== undefined && budget !== null && budget !== "") {
      const n = Number(budget);
      if (!Number.isNaN(n)) patch.budget = n;
    }
    if (Array.isArray(images)) {
      const list = images.filter((u: any) => typeof u === "string" && u);
      patch.images = list;
      if (list[0]) patch.imageUrl = list[0];
    }
    const [updated] = await db.update(facebookDrafts).set(patch).where(eq(facebookDrafts.id, draftId)).returning();
    if (!updated) return res.status(404).json({ ok: false, message: "Borrador no encontrado" });

    // Si el borrador ya tiene anuncio real en Meta y se tocó imagen/texto,
    // hay que reconstruir el creativo -- guardar acá solo cambia la base de
    // datos, Facebook no se entera solo. Falla suave: el "Guardar" en sí
    // funcionó igual, se avisa aparte si Meta rechazó la actualización.
    let metaSync: { ok: boolean; message?: string } | null = null;
    if (updated.adId && (Array.isArray(images) || typeof headline === "string" || typeof primaryText === "string")) {
      const { AdStrategist } = await import("../lib/ad-strategist");
      metaSync = await new AdStrategist((req as any).tenant || undefined).updateDraftCreative(draftId);
    }
    return res.json({ ok: true, draft: updated, metaSync });
  } catch (e) { return next(e); }
});

router.post("/strategist/draft/:id/publish", async (req, res, next) => {
  try {
    const draftId = parseInt(req.params.id);
    const tenant = (req as any).tenant;
    // El AdStrategist compartido se construye SIN tenant (usa el tenant por
    // defecto, que no tiene .facebook), así que activar un borrador siempre
    // caía a las variables de entorno e ignoraba el token guardado en la BD
    // al conectar la página desde el panel. Se crea una instancia con el
    // tenant real de la request para que use ESE token.
    const { AdStrategist } = await import("../lib/ad-strategist");
    const ok = await new AdStrategist(tenant || undefined).publishDraft(draftId);
    return res.json({ ok, message: ok ? "Borrador publicado" : "Error al publicar (revisa que Facebook esté conectado y el borrador tenga campaña creada)" });
  } catch (e) { return next(e); }
});

router.post("/strategist/draft/:productId", async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const tenant = (req as any).tenant;
    const adAccountId = tenant?.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "";
    const accessToken = tenant?.facebook?.userAccessToken || tenant?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "";
    const { AdStrategist } = await import("../lib/ad-strategist");
    // Copy grounded en investigación real, opcional -- mismos campos que usa
    // el Arquitecto vía fb_ad_draft (ver ResearchGroundedCopy). Sin esto la
    // ruta solo podía generar desde la plantilla fija por nicho; con esto
    // también sirve para publicar campañas armadas con research hecho fuera
    // del loop del Arquitecto (que puede tardar demasiado en pedidos largos).
    const { hook, angle, primaryText, headline, description, researchNote, images, publishNow } = req.body || {};
    const grounded = (hook || angle || primaryText || headline || description || researchNote)
      ? { hook, angle, primaryText, headline, description, researchNote }
      : undefined;
    // images: fotos que el admin ya subió con su propio diseño (ver
    // POST /strategist/upload-image) -- cuando vienen, createDraftAd las usa
    // tal cual y no genera nada con IA. publishNow activa el anuncio (ya
    // creado pausado) en el mismo paso, para "ya tengo mi imagen, publicar
    // de una vez" en vez de dejarlo como borrador a revisar.
    const manualImages = Array.isArray(images) ? images.filter((u: any) => typeof u === "string" && u) : undefined;
    // whatsapp: número (o enlace wa.me) al que debe llevar el anuncio. Cambia
    // el tipo de campaña entera, no solo el botón -- ver createDraftAd.
    const wa = req.body?.whatsapp ? String(req.body.whatsapp) : "";
    const destino = wa ? ({ tipo: "whatsapp", numero: wa } as const) : undefined;
    const strategist = new AdStrategist(tenant || undefined);
    const draft = await strategist.createDraftAd(adAccountId, accessToken, productId, grounded, manualImages, destino);
    let published = false;
    if (publishNow && draft.status === "created") {
      const rows = await db.select().from(facebookDrafts).where(eq(facebookDrafts.productId, productId));
      const saved = rows[rows.length - 1];
      if (saved) published = await strategist.publishDraft(saved.id);
    }
    return res.json({ ...draft, published });
  } catch (e) { return next(e); }
});

router.post("/strategist/draft-all", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { AdStrategist } = await import("../lib/ad-strategist");
    const result = await new AdStrategist(tenant || undefined).createDraftsForAllProducts();
    return res.json(result);
  } catch (e) { return next(e); }
});

router.get("/strategist/strategy/:productId", async (req, res, next) => {
  try {
    const [product] = await db.select().from(products).where(eq(products.id, parseInt(req.params.productId))).limit(1);
    if (!product) return res.status(404).json({ error: "Producto no encontrado" });
    const strategy = adStrategist.getStrategyForProduct(product);
    const copy = await adStrategist.generateAdCopy(strategy, product);
    return res.json({ product: product.name, strategy, adCopy: copy });
  } catch (e) { return next(e); }
});

router.get("/channels/status", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const status = await channelManager.getStatus(tenantId);
    return res.json({ channels: status });
  } catch (e) { return next(e); }
});

router.post("/channels/polling/start", async (_req, res, next) => {
  try {
    channelManager.startPollingFacebookComments();
    return res.json({ ok: true, message: "Polling de comentarios iniciado" });
  } catch (e) { return next(e); }
});

router.post("/channels/polling/stop", async (_req, res, next) => {
  try {
    channelManager.stopAll();
    return res.json({ ok: true, message: "Polling detenido" });
  } catch (e) { return next(e); }
});

// GET /facebook/debug-pixels — lista los pixeles que SÍ están asociados a la
// cuenta publicitaria configurada. Existe porque el pixelId guardado puede
// pertenecer a una cuenta publicitaria distinta a la que realmente se usa
// (ver adAccountId) -- Facebook rechaza el anuncio con "Píxel no asociado"
// sin decir cuál sí lo está, así que hay que preguntarle directamente.
router.get("/debug-pixels", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookService } = await import("../lib/facebook");
    const fbSvc = new FacebookService(tenant || undefined) as any;
    const cfg = fbSvc.config;
    if (!cfg?.accessToken || !cfg?.adAccountId) {
      return res.status(422).json({ error: "Falta accessToken o adAccountId en la configuración" });
    }
    const url = `https://graph.facebook.com/v21.0/act_${cfg.adAccountId}/adspixels?fields=id,name&access_token=${cfg.accessToken}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const data = await r.json();
    return res.json(data);
  } catch (e) { return next(e); }
});

// GET /facebook/config — leer configuración actual (desde metadata o entorno)
router.get("/config", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const [tenant] = await db.select({ metadata: tenants.metadata }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const meta = tenant?.metadata ? (typeof tenant.metadata === "string" ? JSON.parse(tenant.metadata) : tenant.metadata) : {};
    const cfg = meta.facebook || {};

    // Si no hay configuración en la BD, usar valores de entorno
    const pageId = cfg.pageId || process.env.FB_PAGE_ID || "";
    const adAccountId = cfg.adAccountId || process.env.FB_AD_ACCOUNT_ID || "";
    const pixelId = cfg.pixelId || process.env.FB_PIXEL_ID || "";
    const catalogId = cfg.catalogId || "";
    // cfg.accessToken está encriptado en la BD -- desencriptar antes de armar
    // el "•••••1234" de vista previa, si no se enmascaraban los últimos 4
    // caracteres del texto cifrado (ilegibles) en vez del token real.
    const accessToken = decryptSecret(cfg.accessToken) || process.env.FB_ACCESS_TOKEN || "";
    
    return res.json({
      accessToken: accessToken ? "•••••" + accessToken.slice(-4) : "",
      pixelId,
      catalogId,
      pageId,
      adAccountId,
      hasToken: !!accessToken,
      // App ID y App Secret PROPIOS del negocio. El appId no es secreto (viaja
      // en la URL de cualquier login de Facebook), así que se devuelve tal
      // cual; del secret solo se informa si existe, nunca su valor.
      //
      // A diferencia de los campos de arriba, acá NO se cae al .env: eso
      // mostraría la app de la plataforma como si fuera la del negocio, y el
      // dueño creería que ya cargó la suya.
      appId: cfg.appId || "",
      hasAppSecret: !!decryptSecret(cfg.appSecret),
      // Tampoco caen al .env, por el mismo motivo que appId/appSecret.
      hasMessengerToken: !!decryptSecret(cfg.messengerPageToken),
      messengerVerifyToken: cfg.messengerVerifyToken || "",
      loginConfigId: cfg.loginConfigId || "",
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
    // Se hace merge sobre `current`, no un objeto nuevo con campos fijos:
    // reconstruirlo borraba messengerPageToken, tasks y pageName —o sea, al
    // guardar el pixel desde el panel se perdía la página conectada y había
    // que rehacer todo el OAuth.
    //
    // Bug: usar `body.x || current.x` no permite NUNCA limpiar un campo --
    // mandar pixelId:"" para borrarlo caía al valor anterior porque "" es
    // falsy. Se usa `in body` para distinguir "no lo mandaron" (mantener
    // el actual) de "lo mandaron vacío a propósito" (borrarlo).
    const field = (key: string) => (key in body ? body[key] : current[key] || "");
    // accessToken/appSecret llegan del formulario en texto plano y current[key]
    // ya está encriptado (viene tal cual de la BD) -- por eso se encriptan acá,
    // después de decidir field(), y no antes: si se encriptara `body` entero de
    // entrada, un PUT que NO toca el token re-encriptaría el valor ya
    // encriptado de `current` como si fuera texto plano nuevo.
    const newAccessToken = "accessToken" in body ? encryptSecret(body.accessToken) : current.accessToken || "";
    const newAppSecret = "appSecret" in body ? encryptSecret(body.appSecret) : current.appSecret || "";
    // El token de página de Messenger también es un secreto: permite escribir
    // en nombre de la página. Se cifra igual que los otros dos.
    const newMessengerToken = "messengerPageToken" in body
      ? encryptSecret(body.messengerPageToken)
      : current.messengerPageToken || "";
    meta.facebook = {
      ...current,
      accessToken: newAccessToken,
      pixelId: field("pixelId"),
      catalogId: field("catalogId"),
      pageId: field("pageId"),
      adAccountId: field("adAccountId"),
      appId: field("appId"),
      appSecret: newAppSecret,
      // Estaban en TenantContext pero no se podían cargar desde el panel:
      // dependían de que el flujo de OAuth los dejara, o del .env del
      // servidor. Sin poder editarlos, un negocio con su propia app no tenía
      // forma de conectar Messenger ni de validar sus webhooks.
      messengerPageToken: newMessengerToken,
      messengerVerifyToken: field("messengerVerifyToken"),
      // Necesario si la app usa "Facebook Login for Business": ese producto
      // ignora los permisos sueltos y exige el id de una configuración.
      loginConfigId: field("loginConfigId"),
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    tenantManager.clearCache();
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

// Los 5 endpoints de abajo usaban el singleton `fb` importado arriba, que se
// construye UNA sola vez al arrancar el proceso con
// tenantManager.getDefaultTenant() -- un objeto hardcodeado que NUNCA tiene
// `.facebook` (ni token, ni ad account id, ni page id). Resultado: pasara lo
// que pasara en "Credenciales de Facebook" del dashboard, estos botones
// siempre pegaban con credenciales vacías y fallaban (create-ad con 500
// genérico, publish-post/sync-catalog/validate silenciosamente rotos). El
// Arquitecto SÍ funcionaba porque sus tools instancian
// `new FacebookService(tenant)` por request (ver app-operator.ts); acá se
// hace exactamente lo mismo, igual que ya se hizo para Marketplace y
// AdStrategist más arriba en este archivo.
router.get("/validate", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookService } = await import("../lib/facebook");
    return res.json(await new FacebookService(tenant || undefined).validate());
  } catch (e) { return next(e); }
});

router.post("/create-ad/:productId", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const productId = parseInt(req.params.productId);
    const { budget, startDate, targeting } = req.body;
    const { FacebookService } = await import("../lib/facebook");
    const fbSvc = new FacebookService(tenant || undefined);
    if (!fbSvc.isConfigured()) {
      return res.status(422).json({ error: "Facebook no está conectado (falta el token de página). Configúralo en la pestaña Configuración." });
    }
    const result = await fbSvc.createAdForProduct(productId, budget || 5000, startDate, targeting);
    if (!result) {
      return res.status(500).json({ error: fbSvc.lastAdError || "Facebook rechazó la creación del anuncio (revisa que la cuenta publicitaria y el ad account id sean correctos, y que la página tenga permisos de anuncios)." });
    }
    // imageUrl vacío significa que no se pudo incluir imagen en el creativo
    // (el anuncio SÍ se creó pero sin foto) -- se avisa aparte para no
    // ocultarlo dentro de un 200 silencioso.
    return res.json({ ...result, imageUploadError: result.imageUrl ? null : fbSvc.lastImageError });
  } catch (e) { return next(e); }
});

router.get("/suggest-audience/:productId", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const productId = parseInt(req.params.productId);
    const { FacebookService } = await import("../lib/facebook");
    const result = await new FacebookService(tenant || undefined).suggestAudience(productId);
    if (!result) return res.status(404).json({ error: "No se pudo generar sugerencia de audiencia" });
    return res.json(result);
  } catch (e) { return next(e); }
});

router.post("/sync-catalog", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookService } = await import("../lib/facebook");
    return res.json(await new FacebookService(tenant || undefined).syncCatalog());
  } catch (e) { return next(e); }
});

// POST /facebook/publish-post — Publicar post orgánico en el muro de la página
router.post("/publish-post", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { message, imageUrl, link } = req.body || {};
    if (!message) {
      return res.status(400).json({ error: "El campo 'message' es requerido" });
    }
    const { FacebookService } = await import("../lib/facebook");
    const fbSvc = new FacebookService(tenant || undefined);
    if (!fbSvc.isConfigured()) {
      return res.status(422).json({ error: "Facebook no está conectado (falta el token de página). Configúralo en la pestaña Configuración." });
    }
    const result = await fbSvc.publishPost(message, imageUrl, link);
    if (!result) {
      return res.status(500).json({ error: "Error al publicar el post. Verifica la configuración de Facebook." });
    }
    return res.json({ ok: true, ...result });
  } catch (e) { return next(e); }
});

// ─── Agente de crecimiento (protección de gasto + revisión de tendencia) ───
// Asistido: solo sugiere por WhatsApp, nunca ejecuta solo. Estas rutas son
// de lectura/consulta para el panel; la aprobación real pasa por WhatsApp.

router.get("/agent/logs", async (req, res, next) => {
  try {
    const { adAgentLogs } = await import("@workspace/db");
    const { desc } = await import("drizzle-orm");
    const rows = await db.select().from(adAgentLogs).orderBy(desc(adAgentLogs.createdAt)).limit(100);
    return res.json({ logs: rows });
  } catch (e) { return next(e); }
});

router.post("/agent/run-now", async (req, res, next) => {
  try {
    const { runSpendProtectionCheck, runTrendReview } = await import("../lib/ad-growth-agent");
    await Promise.all([runSpendProtectionCheck(), runTrendReview()]);
    return res.json({ ok: true, message: "Revisión ejecutada -- si encontró algo, te llega por WhatsApp." });
  } catch (e) { return next(e); }
});

export default router;
