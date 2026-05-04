import { Router, type Request, type Response } from "express";
import { db, products, conversations, messages } from "@workspace/db";
import { eq } from "drizzle-orm";
import { whatsapp } from "../lib/whatsapp";
import { logger } from "../lib/logger";

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

        if (whatsapp.isConnected()) {
          await whatsapp.sendText(phone, message);
          logger.info({ phone, productName: product.name }, "[Webhook] Entrega realizada exitosamente");
        } else {
          logger.warn({ phone, productId }, "[Webhook] WhatsApp no conectado, no se pudo entregar el producto");
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

export default router;
