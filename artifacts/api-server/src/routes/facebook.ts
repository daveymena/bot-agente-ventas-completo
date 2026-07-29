import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, tenants, leads, conversations, messages, products } from "@workspace/db";
import { facebookMessengerService as fbMessenger } from "../lib/facebook-messenger";
import { facebookCommentsService as fbComments } from "../lib/facebook-comments";
import { channelManager } from "../lib/channel-manager";
import { tenantManager } from "../lib/tenantManager";
import { adStrategist } from "../lib/ad-strategist";
import { buildPostDraft, publishToPage, checkPostingPermission } from "../lib/facebook-page-posts";
import { whatsapp } from "../lib/whatsapp";
import { logger } from "../lib/logger";

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
    meta.facebook = {
      ...(meta.facebook || {}),
      messengerPageToken: pageToken,
      accessToken: pageToken,
    };
    await db.update(tenants).set({ metadata: meta as any }).where(eq(tenants.id, tenantId));
    // Mismo motivo que en fb-connect: sin limpiar el caché, el tenant
    // sigue sirviendo el token viejo desde memoria hasta 5 minutos.
    tenantManager.clearCache();
    logger.info("[FB-Messenger] Page token saved to tenant metadata");
    return res.json({ ok: true, message: "Token guardado correctamente" });
  } catch (e) { return next(e); }
});

router.post("/marketplace/listings/:productId", async (req, res, next) => {
  try {
    const productId = parseInt(req.params.productId);
    const tenant = (req as any).tenant;
    // Mismo motivo que AdStrategist: el singleton fbMarketplace se crea SIN
    // tenant (usa el por defecto, sin .facebook), así que siempre caía a
    // variables de entorno vacías e ignoraba el token conectado en la BD.
    const { FacebookMarketplaceService } = await import("../lib/facebook-marketplace");
    const r = await new FacebookMarketplaceService(tenant || undefined).createListing(productId);
    if (!r.ok || !r.listing) return res.status(422).json({ error: r.error || "Error al crear listing" });
    return res.json(r.listing);
  } catch (e) { return next(e); }
});

router.get("/marketplace/listings", async (req, res, next) => {
  try {
    const status = (req.query.status as string) || "ACTIVE";
    const tenant = (req as any).tenant;
    const { FacebookMarketplaceService } = await import("../lib/facebook-marketplace");
    const listings = await new FacebookMarketplaceService(tenant || undefined).getListings(status as any);
    return res.json({ listings });
  } catch (e) { return next(e); }
});

router.post("/marketplace/sync", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookMarketplaceService } = await import("../lib/facebook-marketplace");
    const result = await new FacebookMarketplaceService(tenant || undefined).syncActiveProducts();
    return res.json(result);
  } catch (e) { return next(e); }
});

router.delete("/marketplace/listings/:listingId", async (req, res, next) => {
  try {
    const tenant = (req as any).tenant;
    const { FacebookMarketplaceService } = await import("../lib/facebook-marketplace");
    const ok = await new FacebookMarketplaceService(tenant || undefined).deleteListing(req.params.listingId);
    return res.json({ ok });
  } catch (e) { return next(e); }
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

router.get("/strategist/drafts", async (req, res, next) => {
  try {
    const tenantId = (req as any).tenant?.id || 1;
    const drafts = await adStrategist.getDrafts(tenantId);
    return res.json({ drafts });
  } catch (e) { return next(e); }
});

router.delete("/strategist/draft/:id", async (req, res, next) => {
  try {
    const draftId = parseInt(req.params.id);
    const ok = await adStrategist.deleteDraft(draftId);
    return res.json({ ok });
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
    const accessToken = tenant?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "";
    const { AdStrategist } = await import("../lib/ad-strategist");
    const draft = await new AdStrategist(tenant || undefined).createDraftAd(
      adAccountId,
      accessToken,
      productId
    );
    return res.json(draft);
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

router.get("/channels/status", async (_req, res, next) => {
  try {
    const status = await channelManager.getStatus();
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
    meta.facebook = {
      ...current,
      accessToken: field("accessToken"),
      pixelId: field("pixelId"),
      catalogId: field("catalogId"),
      pageId: field("pageId"),
      adAccountId: field("adAccountId"),
      appId: field("appId"),
      appSecret: field("appSecret"),
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
    return res.json(result);
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

export default router;
