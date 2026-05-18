/**
 * 🎯 Payment Confirmation Handler
 * Maneja confirmaciones de pago y envía información a la empresa para aprobación
 */

import { notifyCompanyOfPurchase, getCompanyContacts } from "./notification-service";
import { logger } from "./logger";

export interface PaymentConfirmation {
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  productName: string;
  productId: number;
  price: number;
  paymentMethod: string;
  timestamp: Date;
  conversationId: number;
}

/**
 * Detecta si el cliente está confirmando una compra (no es una pregunta repetida)
 */
export function isPaymentConfirmation(
  text: string,
  previousMessagesCount: number,
  sentCards: Set<number>,
  currentProductId?: number
): boolean {
  const lowerText = text.toLowerCase();
  
  // Palabras clave de confirmación
  const confirmationKeywords = [
    'confirmo', 'confirmó', 'confirmado', 'dale', 'vamos', 'adelante',
    'sí, compro', 'si compro', 'quiero comprarlo', 'lo quiero',
    'me lo envían', 'procedo', 'realizo el pago'
  ];
  
  // Solo es confirmación si:
  // 1. Contiene palabras clave de confirmación
  // 2. Ya se mostró la tarjeta (sentCards no está vacío)
  // 3. Es relativamente corto (no es una pregunta detallada)
  
  const hasConfirmationKeyword = confirmationKeywords.some(k => lowerText.includes(k));
  const cardWasShown = sentCards.size > 0;
  const textIsShort = text.split(' ').length < 20;
  
  return hasConfirmationKeyword && cardWasShown && textIsShort;
}

/**
 * Detecta si es una pregunta sobre método de pago (después de ver tarjeta)
 */
export function isPaymentMethodQuestion(
  text: string,
  sentCards: Set<number>
): boolean {
  const lowerText = text.toLowerCase();
  
  // Solo información de método de pago, sin detalles del producto
  const paymentMethodKeywords = [
    'qué métodos', 'cuáles métodos', 'cómo pago', 'formas de pago',
    'aceptan nequi', 'aceptan daviplata', 'tarjeta', 'transferencia',
    'cuotas', 'financiamiento', 'efectivo'
  ];
  
  const hasPaymentMethodKeyword = paymentMethodKeywords.some(k => lowerText.includes(k));
  const cardWasShown = sentCards.size > 0;
  
  // Es pregunta de método si se mostró tarjeta y pregunta específicamente por método
  return hasPaymentMethodKeyword && cardWasShown;
}

/**
 * Detecta si es una pregunta sobre detalles del producto (ya mostrado)
 */
export function isProductDetailsQuestion(
  text: string,
  sentCards: Set<number>,
  currentProductId?: number
): boolean {
  const lowerText = text.toLowerCase();
  
  // Preguntas sobre características, acceso, duración, etc.
  const detailsKeywords = [
    'cuánto dura', 'cuántas lecciones', 'cuántas horas', 'cuántos módulos',
    'cómo accedo', 'cómo funciona', 'qué incluye', 'está incluido',
    'certificado', 'soporte', 'garantía', 'devuelvo', 'cambio',
    'cuándo empiezo', 'cuándo me envían'
  ];
  
  const hasDetailsKeyword = detailsKeywords.some(k => lowerText.includes(k));
  const cardWasShown = sentCards.size > 0;
  
  return hasDetailsKeyword && cardWasShown;
}

/**
 * Formato de mensaje para enviar a la empresa
 */
export function formatConfirmationForCompany(confirmation: PaymentConfirmation): string {
  return `
🎉 NUEVA CONFIRMACIÓN DE COMPRA

Cliente:
  📧 Email: ${confirmation.customerEmail}
  📱 Teléfono: ${confirmation.customerPhone}
  👤 ID: ${confirmation.customerId}

Producto:
  📚 Nombre: ${confirmation.productName}
  💰 Precio: $${confirmation.price}

Pago:
  💳 Método: ${confirmation.paymentMethod}
  ⏰ Hora: ${confirmation.timestamp.toLocaleString('es-CO')}
  🔗 Conversación: #${confirmation.conversationId}

⚠️ Acción requerida: Por favor confirmar y procesar el pago
`;
}

/**
 * Plantilla de respuesta cuando pregunta por método de pago (después de ver tarjeta)
 */
export function getPaymentMethodResponse(paymentMethods: string[]): string {
  return `✅ Aceptamos los siguientes métodos de pago:

${paymentMethods.map(m => `• ${m}`).join('\n')}

El enlace de pago está en el mensaje anterior. ¿Necesitas ayuda con algo más?`;
}

/**
 * Plantilla de respuesta para confirmación de compra
 */
export function getConfirmationResponse(productName: string, companyContact: { email: string; phone: string }): string {
  return `¡Excelente! 🎉

He registrado tu confirmación de compra para "${productName}".

Aquí está la información de contacto de la empresa:
📧 Email: ${companyContact.email}
📱 WhatsApp: ${companyContact.phone}

Te contactarán en los próximos minutos para confirmar tu pago y enviar los detalles de acceso.

¿Hay algo más en lo que pueda ayudarte?`;
}

/**
 * Procesa la confirmación de pago y notifica a la empresa
 */
export async function processPurchaseConfirmation(
  confirmation: PaymentConfirmation
): Promise<{ success: boolean; message: string; notificationResult?: any }> {
  try {
    console.log(`📨 [CONFIRMATION-HANDLER] Procesando confirmación de compra - Conversación #${confirmation.conversationId}`);

    const companyContacts = getCompanyContacts();

    // Enviar notificación a la empresa
    const notificationResult = await notifyCompanyOfPurchase(
      {
        customerName: confirmation.customerId,
        customerEmail: confirmation.customerEmail,
        customerPhone: confirmation.customerPhone,
        productName: confirmation.productName,
        productId: confirmation.productId,
        price: confirmation.price,
        paymentMethod: confirmation.paymentMethod,
        conversationId: confirmation.conversationId,
        timestamp: confirmation.timestamp
      },
      companyContacts
    );

    if (notificationResult.success) {
      logger.info(
        { confirmation, notificationResult },
        "✅ Confirmación de pago enviada a empresa exitosamente"
      );
      return {
        success: true,
        message: "Confirmación enviada a la empresa. Serás contactado pronto.",
        notificationResult
      };
    } else {
      logger.warn(
        { confirmation, notificationResult },
        "⚠️ Confirmación procesada pero con advertencias en notificación"
      );
      return {
        success: true,
        message: "Tu confirmación ha sido registrada. La empresa te contactará pronto.",
        notificationResult
      };
    }
  } catch (error) {
    logger.error(
      { confirmation, error },
      "❌ Error al procesar confirmación de pago"
    );
    return {
      success: false,
      message: "Hubo un error al procesar tu confirmación. Por favor intenta nuevamente."
    };
  }
}
