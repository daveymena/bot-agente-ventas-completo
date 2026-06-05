/**
 * 📧 Notification Service para enviar confirmaciones a la empresa
 * Maneja envíos a WhatsApp, email y almacenamiento en BD
 */

import { db, payments } from "@workspace/db";
import { logger } from "./logger";

export interface CompanyNotification {
  customerName?: string;
  customerEmail: string;
  customerPhone: string;
  productName: string;
  productId: number;
  price: number;
  paymentMethod: string;
  conversationId: number;
  timestamp: Date;
}

/**
 * Envía confirmación de compra a la empresa vía WhatsApp y email
 */
export async function notifyCompanyOfPurchase(
  notification: CompanyNotification,
  companyContacts: {
    whatsappNumber: string;
    email: string;
    name?: string;
  }
): Promise<{ success: boolean; whatsappSent: boolean; emailSent: boolean; error?: string }> {
  try {
    let whatsappSent = false;
    let emailSent = false;

    // 1️⃣ Enviar vía WhatsApp si está configurado
    if (companyContacts.whatsappNumber && process.env.TWILIO_ACCOUNT_SID) {
      whatsappSent = await sendWhatsAppNotification(notification, companyContacts.whatsappNumber);
    }

    // 2️⃣ Enviar vía Email si está configurado
    if (companyContacts.email && process.env.SENDGRID_API_KEY) {
      emailSent = await sendEmailNotification(notification, companyContacts);
    }

    // 3️⃣ Guardar en BD para registro y seguimiento
    await storeConfirmationInDatabase(notification);

    logger.info({
      notification,
      whatsappSent,
      emailSent,
      timestamp: new Date().toISOString()
    }, "✅ [NOTIFICATION] Confirmación de compra procesada");

    return {
      success: true,
      whatsappSent,
      emailSent
    };
  } catch (error) {
    logger.error({
      notification,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, "❌ [NOTIFICATION] Error al procesar confirmación de compra");

    return {
      success: false,
      whatsappSent: false,
      emailSent: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Envía notificación vía WhatsApp usando Twilio
 */
async function sendWhatsAppNotification(
  notification: CompanyNotification,
  whatsappNumber: string
): Promise<boolean> {
  try {
    const twilio = require("twilio");
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    const message = `
🎉 NUEVA CONFIRMACIÓN DE COMPRA

👤 Cliente: ${notification.customerName || "N/A"}
📧 Email: ${notification.customerEmail}
📱 Teléfono: ${notification.customerPhone}

📚 Producto: ${notification.productName}
💰 Precio: $${notification.price.toLocaleString("es-CO")}
💳 Método: ${notification.paymentMethod}

⏰ Hora: ${notification.timestamp.toLocaleString("es-CO")}
🔗 Conversación: #${notification.conversationId}

⚠️ Por favor confirmar y procesar el pago
    `.trim();

    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: `whatsapp:${whatsappNumber}`,
      body: message
    });

    logger.info({ whatsappNumber }, "✅ Notificación WhatsApp enviada");
    return true;
  } catch (error) {
    logger.error({ error }, "❌ Error al enviar WhatsApp");
    return false;
  }
}

/**
 * Envía notificación vía Email usando SendGrid
 */
async function sendEmailNotification(
  notification: CompanyNotification,
  companyContacts: { email: string; name?: string }
): Promise<boolean> {
  try {
    const sgMail = require("@sendgrid/mail");
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const emailContent = `
<!DOCTYPE html>
<html>
  <head>
    <style>
      body { font-family: Arial, sans-serif; color: #333; }
      .header { background: #2E7D32; color: white; padding: 20px; border-radius: 5px; }
      .section { margin: 20px 0; }
      .section h3 { color: #2E7D32; border-bottom: 2px solid #2E7D32; padding-bottom: 10px; }
      .detail { margin: 10px 0; }
      .label { font-weight: bold; color: #666; }
      .value { color: #333; }
      .alert { background: #FFF3CD; padding: 15px; border-left: 4px solid #FFC107; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="header">
      <h2>🎉 NUEVA CONFIRMACIÓN DE COMPRA</h2>
    </div>
    
    <div class="section">
      <h3>👤 Información del Cliente</h3>
      <div class="detail">
        <span class="label">Nombre:</span>
        <span class="value">${notification.customerName || "N/A"}</span>
      </div>
      <div class="detail">
        <span class="label">Email:</span>
        <span class="value">${notification.customerEmail}</span>
      </div>
      <div class="detail">
        <span class="label">Teléfono:</span>
        <span class="value">${notification.customerPhone}</span>
      </div>
    </div>
    
    <div class="section">
      <h3>📚 Detalles del Producto</h3>
      <div class="detail">
        <span class="label">Producto:</span>
        <span class="value">${notification.productName}</span>
      </div>
      <div class="detail">
        <span class="label">ID:</span>
        <span class="value">${notification.productId}</span>
      </div>
      <div class="detail">
        <span class="label">Precio:</span>
        <span class="value">$${notification.price.toLocaleString("es-CO")}</span>
      </div>
    </div>
    
    <div class="section">
      <h3>💳 Información de Pago</h3>
      <div class="detail">
        <span class="label">Método:</span>
        <span class="value">${notification.paymentMethod}</span>
      </div>
      <div class="detail">
        <span class="label">Fecha/Hora:</span>
        <span class="value">${notification.timestamp.toLocaleString("es-CO")}</span>
      </div>
      <div class="detail">
        <span class="label">ID Conversación:</span>
        <span class="value">#${notification.conversationId}</span>
      </div>
    </div>
    
    <div class="alert">
      ⚠️ Por favor confirmar y procesar el pago dentro de los próximos 30 minutos
    </div>
    
    <p style="color: #999; font-size: 12px; margin-top: 30px;">
      Este es un mensaje automático del sistema de ventas de ${companyContacts.name || "TecnoVariedades"}
    </p>
  </body>
</html>
    `.trim();

    await sgMail.send({
      to: companyContacts.email,
      from: process.env.SENDGRID_FROM_EMAIL || "noreply@empresa.com",
      subject: `🎉 Nueva Confirmación de Compra - ${notification.productName}`,
      html: emailContent
    });

    logger.info({ email: companyContacts.email }, "✅ Notificación email enviada");
    return true;
  } catch (error) {
    logger.error({ error }, "❌ Error al enviar email");
    return false;
  }
}

/**
 * Almacena la confirmación en la BD para registro y análisis
 */
  async function storeConfirmationInDatabase(notification: CompanyNotification): Promise<void> {
  try {
    const amountStr = String(notification.price);
    const methodKey = notification.paymentMethod.toLowerCase().replace(/[^a-z]/g, '');
    const methodMap: Record<string, string> = {
      nequi: 'nequi', daviplata: 'daviplata', transferencia: 'transferencia',
      paypal: 'paypal', mercadopago: 'mercadopago', efectivo: 'efectivo',
    };
    const method = methodMap[methodKey] || 'otro';

    await db.insert(payments).values({
      conversationId: notification.conversationId,
      productId: notification.productId,
      amount: amountStr,
      currency: 'COP',
      method,
      status: 'pending',
      paymentStatus: 'pending',
      payerName: notification.customerName,
      payerEmail: notification.customerEmail,
      payerPhone: notification.customerPhone,
      verificationSource: 'self_declared',
      notes: `Confirmacion de compra recibida por ${notification.paymentMethod}`,
    });

    logger.info({ notification }, "Confirmacion almacenada en BD como pago pendiente");
  } catch (error) {
    logger.error({ error }, "Error al almacenar en BD");
  }
}

/**
 * Obtiene los contactos de la empresa desde variables de entorno o BD
 */
export function getCompanyContacts(): {
  whatsappNumber: string;
  email: string;
  name: string;
} {
  return {
    whatsappNumber: process.env.COMPANY_WHATSAPP_NUMBER || "+57 123 456 7890",
    email: process.env.COMPANY_EMAIL || "info@empresa.com",
    name: process.env.COMPANY_NAME || "TecnoVariedades"
  };
}
