import { logger } from "./logger";
import { db, subscriptions, paymentTransactions, tenants } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { SAAS_PLANS, SaasPlan, getMonthlyPrice } from "../middleware/saasValidation";
import * as crypto from "crypto";

/**
 * Genera un token único de activación
 */
function generateActivationToken(plan: string, subscriptionId: number): string {
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString("hex");
  const data = `${plan}-${subscriptionId}-${timestamp}-${random}`;
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 32).toUpperCase();
}

export interface CreateSubscriptionPaymentParams {
  tenantId: number;
  plan: SaasPlan;
  billingCycle: "monthly" | "annual";
  paymentMethod: "mercadopago" | "paypal";
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PaymentLinkResult {
  paymentUrl: string;
  paymentId: string;
  subscriptionId: number;
  amount: number;
  currency: string;
}

/**
 * Servicio para gestionar pagos de suscripciones
 */
export class SubscriptionPaymentService {
  /**
   * Crea un enlace de pago para una suscripción
   */
  static async createPaymentLink(params: CreateSubscriptionPaymentParams): Promise<PaymentLinkResult> {
    const { tenantId, plan, billingCycle, paymentMethod, returnUrl, cancelUrl } = params;

    logger.info({ params }, "[SubscriptionPayment] Iniciando creación de enlace de pago");

    // Validar que el plan existe
    if (!SAAS_PLANS[plan]) {
      logger.error({ plan }, "[SubscriptionPayment] Plan inválido");
      throw new Error(`Plan inválido: ${plan}`);
    }

    // Calcular el monto
    const monthlyPrice = getMonthlyPrice(plan);
    const amount = billingCycle === "annual" ? monthlyPrice * 12 * 0.8 : monthlyPrice; // 20% descuento anual
    const currency = "USD";

    logger.info({ plan, amount, currency, billingCycle }, "[SubscriptionPayment] Monto calculado");

    // Obtener información del tenant
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) {
      logger.error({ tenantId }, "[SubscriptionPayment] Tenant no encontrado");
      throw new Error(`Tenant no encontrado: ${tenantId}`);
    }

    logger.info({ tenantId, tenantEmail: tenant.email }, "[SubscriptionPayment] Tenant encontrado");

    // Crear registro de suscripción pendiente
    logger.info("[SubscriptionPayment] Creando registro de suscripción en BD...");
    
    // Generar token de activación único
    const tempSubscriptionId = Date.now(); // Temporal para generar token
    const activationToken = generateActivationToken(plan, tempSubscriptionId);
    
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        tenantId,
        plan,
        status: "pending",
        billingCycle,
        paymentMethod,
        amount: amount.toString(),
        currency,
        autoRenew: true,
        activationToken, // Token único para activar después del pago
        metadata: {
          planDetails: SAAS_PLANS[plan],
          createdBy: "subscription-payment-service",
        },
      })
      .returning();

    logger.info(
      { subscriptionId: subscription.id, tenantId, plan, amount, activationToken },
      "[SubscriptionPayment] Suscripción creada en BD con token de activación"
    );

    // Generar enlace de pago según el método
    let paymentUrl: string;
    let paymentId: string;

    logger.info({ paymentMethod }, "[SubscriptionPayment] Generando enlace de pago...");

    try {
      if (paymentMethod === "mercadopago") {
        const result = await this.createMercadoPagoPayment(tenant, subscription, amount, currency, returnUrl, cancelUrl);
        paymentUrl = result.paymentUrl;
        paymentId = result.paymentId;
      } else if (paymentMethod === "paypal") {
        const result = await this.createPayPalPayment(tenant, subscription, amount, currency, returnUrl, cancelUrl);
        paymentUrl = result.paymentUrl;
        paymentId = result.paymentId;
      } else {
        throw new Error(`Método de pago no soportado: ${paymentMethod}`);
      }
    } catch (error: any) {
      logger.error({ error, paymentMethod, subscriptionId: subscription.id }, "[SubscriptionPayment] Error generando enlace de pago");
      
      // Marcar suscripción como fallida
      await db
        .update(subscriptions)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(subscriptions.id, subscription.id));
      
      throw error;
    }

    // Actualizar suscripción con el payment ID
    await db
      .update(subscriptions)
      .set({
        paymentId,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, subscription.id));

    logger.info(
      { subscriptionId: subscription.id, paymentId, paymentUrl },
      "[SubscriptionPayment] Enlace de pago generado"
    );

    return {
      paymentUrl,
      paymentId,
      subscriptionId: subscription.id,
      amount,
      currency,
    };
  }

  /**
   * Crea un pago en MercadoPago
   */
  private static async createMercadoPagoPayment(
    tenant: any,
    subscription: any,
    amount: number,
    currency: string,
    returnUrl?: string,
    cancelUrl?: string
  ): Promise<{ paymentUrl: string; paymentId: string }> {
    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    
    logger.info("[SubscriptionPayment] Iniciando creación de pago MercadoPago");
    
    if (!accessToken) {
      logger.error("[SubscriptionPayment] MercadoPago access token no configurado");
      throw new Error("MercadoPago no está configurado. Por favor contacta al administrador.");
    }

    const appUrl = process.env.APP_URL || "https://tecnovariedades.easypanel.host";
    const planDetails = SAAS_PLANS[subscription.plan as SaasPlan];

    // Convertir a COP si es necesario (MercadoPago Colombia usa COP)
    const amountCOP = amount * 4000; // 1 USD = 4000 COP aproximadamente

    const requestBody = {
      items: [
        {
          id: `subscription_${subscription.id}`,
          title: `Plan ${planDetails.name} - ${subscription.billingCycle === "annual" ? "Anual" : "Mensual"}`,
          description: `Suscripción al plan ${planDetails.name}`,
          quantity: 1,
          currency_id: "COP",
          unit_price: amountCOP,
        },
      ],
      payer: {
        email: tenant.email,
        name: tenant.name,
      },
      back_urls: {
        success: returnUrl || `${appUrl}/subscription-success`,
        failure: cancelUrl || `${appUrl}/subscription-failure`,
        pending: `${appUrl}/subscription-pending`,
      },
      notification_url: `${appUrl}/api/webhooks/subscription/mercadopago`,
      external_reference: `subscription_${subscription.id}`,
      auto_return: "approved",
      metadata: {
        subscription_id: subscription.id,
        tenant_id: tenant.id,
        plan: subscription.plan,
        billing_cycle: subscription.billingCycle,
      },
    };

    logger.info({ requestBody }, "[SubscriptionPayment] Request body para MercadoPago");

    try {
      const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json();
      
      logger.info({ status: response.status, data }, "[SubscriptionPayment] Response de MercadoPago");

      if (!response.ok) {
        logger.error({ status: response.status, data }, "[SubscriptionPayment] Error en respuesta de MercadoPago");
        throw new Error(data.message || `Error de MercadoPago: ${response.status}`);
      }

      logger.info({ paymentUrl: data.init_point, paymentId: data.id }, "[SubscriptionPayment] Enlace de MercadoPago creado exitosamente");

      return {
        paymentUrl: data.init_point,
        paymentId: data.id,
      };
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, "[SubscriptionPayment] Error creando pago MercadoPago");
      
      if (error.name === 'AbortError') {
        throw new Error("Timeout al conectar con MercadoPago. Por favor intenta nuevamente.");
      }
      
      throw new Error(`Error al crear pago con MercadoPago: ${error.message}`);
    }
  }

  /**
   * Crea un pago en PayPal
   */
  private static async createPayPalPayment(
    tenant: any,
    subscription: any,
    amount: number,
    currency: string,
    returnUrl?: string,
    cancelUrl?: string
  ): Promise<{ paymentUrl: string; paymentId: string }> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("PayPal credentials no configuradas");
    }

    const appUrl = process.env.APP_URL || "https://tecnovariedades.easypanel.host";
    const planDetails = SAAS_PLANS[subscription.plan as SaasPlan];

    try {
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
        signal: AbortSignal.timeout(10000),
      });

      const authData = await authResponse.json();
      if (!authResponse.ok) {
        throw new Error("Error autenticando con PayPal");
      }

      // Crear orden de pago
      const orderResponse = await fetch("https://api-m.paypal.com/v2/checkout/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authData.access_token}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: `subscription_${subscription.id}`,
              description: `Plan ${planDetails.name} - ${subscription.billingCycle === "annual" ? "Anual" : "Mensual"}`,
              amount: {
                currency_code: currency,
                value: amount.toFixed(2),
              },
              custom_id: `subscription_${subscription.id}`,
            },
          ],
          application_context: {
            brand_name: "Sofía AI Sales",
            return_url: returnUrl || `${appUrl}/subscription-success`,
            cancel_url: cancelUrl || `${appUrl}/subscription-failure`,
            user_action: "PAY_NOW",
          },
        }),
        signal: AbortSignal.timeout(10000),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok) {
        throw new Error(orderData.message || "Error creando orden de PayPal");
      }

      // Encontrar URL de aprobación
      const approvalUrl = orderData.links?.find((link: any) => link.rel === "approve")?.href;
      if (!approvalUrl) {
        throw new Error("No se encontró URL de aprobación de PayPal");
      }

      return {
        paymentUrl: approvalUrl,
        paymentId: orderData.id,
      };
    } catch (error: any) {
      logger.error({ error, subscriptionId: subscription.id }, "[SubscriptionPayment] Error PayPal");
      throw new Error(`Error creando pago PayPal: ${error.message}`);
    }
  }

  /**
   * Activa una suscripción después de un pago exitoso
   */
  static async activateSubscription(subscriptionId: number, paymentData: any): Promise<void> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, subscriptionId))
      .limit(1);

    if (!subscription) {
      throw new Error(`Suscripción no encontrada: ${subscriptionId}`);
    }

    // Calcular fechas
    const now = new Date();
    const expiresAt = new Date(now);
    if (subscription.billingCycle === "annual") {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Actualizar suscripción
    await db
      .update(subscriptions)
      .set({
        status: "active",
        paymentStatus: "approved",
        startedAt: now,
        expiresAt,
        nextBillingDate: expiresAt,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));

    // Actualizar tenant
    await db
      .update(tenants)
      .set({
        plan: subscription.plan,
        status: "active",
        subscriptionId: subscriptionId.toString(),
        subscriptionStatus: "active",
        subscriptionEndsAt: expiresAt,
        updatedAt: now,
      })
      .where(eq(tenants.id, subscription.tenantId));

    // Registrar transacción
    await db.insert(paymentTransactions).values({
      subscriptionId,
      tenantId: subscription.tenantId,
      paymentMethod: subscription.paymentMethod,
      paymentId: paymentData.paymentId || subscription.paymentId,
      paymentStatus: "approved",
      amount: subscription.amount,
      currency: subscription.currency,
      plan: subscription.plan,
      billingCycle: subscription.billingCycle,
      payerEmail: paymentData.payerEmail,
      payerName: paymentData.payerName,
      payerId: paymentData.payerId,
      webhookData: paymentData,
      paidAt: now,
    });

    logger.info(
      { subscriptionId, tenantId: subscription.tenantId, plan: subscription.plan },
      "[SubscriptionPayment] Suscripción activada exitosamente"
    );
  }

  /**
   * Cancela una suscripción
   */
  static async cancelSubscription(subscriptionId: number): Promise<void> {
    const now = new Date();

    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        cancelledAt: now,
        autoRenew: false,
        updatedAt: now,
      })
      .where(eq(subscriptions.id, subscriptionId));

    logger.info({ subscriptionId }, "[SubscriptionPayment] Suscripción cancelada");
  }

  /**
   * Obtiene la suscripción activa de un tenant
   */
  static async getActiveSubscription(tenantId: number): Promise<any | null> {
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.tenantId, tenantId), eq(subscriptions.status, "active")))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    return subscription || null;
  }

  /**
   * Obtiene el historial de transacciones de un tenant
   */
  static async getPaymentHistory(tenantId: number): Promise<any[]> {
    const transactions = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.tenantId, tenantId))
      .orderBy(desc(paymentTransactions.createdAt));

    return transactions;
  }

  /**
   * Verifica si una suscripción ha expirado y la actualiza
   */
  static async checkExpiredSubscriptions(): Promise<void> {
    const now = new Date();

    // Buscar suscripciones activas que hayan expirado
    const expiredSubscriptions = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.status, "active")));

    for (const subscription of expiredSubscriptions) {
      if (subscription.expiresAt && new Date(subscription.expiresAt) < now) {
        // Marcar como expirada
        await db
          .update(subscriptions)
          .set({
            status: "expired",
            updatedAt: now,
          })
          .where(eq(subscriptions.id, subscription.id));

        // Actualizar tenant a plan free
        await db
          .update(tenants)
          .set({
            plan: "free",
            status: "active",
            subscriptionStatus: "expired",
            updatedAt: now,
          })
          .where(eq(tenants.id, subscription.tenantId));

        logger.info(
          { subscriptionId: subscription.id, tenantId: subscription.tenantId },
          "[SubscriptionPayment] Suscripción expirada"
        );
      }
    }
  }
}
