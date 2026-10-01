import { Router, type Request, type Response } from "express";
import { db, products, conversations, messages, payments, leads } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { whatsapp } from "../lib/whatsapp-singleton";
import { logger } from "../lib/logger";
import { dbNow } from "../lib/date-utils";
import { sendOrderConfirmationEmail } from "../lib/email";
import { credencialesEmailDe } from "../lib/tenant-email-credentials";
import { credencialesDe } from "../lib/tenant-payment-credentials";
import { tenantManager } from "../lib/tenantManager";

const router = Router();

/**
 * Avisarle a Meta que hubo una COMPRA REAL (Conversions API).
 *
 * Hueco encontrado el 2026-08-19: `sendPurchaseEvent` ya existía y se llamaba
 * desde `agent.ts` cuando el agente marca la venta en la conversación, pero
 * en `routes/webhooks.ts` había CERO referencias -- justo el camino donde la
 * plata está verificada contra la pasarela (MercadoPago re-consultado por
 * /v1/payments/{id}, PayPal por IPN). O sea: las compras más confiables del
 * sistema nunca llegaban a Meta.
 *
 * Por qué importa acá y no solo el píxel del navegador: estas ventas se
 * cierran por WhatsApp, no en la web. Un snippet en el sitio no las ve nunca.
 * Sin este evento, una campaña con objetivo de compras no tiene NADA de lo
 * que aprender, por bien segmentada que esté.
 *
 * Nunca rompe el flujo: si falla, se loguea y la entrega del producto sigue.
 */
async function avisarCompraAMeta(opts: {
  tenantId: number;
  productId: number;
  amount: number;
  currency?: string;
  customerPhone?: string;
  customerEmail?: string;
  origen: string;
}): Promise<void> {
  // Punto único desde el 2026-10-01: lib/compra-verificada-meta.ts (misma
  // regla para pasarelas, comprobantes y transferencias confirmadas).
  const { avisarCompraRealAMeta } = await import("../lib/compra-verificada-meta");
  await avisarCompraRealAMeta({ ...opts, origen: opts.origen || "pasarela" });
}

/**
 * Estos webhooks ENTREGAN el producto: marcan el pago como confirmado y le
 * mandan al cliente el link de acceso real por WhatsApp. Son endpoints
 * públicos (tienen que serlo, los llama la pasarela), así que NADA de lo que
 * llega en el cuerpo se puede tomar como cierto: antes alcanzaba con un POST
 * armado a mano con `external_reference: "telefono|productId"` para llevarse
 * cualquier producto gratis, sin haber pagado nunca.
 *
 * La regla ahora: del body solo se usa el ID del pago, y con ese ID se le
 * pregunta a la pasarela si el cobro existe de verdad y está aprobado. Si no
 * se puede confirmar, no se entrega nada.
 */

/** Verifica un pago contra la API real de MercadoPago. null = no confiable. */
async function verificarPagoMercadoPago(
  paymentId: string,
  tenantId: number | null | undefined,
): Promise<{ externalReference: string; amount: number } | null> {
  try {
    const tenant = tenantId ? await tenantManager.getTenantById(tenantId) : null;
    const accessToken = (tenant ? credencialesDe(tenant).mercadopago.accessToken : "")
      || process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      logger.error({ paymentId }, "[Webhook] Sin token de MercadoPago para verificar el pago -- no se entrega nada");
      return null;
    }
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.warn({ paymentId, status: res.status }, "[Webhook] MercadoPago no reconoce este pago -- no se entrega nada");
      return null;
    }
    const pago = (await res.json()) as any;
    if (pago?.status !== "approved") {
      logger.warn({ paymentId, status: pago?.status }, "[Webhook] Pago de MercadoPago no aprobado -- no se entrega nada");
      return null;
    }
    return {
      externalReference: String(pago.external_reference || ""),
      amount: Number(pago.transaction_amount || 0),
    };
  } catch (err) {
    logger.error({ err, paymentId }, "[Webhook] Error verificando el pago con MercadoPago");
    return null;
  }
}

/**
 * Verifica una notificación IPN de PayPal reenviándosela a PayPal tal cual,
 * que responde "VERIFIED" o "INVALID" -- es el mecanismo oficial del IPN
 * clásico (el formato que usa este handler: payment_status/txn_id/custom).
 */
async function verificarIpnPayPal(body: Record<string, any>, sandbox: boolean): Promise<boolean> {
  try {
    const url = sandbox
      ? "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"
      : "https://ipnpb.paypal.com/cgi-bin/webscr";
    // PayPal exige que se le devuelvan los MISMOS campos, en el mismo orden,
    // precedidos por cmd=_notify-validate.
    const params = new URLSearchParams({ cmd: "_notify-validate" });
    for (const [k, v] of Object.entries(body)) params.append(k, String(v));
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "VentasPro-IPN" },
      body: params.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const texto = (await res.text()).trim();
    if (texto !== "VERIFIED") {
      logger.warn({ respuesta: texto, txn_id: body.txn_id }, "[Webhook-PayPal] IPN NO verificada por PayPal -- no se entrega nada");
      return false;
    }
    return true;
  } catch (err) {
    logger.error({ err }, "[Webhook-PayPal] Error verificando la IPN con PayPal");
    return false;
  }
}

router.post("/mercadopago", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    logger.info({ action: body?.action, type: body?.type }, "[Webhook] Notificación de MercadoPago recibida");

    if (body.action === "payment.created" || body.type === "payment") {
      const paymentId = body.data?.id;
      if (!paymentId) {
        res.json({ success: true });
        return;
      }

      // El external_reference ("telefono|productId") se toma de lo que
      // devuelve la API de MercadoPago, NO del cuerpo del POST -- si viniera
      // del body, cualquiera podría pedir la entrega de cualquier producto a
      // su propio número sin haber pagado.
      const refDelBody: string = body.data?.external_reference || body.external_reference || "";
      const productIdTentativo = refDelBody.includes("|") ? parseInt(refDelBody.split("|")[1] || "0") || null : null;
      const [productoTentativo] = productIdTentativo
        ? await db.select().from(products).where(eq(products.id, productIdTentativo))
        : [];

      const verificado = await verificarPagoMercadoPago(String(paymentId), productoTentativo?.tenantId);
      if (!verificado) {
        res.json({ success: true });
        return;
      }

      const externalRef = verificado.externalReference;
      let phone = "";
      let productId: number | null = null;

      if (externalRef.includes("|")) {
        const parts = externalRef.split("|");
        phone = parts[0] || "";
        productId = parseInt(parts[1] || "0") || null;
      } else {
        // Solo viene el teléfono (comportamiento legacy)
        phone = externalRef;
      }

      if (!phone || !productId) {
        logger.warn({ externalRef, paymentId }, "[Webhook] No se pudo extraer phone/productId del external_reference");
        res.json({ success: true });
        return;
      }

      const [product] = await db.select().from(products).where(eq(products.id, productId));

      if (product && product.deliveryLink) {
        // Acceso PROPIO de este comprador cuando el producto tiene cargada su
        // ruta de Terabox: enlace nuevo con clave de 4 caracteres, distinta
        // para cada venta. Si Terabox no responde --la cookie ndus vence en
        // días-- cae solo al enlace fijo de siempre: se pierde la clave, nunca
        // la venta. Ver lib/entrega-personalizada.ts.
        const { prepararEntrega, textoDeEntrega } = await import("../lib/entrega-personalizada");
        const metaProd: any = typeof product.metadata === "string"
          ? (() => { try { return JSON.parse(product.metadata as string); } catch { return {}; } })()
          : (product.metadata || {});
        const entrega = await prepararEntrega({
          id: product.id,
          name: product.name,
          deliveryLink: product.deliveryLink,
          teraboxPath: metaProd?.teraboxPath || null,
        });
        if (entrega?.origen === "fija" && entrega.motivo) {
          logger.warn({ productId: product.id, motivo: entrega.motivo }, "[Entrega] Se entregó con el enlace fijo");
        }
        const bloqueAcceso = entrega ? textoDeEntrega(entrega) : `🚀 ${product.deliveryLink}`;
        const message = `━━━━━━━━━━━━━━━━━━━━━━\n✅ *¡PAGO CONFIRMADO!* 🎉\n━━━━━━━━━━━━━━━━━━━━━━\n\n¡Hola! Tu pago por *${product.name}* ha sido verificado automáticamente.\n\nAquí tienes tu acceso de por vida:\n${bloqueAcceso}\n\n¡Espero que disfrutes mucho el contenido! Si tienes dudas, aquí estoy.`;

        let relatedConvo: any = null;

        // 1. Buscar y actualizar el registro de pago en BD
        if (productId) {
          const [pendingPayment] = await db.select()
            .from(payments)
            .where(and(
              eq(payments.productId, productId),
              eq(payments.status, 'pending')
            ))
            .orderBy(desc(payments.createdAt))
            .limit(1);

          if (pendingPayment) {
            await db.update(payments)
              .set({
                status: 'confirmed',
                paymentStatus: 'approved',
                verifiedAt: dbNow(),
                verifiedBy: 'mercadopago_webhook',
                verificationSource: 'webhook',
              })
              .where(eq(payments.id, pendingPayment.id));

            logger.info({ paymentId: pendingPayment.id, productId }, "[Webhook] Pago actualizado a 'confirmed' en BD");
          }

          // Compra REAL y verificada contra MercadoPago -> avisarle a Meta.
          // No se await a proposito: la entrega del producto al cliente no
          // puede quedar esperando a Graph API.
          void avisarCompraAMeta({
            tenantId: product.tenantId,
            productId,
            amount: Number(verificado.amount || product.price || 0),
            currency: (product as any).currency || "COP",
            customerPhone: phone,
            origen: "mercadopago_webhook",
          });

          // 2. Actualizar conversación relacionada
          // El filtro por tenant no es opcional: sin él, un pago podía
          // marcarle la conversación a OTRO negocio que tuviera una pendiente.
          [relatedConvo] = await db.select()
            .from(conversations)
            .where(and(
              eq(conversations.tenantId, product.tenantId),
              eq(conversations.paymentStatus, 'pending'),
            ))
            .orderBy(desc(conversations.createdAt))
            .limit(1);

          if (relatedConvo) {
            await db.update(conversations)
              .set({
                paymentStatus: 'confirmed',
                paidAt: dbNow(),
              })
              .where(eq(conversations.id, relatedConvo.id));

            logger.info({ conversationId: relatedConvo.id }, "[Webhook] Conversación actualizada a pago confirmado");

            // 2b. Cerrar el trato en el CRM.
            //
            // Acá estaba el agujero de la conciliación: el pago se verificaba
            // contra MercadoPago, se marcaba la conversación y se entregaba el
            // producto, pero el LEAD nunca pasaba a ganado. Por eso el panel
            // mostraba "0 ventas cerradas" e "ingresos $0" aunque alguien
            // hubiera pagado: era imposible distinguir "nadie compró" de
            // "alguien compró y el sistema no se enteró".
            //
            // Este es el ÚNICO camino que marca un trato como ganado: exige un
            // pago verificado contra la pasarela, no una conversación que
            // pintaba bien.
            if (relatedConvo.leadId) {
              const [lead] = await db.select().from(leads).where(eq(leads.id, relatedConvo.leadId)).limit(1);
              if (lead && lead.stage !== "won") {
                const monto = Number(verificado.amount || product.price || 0);
                await db.update(leads)
                  .set({ stage: "won", value: String(monto || lead.value || 0) })
                  .where(eq(leads.id, lead.id));
                logger.info({ leadId: lead.id, monto }, "[Webhook] Trato marcado como GANADO por pago verificado");
              }
            }
          }
        }

        // 3. Enviar mensaje de entrega por WhatsApp
        if (whatsapp.isConnected()) {
          await whatsapp.sendText(phone, message);
          logger.info({ phone, productName: product.name }, "[Webhook] Entrega realizada exitosamente");
        } else {
          logger.warn({ phone, productId }, "[Webhook] WhatsApp no conectado, no se pudo entregar el producto");
        }

        // 4. Enviar email de confirmación con factura y foto
        if (relatedConvo && relatedConvo.customerEmail) {
          const paymentData = body.data || {};
          await sendOrderConfirmationEmail(
            relatedConvo.customerEmail,
            relatedConvo.contactName || "Cliente",
            product.name,
            product.imageUrl || null,
            product.deliveryLink,
            parseFloat(paymentData.transaction_amount || "0"),
            product.currency || "COP",
            String(paymentId),
            "mercadopago",
            product.tenantId ?? undefined
          );
          logger.info({ email: relatedConvo.customerEmail, productName: product.name }, "[Webhook] Email de confirmación enviado");
        }
      } else {
        logger.warn({ productId, hasDeliveryLink: !!product?.deliveryLink }, "[Webhook] Producto no encontrado o sin link de entrega");
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "[Webhook] Error procesando notificación de MercadoPago");
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/paypal", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    logger.info({ payment_status: body.payment_status, txn_id: body.txn_id, custom: body.custom }, "[Webhook] Notificación PayPal recibida");

    if (body.payment_status === "Completed") {
      const custom: string = body.custom || "";
      let phone = "";
      let productId: number | null = null;

      if (custom.includes("|")) {
        const parts = custom.split("|");
        phone = parts[0] || "";
        productId = parseInt(parts[1] || "0") || null;
      }

      if (!phone || !productId) {
        logger.warn({ custom, txn_id: body.txn_id }, "[Webhook-PayPal] No se pudo extraer phone/productId del custom field");
        res.json({ success: true });
        return;
      }

      // Recién acá se le pregunta a PayPal si esta notificación es auténtica.
      // Sin este paso, un POST armado a mano con payment_status "Completed"
      // bastaba para llevarse cualquier producto gratis.
      const esSandbox = (process.env.PAYPAL_MODE || "").toLowerCase() === "sandbox";
      if (!(await verificarIpnPayPal(body, esSandbox))) {
        res.json({ success: true });
        return;
      }

      const [product] = await db.select().from(products).where(eq(products.id, productId));

      if (product && product.deliveryLink) {
        // Acceso PROPIO de este comprador cuando el producto tiene cargada su
        // ruta de Terabox: enlace nuevo con clave de 4 caracteres, distinta
        // para cada venta. Si Terabox no responde --la cookie ndus vence en
        // días-- cae solo al enlace fijo de siempre: se pierde la clave, nunca
        // la venta. Ver lib/entrega-personalizada.ts.
        const { prepararEntrega, textoDeEntrega } = await import("../lib/entrega-personalizada");
        const metaProd: any = typeof product.metadata === "string"
          ? (() => { try { return JSON.parse(product.metadata as string); } catch { return {}; } })()
          : (product.metadata || {});
        const entrega = await prepararEntrega({
          id: product.id,
          name: product.name,
          deliveryLink: product.deliveryLink,
          teraboxPath: metaProd?.teraboxPath || null,
        });
        if (entrega?.origen === "fija" && entrega.motivo) {
          logger.warn({ productId: product.id, motivo: entrega.motivo }, "[Entrega] Se entregó con el enlace fijo");
        }
        const bloqueAcceso = entrega ? textoDeEntrega(entrega) : `🚀 ${product.deliveryLink}`;
        const message = `━━━━━━━━━━━━━━━━━━━━━━\n✅ *¡PAGO CONFIRMADO!* 🎉\n━━━━━━━━━━━━━━━━━━━━━━\n\n¡Hola! Tu pago por *${product.name}* ha sido verificado automáticamente.\n\nAquí tienes tu acceso de por vida:\n${bloqueAcceso}\n\n¡Espero que disfrutes mucho el contenido! Si tienes dudas, aquí estoy.`;
        let relatedConvo: any = null;

        // Actualizar pago en BD
        if (productId) {
          const [pendingPayment] = await db.select()
            .from(payments)
            .where(and(
              eq(payments.productId, productId),
              eq(payments.status, 'pending')
            ))
            .orderBy(desc(payments.createdAt))
            .limit(1);

          if (pendingPayment) {
            await db.update(payments)
              .set({
                status: 'confirmed',
                paymentStatus: 'approved',
                verifiedAt: dbNow(),
                verifiedBy: 'paypal_ipn',
                verificationSource: 'paypal_ipn',
              })
              .where(eq(payments.id, pendingPayment.id));
          }

          // Misma logica que en MercadoPago: la compra ya paso el IPN oficial
          // de PayPal, asi que es plata real y Meta tiene que enterarse.
          void avisarCompraAMeta({
            tenantId: product.tenantId,
            productId,
            amount: Number(body.mc_gross || product.price || 0),
            currency: String(body.mc_currency || (product as any).currency || "COP"),
            customerPhone: phone,
            customerEmail: body.payer_email ? String(body.payer_email) : undefined,
            origen: "paypal_ipn",
          });

          // Actualizar conversación (con filtro de tenant: sin él, un pago
          // podía marcarle la conversación pendiente a otro negocio)
          [relatedConvo] = await db.select()
            .from(conversations)
            .where(and(
              eq(conversations.tenantId, product.tenantId),
              eq(conversations.paymentStatus, 'pending'),
            ))
            .orderBy(desc(conversations.createdAt))
            .limit(1);

          if (relatedConvo) {
            await db.update(conversations)
              .set({
                paymentStatus: 'confirmed',
                paidAt: dbNow(),
              })
              .where(eq(conversations.id, relatedConvo.id));

            // Cerrar el trato, igual que en MercadoPago: sin esto el pago se
            // verificaba y se entregaba el producto, pero el panel seguía
            // diciendo "0 ventas cerradas, $0 de ingresos".
            if (relatedConvo.leadId) {
              const [lead] = await db.select().from(leads).where(eq(leads.id, relatedConvo.leadId)).limit(1);
              if (lead && lead.stage !== "won") {
                await db.update(leads)
                  .set({ stage: "won", value: String(Number(product.price || lead.value || 0)) })
                  .where(eq(leads.id, lead.id));
                logger.info({ leadId: lead.id }, "[Webhook-PayPal] Trato marcado como GANADO por pago verificado");
              }
            }
          }
        }

        // Enviar link por WhatsApp
        if (whatsapp.isConnected()) {
          await whatsapp.sendText(phone, message);
          logger.info({ phone, productName: product.name }, "[Webhook-PayPal] Entrega realizada exitosamente");
        } else {
          logger.warn({ phone, productId }, "[Webhook-PayPal] WhatsApp no conectado, no se pudo entregar");
        }

        // Enviar email de confirmación con factura y foto
        if (relatedConvo && relatedConvo.customerEmail) {
          await sendOrderConfirmationEmail(
            relatedConvo.customerEmail,
            relatedConvo.contactName || "Cliente",
            product.name,
            product.imageUrl || null,
            product.deliveryLink,
            parseFloat(body.mc_gross || "0"),
            product.currency || "COP",
            String(body.txn_id || ""),
            "paypal",
            product.tenantId ?? undefined
          );
          logger.info({ email: relatedConvo.customerEmail, productName: product.name }, "[Webhook-PayPal] Email de confirmación enviado");
        }
      } else {
        logger.warn({ productId, hasDeliveryLink: !!product?.deliveryLink }, "[Webhook-PayPal] Producto sin link de entrega");
      }
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, "[Webhook-PayPal] Error procesando IPN de PayPal");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
