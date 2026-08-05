import { Router, type Request, type Response } from "express";
import { db, products, conversations, messages, payments } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { whatsapp } from "../lib/whatsapp-singleton";
import { logger } from "../lib/logger";
import { dbNow } from "../lib/date-utils";
import { sendOrderConfirmationEmail } from "../lib/email";
import { credencialesEmailDe } from "../lib/tenant-email-credentials";

const router = Router();

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

      // Extraer el external_reference que contiene el teléfono del cliente y el productId
      // Formato esperado: "phone|productId" o solo el teléfono
      const externalRef: string = body.data?.external_reference || body.external_reference || "";
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
        const message = `━━━━━━━━━━━━━━━━━━━━━━\n✅ *¡PAGO CONFIRMADO!* 🎉\n━━━━━━━━━━━━━━━━━━━━━━\n\n¡Hola! Tu pago por *${product.name}* ha sido verificado automáticamente.\n\nAquí tienes tu acceso de por vida:\n🚀 ${product.deliveryLink}\n\n¡Espero que disfrutes mucho el contenido! Si tienes dudas, aquí estoy.`;

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

          // 2. Actualizar conversación relacionada
          [relatedConvo] = await db.select()
            .from(conversations)
            .where(and(
              eq(conversations.paymentStatus, 'pending'),
              eq(conversations.currentProductId, productId)
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

      const [product] = await db.select().from(products).where(eq(products.id, productId));

      if (product && product.deliveryLink) {
        const message = `━━━━━━━━━━━━━━━━━━━━━━\n✅ *¡PAGO CONFIRMADO!* 🎉\n━━━━━━━━━━━━━━━━━━━━━━\n\n¡Hola! Tu pago por *${product.name}* ha sido verificado automáticamente.\n\nAquí tienes tu acceso de por vida:\n🚀 ${product.deliveryLink}\n\n¡Espero que disfrutes mucho el contenido! Si tienes dudas, aquí estoy.`;
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

          // Actualizar conversación
          [relatedConvo] = await db.select()
            .from(conversations)
            .where(and(
              eq(conversations.paymentStatus, 'pending'),
              eq(conversations.currentProductId, productId)
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
