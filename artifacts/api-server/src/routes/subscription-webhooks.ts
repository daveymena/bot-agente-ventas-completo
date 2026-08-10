import { Router } from "express";
import { logger } from "../lib/logger";
import { SubscriptionPaymentService } from "../lib/subscription-payments";
import { db, subscriptions, tenants } from "@workspace/db";
import { dbNow } from "../lib/date-utils";
import { eq } from "drizzle-orm";
import { sendActivationTokenEmail } from "../lib/email";
import { credencialesEmailDe } from "../lib/tenant-email-credentials";
import { SAAS_PLANS, SaasPlan } from "../middleware/saasValidation";
import { credencialesDe } from "../lib/tenant-payment-credentials";

const router = Router();

const PAYPAL_API = process.env.PAYPAL_MODE === "sandbox"
  ? "https://api-m.sandbox.paypal.com"
  : "https://api-m.paypal.com";

/** Token OAuth de la app de PayPal, para poder consultar su API de verdad. */
async function paypalAccessToken(): Promise<string | null> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token || null;
  } catch (e) {
    logger.error({ e }, "[Webhook] No se pudo obtener token de PayPal para verificar");
    return null;
  }
}

/**
 * Verifica CONTRA LA API REAL DE PAYPAL que un pago exista y esté completado.
 *
 * Sin esto, el webhook de PayPal confiaba ciegamente en el cuerpo del POST:
 * cualquiera podía mandar un JSON armado a mano con
 * `event_type: "PAYMENT.CAPTURE.COMPLETED"` y `custom_id: "subscription_N"`
 * y activaba gratis la suscripción N de cualquier tenant. El webhook de
 * MercadoPago (más abajo en este archivo) nunca tuvo ese problema porque
 * siempre re-consultó la API por el id del pago; esto le da a PayPal el
 * mismo tratamiento.
 *
 * Devuelve los datos REALES del pago según PayPal (no los del body), o null
 * si no se puede verificar -- en cuyo caso no se activa nada.
 */
async function verifyPayPalCapture(captureId: string): Promise<
  { amount?: string; currency?: string; payerEmail?: string; payerName?: string; payerId?: string } | null
> {
  const token = await paypalAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${PAYPAL_API}/v2/payments/captures/${encodeURIComponent(captureId)}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.warn({ captureId, status: res.status }, "[Webhook] PayPal no reconoce este pago -- no se activa nada");
      return null;
    }
    const capture = (await res.json()) as any;
    if (capture?.status !== "COMPLETED") {
      logger.warn({ captureId, status: capture?.status }, "[Webhook] Pago de PayPal no está COMPLETED -- no se activa nada");
      return null;
    }
    return {
      amount: capture?.amount?.value,
      currency: capture?.amount?.currency_code,
      payerEmail: capture?.payer?.email_address,
      payerName: [capture?.payer?.name?.given_name, capture?.payer?.name?.surname].filter(Boolean).join(" ") || undefined,
      payerId: capture?.payer?.payer_id,
    };
  } catch (e) {
    logger.error({ e, captureId }, "[Webhook] Error verificando el pago con PayPal");
    return null;
  }
}

/**
 * Envía email con token de activación después del pago
 */
async function sendActivationEmail(subscriptionId: number): Promise<void> {
  try {
    // Obtener suscripción
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      logger.error({ subscriptionId }, "[Webhook] Suscripción no encontrada para enviar token");
      return;
    }

    if (!subscription.activationToken) {
      logger.error({ subscriptionId }, "[Webhook] Suscripción sin token de activación");
      return;
    }

    // Obtener tenant
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, subscription.tenantId))
      .limit(1);

    if (!tenant) {
      logger.error({ subscriptionId, tenantId: subscription.tenantId }, "[Webhook] Tenant no encontrado");
      return;
    }

    // Obtener nombre del plan
    const planInfo = SAAS_PLANS[subscription.plan as SaasPlan];
    const planName = planInfo?.name || subscription.plan;

    // Enviar email
    // El token de activación NO va al log: es la credencial que activa la
    // cuenta paga, y cualquiera con acceso a los logs (un dump, un panel de
    // monitoreo, un backup) podría usarla. Alcanza con saber a quién se le
    // mandó para diagnosticar.
    logger.info(
      { email: tenant.email, subscriptionId },
      "[Webhook] Enviando email con token de activación..."
    );

    const emailSent = await sendActivationTokenEmail(
      tenant.email,
      subscription.activationToken,
      planName,
      tenant.name || tenant.email.split("@")[0]
    );

    if (emailSent) {
      // Actualizar fecha de envío del token
      await db
        .update(subscriptions)
        .set({
          tokenSentAt: dbNow(),
          updatedAt: dbNow(),
        })
        .where(eq(subscriptions.id, subscriptionId));

      logger.info({ subscriptionId, email: tenant.email }, "[Webhook] ✅ Email con token enviado exitosamente");
    } else {
      logger.error({ subscriptionId, email: tenant.email }, "[Webhook] ❌ Error enviando email con token");
    }
  } catch (error) {
    logger.error({ error, subscriptionId }, "[Webhook] Error en sendActivationEmail");
  }
}

/**
 * Webhook de MercadoPago para suscripciones
 * POST /api/webhooks/subscription/mercadopago
 */
router.post("/mercadopago", async (req, res) => {
  try {
    const { type, data } = req.body;

    logger.info({ type, data }, "[Webhook] MercadoPago subscription notification received");

    // MercadoPago envía notificaciones de tipo "payment"
    if (type === "payment") {
      const paymentId = data.id;

      // Obtener detalles del pago
      const tenantId = Number(req.query.tenantId);
      const [webhookTenant] = Number.isFinite(tenantId) && tenantId > 0
        ? await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
        : [];
      const accessToken = webhookTenant
        ? credencialesDe(webhookTenant as any).mercadopago.accessToken
        : process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!accessToken) {
        logger.error("[Webhook] MercadoPago access token not configured");
        return res.status(500).json({ error: "Configuration error" });
      }

      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payment = (await paymentResponse.json()) as any;

      logger.info({ payment }, "[Webhook] MercadoPago payment details");

      // Extraer subscription ID del external_reference
      const externalReference = (payment as Record<string, any>).external_reference;
      if (!externalReference || !externalReference.startsWith("subscription_")) {
        logger.warn({ externalReference }, "[Webhook] Invalid external reference");
        return res.status(200).json({ received: true });
      }

      const subscriptionId = parseInt(externalReference.replace("subscription_", ""));

      // Verificar estado del pago
      if (payment.status === "approved") {
        // Activar suscripción
        await SubscriptionPaymentService.activateSubscription(subscriptionId, {
          paymentId: payment.id,
          payerEmail: payment.payer?.email,
          payerName: payment.payer?.first_name + " " + payment.payer?.last_name,
          payerId: payment.payer?.id,
          amount: payment.transaction_amount,
          currency: payment.currency_id,
          status: payment.status,
          statusDetail: payment.status_detail,
        });

        logger.info({ subscriptionId, paymentId }, "[Webhook] Subscription activated via MercadoPago");
        
        // Enviar email con token de activación
        try {
          await sendActivationEmail(subscriptionId);
        } catch (emailError) {
          logger.error({ emailError }, "[Webhook] Error sending activation email");
        }
      } else if (payment.status === "rejected" || payment.status === "cancelled") {
        // Marcar suscripción como fallida
        await db
          .update(subscriptions)
          .set({
            status: "failed",
            paymentStatus: payment.status,
            updatedAt: dbNow(),
          })
          .where(eq(subscriptions.id, subscriptionId));

        logger.warn({ subscriptionId, paymentId, status: payment.status }, "[Webhook] Payment failed");
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[Webhook] Error processing MercadoPago subscription webhook");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Webhook de PayPal para suscripciones
 * POST /api/webhooks/subscription/paypal
 */
router.post("/paypal", async (req, res) => {
  try {
    const event = req.body;

    logger.info({ eventType: event.event_type }, "[Webhook] PayPal subscription notification received");

    // Manejar diferentes tipos de eventos
    switch (event.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        // Extraer información del pago
        const resource = event.resource;
        const customId = resource.purchase_units?.[0]?.custom_id || resource.custom_id;

        if (!customId || !customId.startsWith("subscription_")) {
          logger.warn({ customId }, "[Webhook] Invalid custom ID");
          return res.status(200).json({ received: true });
        }

        const subscriptionId = parseInt(customId.replace("subscription_", ""));

        // NADA de lo que viene en el body se toma como cierto: solo se usa el
        // id del pago para preguntarle a PayPal si ese cobro existe de verdad
        // y está completado. Si no se puede verificar, no se activa nada
        // (antes se activaba directo desde el body -- ver verifyPayPalCapture).
        if (!resource.id) {
          logger.warn({ subscriptionId }, "[Webhook] PayPal sin id de pago -- no se activa nada");
          return res.status(200).json({ received: true });
        }
        const verified = await verifyPayPalCapture(String(resource.id));
        if (!verified) {
          logger.warn({ subscriptionId, paymentId: resource.id }, "[Webhook] Pago de PayPal NO verificado -- suscripción no activada");
          return res.status(200).json({ received: true });
        }

        // Activar suscripción con los datos REALES que devolvió PayPal
        await SubscriptionPaymentService.activateSubscription(subscriptionId, {
          paymentId: resource.id,
          payerEmail: verified.payerEmail,
          payerName: verified.payerName,
          payerId: verified.payerId,
          amount: verified.amount,
          currency: verified.currency,
          status: "approved",
        });

        logger.info({ subscriptionId, paymentId: resource.id }, "[Webhook] Subscription activated via PayPal (verificado)");
        break;
      }

      // CHECKOUT.ORDER.APPROVED significa que el comprador aprobó la orden,
      // NO que el dinero se haya cobrado -- la captura puede fallar después.
      // Activar acá daba acceso pago sin cobro confirmado. El evento que
      // importa es PAYMENT.CAPTURE.COMPLETED (arriba), o el flujo explícito
      // de /paypal/capture.
      case "CHECKOUT.ORDER.APPROVED": {
        logger.info({ orderId: event.resource?.id }, "[Webhook] PayPal: orden aprobada (aún sin cobro) -- se espera la captura");
        break;
      }

      case "PAYMENT.CAPTURE.DENIED":
      case "CHECKOUT.ORDER.VOIDED": {
        const resource = event.resource;
        const customId = resource.purchase_units?.[0]?.custom_id || resource.custom_id;

        if (customId && customId.startsWith("subscription_")) {
          const subscriptionId = parseInt(customId.replace("subscription_", ""));

          await db
            .update(subscriptions)
            .set({
              status: "failed",
              paymentStatus: "rejected",
              updatedAt: dbNow(),
            })
            .where(eq(subscriptions.id, subscriptionId));

          logger.warn({ subscriptionId, eventType: event.event_type }, "[Webhook] PayPal payment failed");
        }
        break;
      }

      default:
        logger.info({ eventType: event.event_type }, "[Webhook] Unhandled PayPal event type");
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    logger.error({ error }, "[Webhook] Error processing PayPal subscription webhook");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Endpoint para capturar pago de PayPal después de la aprobación
 * POST /api/webhooks/subscription/paypal/capture
 */
router.post("/paypal/capture", async (req, res) => {
  try {
    const { orderId, subscriptionId } = req.body;

    if (!orderId || !subscriptionId) {
      return res.status(400).json({ error: "Missing orderId or subscriptionId" });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "PayPal credentials not configured" });
    }

    // Obtener token de acceso
    const authResponse = await fetch("https://api-m.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Language": "en_US",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const authData = (await authResponse.json()) as { access_token: string };

    // Capturar el pago
    const captureResponse = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authData.access_token}`,
      },
    });

    const captureData = (await captureResponse.json()) as any;

    if ((captureData as Record<string, any>).status === "COMPLETED") {
      // Activar suscripción
      const capture = (captureData as Record<string, any>).purchase_units[0].payments.captures[0];
      await SubscriptionPaymentService.activateSubscription(subscriptionId, {
        paymentId: capture.id,
        payerEmail: (captureData as Record<string, any>).payer?.email_address,
        payerName: (captureData as Record<string, any>).payer?.name?.given_name + " " + (captureData as Record<string, any>).payer?.name?.surname,
        payerId: (captureData as Record<string, any>).payer?.payer_id,
        amount: capture.amount.value,
        currency: capture.amount.currency_code,
        status: "approved",
      });

      logger.info({ subscriptionId, orderId }, "[Webhook] PayPal payment captured and subscription activated");

      return res.json({ success: true, captureData });
    } else {
      logger.warn({ subscriptionId, orderId, status: (captureData as Record<string, any>).status }, "[Webhook] PayPal capture failed");
      return res.status(400).json({ error: "Payment capture failed", details: captureData });
    }
  } catch (error) {
    logger.error({ error }, "[Webhook] Error capturing PayPal payment");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
