import * as nodemailer from "nodemailer";
import { getAppUrl } from "./app-url";
import { logger } from "./logger";

const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

// Configuración del transporter de email
// Puedes usar Gmail, SendGrid, o cualquier servicio SMTP
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true", // true para 465, false para otros puertos
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

/**
 * Crea un transporter nodemailer a partir de credenciales SMTP.
 * Devuelve null si faltan usuario o contraseña.
 */
export function crearTransporter(creds: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}) {
  if (!creds.user || !creds.pass) return null;
  return nodemailer.createTransport({
    host: creds.host,
    port: creds.port,
    secure: creds.secure,
    auth: { user: creds.user, pass: creds.pass },
  });
}

if (smtpConfigured && transporter) {
  transporter.verify((error, success) => {
    if (error) {
      logger.error({ error }, "[Email] ❌ Error conectando con servidor SMTP");
    } else {
      logger.info("[Email] ✅ Servidor SMTP conectado y listo");
    }
  });
} else {
  logger.info("[Email] ⚠️ SMTP no configurado. Las funciones de email estarán deshabilitadas.");
}

/**
 * Genera un código de 6 dígitos
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Envía un código de verificación de email
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string,
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string; from?: string }
): Promise<boolean> {
  const tr = smtp ? crearTransporter(smtp) : transporter;
  if (!tr) {
    logger.warn({ email }, "[Email] SMTP no configurado, no se puede enviar email de verificación");
    return false;
  }
  try {
    const mailOptions = {
      from: smtp?.from || `"VentasPro" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "🔐 Código de Verificación - VentasPro",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .code-container {
              background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
              border: 2px dashed #f59e0b;
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 42px;
              font-weight: 800;
              color: #92400e;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .code-label {
              font-size: 14px;
              color: #92400e;
              margin-top: 10px;
              font-weight: 600;
            }
            .warning {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .warning-text {
              font-size: 14px;
              color: #991b1b;
              margin: 0;
            }
            .footer {
              background: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
              color: white;
              padding: 14px 32px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 VentasPro</h1>
            </div>
            <div class="content">
              <p class="greeting">¡Hola ${name}! 👋</p>
              <p class="message">
                Gracias por registrarte en <strong>VentasPro</strong>. Para completar tu registro y verificar tu cuenta, 
                por favor ingresa el siguiente código de verificación:
              </p>
              
              <div class="code-container">
                <div class="code">${code}</div>
                <div class="code-label">CÓDIGO DE VERIFICACIÓN</div>
              </div>
              
              <p class="message">
                Este código es válido por <strong>15 minutos</strong>. Si no solicitaste este código, 
                puedes ignorar este mensaje de forma segura.
              </p>
              
              <div class="warning">
                <p class="warning-text">
                  ⚠️ <strong>Importante:</strong> Nunca compartas este código con nadie. 
                  Nuestro equipo nunca te pedirá este código por teléfono o email.
                </p>
              </div>
            </div>
            <div class="footer">
              <p class="footer-text">© 2026 VentasPro - Plataforma de Ventas con IA</p>
              <p class="footer-text">Este es un email automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await tr.sendMail(mailOptions);
    logger.info({ email }, "[Email] Código de verificación enviado");
    return true;
  } catch (error) {
    logger.error({ error, email }, "[Email] Error enviando código de verificación");
    return false;
  }
}

/**
 * Envía un código de recuperación de contraseña
 */
export async function sendPasswordResetEmail(
  email: string,
  code: string,
  name: string,
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string; from?: string }
): Promise<boolean> {
  const tr = smtp ? crearTransporter(smtp) : transporter;
  if (!tr) {
    logger.warn({ email }, "[Email] SMTP no configurado, no se puede enviar email de recuperación");
    return false;
  }
  try {
    logger.info({ email, code }, "[Email] 📧 Intentando enviar código de recuperación...");
    
    const mailOptions = {
      from: smtp?.from || `"VentasPro" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "🔑 Recuperación de Contraseña - VentasPro",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #ef4444 0%, #f87171 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .code-container {
              background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
              border: 2px dashed #ef4444;
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .code {
              font-size: 42px;
              font-weight: 800;
              color: #991b1b;
              letter-spacing: 8px;
              font-family: 'Courier New', monospace;
            }
            .code-label {
              font-size: 14px;
              color: #991b1b;
              margin-top: 10px;
              font-weight: 600;
            }
            .warning {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .warning-text {
              font-size: 14px;
              color: #991b1b;
              margin: 0;
            }
            .footer {
              background: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔑 Recuperación de Contraseña</h1>
            </div>
            <div class="content">
              <p class="greeting">Hola ${name},</p>
              <p class="message">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en <strong>VentasPro</strong>. 
                Usa el siguiente código para continuar con el proceso:
              </p>
              
              <div class="code-container">
                <div class="code">${code}</div>
                <div class="code-label">CÓDIGO DE RECUPERACIÓN</div>
              </div>
              
              <p class="message">
                Este código es válido por <strong>15 minutos</strong>. Si no solicitaste restablecer tu contraseña, 
                puedes ignorar este mensaje de forma segura.
              </p>
              
              <div class="warning">
                <p class="warning-text">
                  ⚠️ <strong>Seguridad:</strong> Si no solicitaste este cambio, te recomendamos cambiar tu contraseña 
                  inmediatamente y contactar a nuestro equipo de soporte.
                </p>
              </div>
            </div>
            <div class="footer">
              <p class="footer-text">© 2026 VentasPro - Plataforma de Ventas con IA</p>
              <p class="footer-text">Este es un email automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await tr.sendMail(mailOptions);
    logger.info({ email, messageId: result.messageId }, "[Email] ✅ Código de recuperación enviado exitosamente");
    return true;
  } catch (error) {
    logger.error({ error, email }, "[Email] ❌ Error enviando código de recuperación");
    console.error("[Email] Error completo:", error);
    return false;
  }
}

/**
 * Envía un token de activación de suscripción
 */
export async function sendActivationTokenEmail(
  email: string,
  token: string,
  plan: string,
  name: string,
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string; from?: string }
): Promise<boolean> {
  const tr = smtp ? crearTransporter(smtp) : transporter;
  if (!tr) {
    logger.warn({ email }, "[Email] SMTP no configurado, no se puede enviar token de activación");
    return false;
  }
  try {
    logger.info({ email, plan }, "[Email] 📧 Enviando token de activación de suscripción...");
    
    const activationUrl = `${getAppUrl()}/activate?token=${token}`;
    
    const mailOptions = {
      from: smtp?.from || `"VentasPro" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🎉 ¡Pago Confirmado! Activa tu Plan ${plan}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .token-container {
              background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
              border: 2px dashed #10b981;
              border-radius: 12px;
              padding: 30px;
              text-align: center;
              margin: 30px 0;
            }
            .token {
              font-size: 32px;
              font-weight: 800;
              color: #065f46;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
              word-break: break-all;
            }
            .token-label {
              font-size: 14px;
              color: #065f46;
              margin-top: 10px;
              font-weight: 600;
            }
            .button {
              display: inline-block;
              background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
              color: white;
              padding: 16px 40px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              margin: 20px 0;
              font-size: 16px;
            }
            .button:hover {
              background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .info-text {
              font-size: 14px;
              color: #065f46;
              margin: 0;
            }
            .footer {
              background: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 ¡Pago Confirmado!</h1>
            </div>
            <div class="content">
              <p class="greeting">¡Hola ${name}! 👋</p>
              <p class="message">
                ¡Excelente noticia! Tu pago ha sido procesado exitosamente. 
                Ahora solo falta un paso para activar tu <strong>Plan ${plan}</strong>.
              </p>
              
              <div class="token-container">
                <div class="token">${token}</div>
                <div class="token-label">TOKEN DE ACTIVACIÓN</div>
              </div>
              
              <div style="text-align: center;">
                <a href="${activationUrl}" class="button">
                  ✨ Activar Mi Cuenta Ahora
                </a>
              </div>
              
              <p class="message">
                También puedes copiar el token de arriba e ingresarlo manualmente en la página de activación.
              </p>
              
              <div class="info-box">
                <p class="info-text">
                  ℹ️ <strong>¿Qué incluye tu plan ${plan}?</strong><br>
                  Una vez activado, tendrás acceso completo a todas las funcionalidades de tu plan.
                </p>
              </div>
              
              <p class="message" style="font-size: 14px; color: #6b7280;">
                Si tienes alguna pregunta o necesitas ayuda, no dudes en contactarnos.
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">© 2026 VentasPro - Plataforma de Ventas con IA</p>
              <p class="footer-text">Este es un email automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await tr.sendMail(mailOptions);
    logger.info({ email, messageId: result.messageId }, "[Email] ✅ Token de activación enviado exitosamente");
    return true;
  } catch (error) {
    logger.error({ error, email }, "[Email] ❌ Error enviando token de activación");
    console.error("[Email] Error completo:", error);
    return false;
  }
}

/**
 * Verifica la configuración del servicio de email
 */
export async function verifyEmailService(smtp?: { host: string; port: number; secure: boolean; user: string; pass: string }): Promise<boolean> {
  const tr = smtp ? crearTransporter(smtp) : transporter;
  if (!tr) {
    logger.warn("[Email] SMTP no configurado, no se puede verificar servicio");
    return false;
  }
  try {
    await transporter.verify();
    logger.info("[Email] Servicio de email verificado correctamente");
    return true;
  } catch (error) {
    logger.error({ error }, "[Email] Error verificando servicio de email");
    return false;
  }
}

/**
 * Envía confirmación de cambio de contraseña
 */
export async function sendPasswordChangeConfirmationEmail(
  email: string,
  name: string,
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string; from?: string }
): Promise<boolean> {
  const tr = smtp ? crearTransporter(smtp) : transporter;
  if (!tr) {
    logger.warn({ email }, "[Email] SMTP no configurado, no se puede enviar confirmación de cambio");
    return false;
  }
  try {
    logger.info({ email }, "[Email] 📧 Enviando confirmación de cambio de contraseña...");
    
    const mailOptions = {
      from: smtp?.from || `"VentasPro" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "✅ Contraseña Cambiada - VentasPro",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 28px;
              font-weight: 700;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 18px;
              color: #1f2937;
              margin-bottom: 20px;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .info-box {
              background: #f0fdf4;
              border-left: 4px solid #10b981;
              padding: 20px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .info-text {
              font-size: 14px;
              color: #065f46;
              margin: 0;
              line-height: 1.6;
            }
            .warning {
              background: #fef2f2;
              border-left: 4px solid #ef4444;
              padding: 15px;
              margin: 20px 0;
              border-radius: 8px;
            }
            .warning-text {
              font-size: 14px;
              color: #991b1b;
              margin: 0;
            }
            .footer {
              background: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Contraseña Actualizada</h1>
            </div>
            <div class="content">
              <p class="greeting">¡Hola ${name}! 👋</p>
              <p class="message">
                Te confirmamos que tu contraseña ha sido <strong>cambiada exitosamente</strong> 
                en tu cuenta de <strong>VentasPro</strong>.
              </p>
              
              <div class="info-box">
                <p class="info-text">
                  ℹ️ <strong>¿Qué significa esto?</strong><br>
                  Tu contraseña anterior ya no es válida. Solo puedes acceder con tu nueva contraseña.
                </p>
              </div>
              
              <div class="warning">
                <p class="warning-text">
                  ⚠️ <strong>Seguridad:</strong> Si no realizaste este cambio, 
                  contacta inmediatamente a nuestro equipo de soporte.
                </p>
              </div>
              
              <p class="message" style="font-size: 14px; color: #6b7280;">
                Si necesitas ayuda, estamos aquí para ti. Contacta a nuestro equipo de soporte en cualquier momento.
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">© 2026 VentasPro - Plataforma de Ventas con IA</p>
              <p class="footer-text">Este es un email automático, por favor no respondas.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await tr.sendMail(mailOptions);
    logger.info({ email, messageId: result.messageId }, "[Email] ✅ Confirmación de cambio de contraseña enviada");
    return true;
  } catch (error) {
    logger.error({ error, email }, "[Email] ❌ Error enviando confirmación de cambio de contraseña");
    return false;
  }
}

/**
 * Envía confirmación de orden con link de descarga, foto y factura
 */
export async function sendOrderConfirmationEmail(
  email: string,
  customerName: string,
  productName: string,
  productImage: string | null,
  downloadLink: string,
  amount: number,
  currency: string = "COP",
  paymentId: string,
  paymentMethod: string,
  // Este correo va del NEGOCIO a SU comprador, no de la plataforma. Con el
  // tenantId sale del correo del negocio y firmado con su marca; sin él
  // (llamadas viejas) cae al SMTP del servidor como antes.
  //
  // Que llegue de "VentasPro" -- una marca que el comprador no reconoce --
  // es media entrega a spam y la otra media leída como estafa.
  tenantId?: number
): Promise<boolean> {
  // El transporter global solo hace falta para el camino de respaldo.
  if (!transporter && !tenantId) {
    logger.warn({ email }, "[Email] SMTP no configurado, no se puede enviar email de confirmación de orden");
    return false;
  }
  try {
    const formattedAmount = new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: currency === "COP" ? 0 : 2,
    }).format(amount);

    const mailOptions = {
      from: smtp?.from || `"VentasPro" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `✅ ¡Pago Confirmado! - ${productName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-color: #f5f5f5;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 40px auto;
              background: white;
              border-radius: 16px;
              overflow: hidden;
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
              padding: 40px 30px;
              text-align: center;
            }
            .header h1 {
              color: white;
              margin: 0;
              font-size: 32px;
              font-weight: 700;
            }
            .header-emoji {
              font-size: 48px;
              margin-bottom: 10px;
            }
            .content {
              padding: 40px 30px;
            }
            .greeting {
              font-size: 20px;
              color: #1f2937;
              margin-bottom: 10px;
              font-weight: 600;
            }
            .message {
              font-size: 16px;
              color: #4b5563;
              line-height: 1.6;
              margin-bottom: 30px;
            }
            .product-section {
              background: #f9fafb;
              border-radius: 12px;
              padding: 20px;
              margin: 30px 0;
            }
            .product-image {
              width: 100%;
              max-width: 300px;
              height: auto;
              border-radius: 8px;
              display: block;
              margin: 0 auto 15px;
            }
            .product-name {
              font-size: 18px;
              font-weight: 700;
              color: #1f2937;
              text-align: center;
              margin-bottom: 15px;
            }
            .download-button {
              display: inline-block;
              width: 100%;
              background: linear-gradient(135deg, #10b981 0%, #34d399 100%);
              color: white;
              padding: 16px 32px;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 600;
              text-align: center;
              margin: 15px 0;
              font-size: 16px;
            }
            .download-button:hover {
              opacity: 0.9;
            }
            .invoice-section {
              background: #f3f4f6;
              border-left: 4px solid #10b981;
              padding: 20px;
              margin: 30px 0;
              border-radius: 8px;
            }
            .invoice-title {
              font-size: 14px;
              font-weight: 700;
              color: #1f2937;
              text-transform: uppercase;
              margin-bottom: 15px;
              letter-spacing: 0.5px;
            }
            .invoice-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
              font-size: 14px;
              color: #4b5563;
            }
            .invoice-row:last-child {
              border-bottom: none;
            }
            .invoice-label {
              font-weight: 600;
              color: #1f2937;
            }
            .invoice-value {
              text-align: right;
            }
            .total-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-top: 2px solid #10b981;
              margin-top: 10px;
              font-size: 16px;
              font-weight: 700;
              color: #10b981;
            }
            .info-box {
              background: #ecfdf5;
              border: 1px solid #a7f3d0;
              border-radius: 8px;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #065f46;
            }
            .footer {
              background: #f9fafb;
              padding: 30px;
              text-align: center;
              border-top: 1px solid #e5e7eb;
            }
            .footer-text {
              font-size: 14px;
              color: #6b7280;
              margin: 5px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="header-emoji">✅</div>
              <h1>¡Pago Confirmado!</h1>
            </div>
            <div class="content">
              <p class="greeting">¡Hola ${customerName}! 🎉</p>
              <p class="message">
                Gracias por tu compra. Tu pago ha sido procesado exitosamente y tu producto ya está listo para descargar.
              </p>

              <div class="product-section">
                ${productImage ? `<img src="${productImage}" alt="${productName}" class="product-image">` : ''}
                <div class="product-name">${productName}</div>
                <a href="${downloadLink}" class="download-button">📥 DESCARGAR PRODUCTO</a>
                <p class="message" style="text-align: center; margin: 15px 0 0 0; font-size: 13px; color: #6b7280;">
                  El link de descarga es único y personal. Válido por 30 días.
                </p>
              </div>

              <div class="invoice-section">
                <div class="invoice-title">📄 Factura de Compra</div>
                <div class="invoice-row">
                  <span class="invoice-label">Comprador:</span>
                  <span class="invoice-value">${customerName}</span>
                </div>
                <div class="invoice-row">
                  <span class="invoice-label">Producto:</span>
                  <span class="invoice-value">${productName}</span>
                </div>
                <div class="invoice-row">
                  <span class="invoice-label">Método de Pago:</span>
                  <span class="invoice-value">${paymentMethod === 'mercadopago' ? '💳 Mercado Pago' : '💳 PayPal'}</span>
                </div>
                <div class="invoice-row">
                  <span class="invoice-label">ID de Transacción:</span>
                  <span class="invoice-value" style="font-family: monospace; font-size: 12px;">${paymentId}</span>
                </div>
                <div class="invoice-row">
                  <span class="invoice-label">Fecha:</span>
                  <span class="invoice-value">${new Date().toLocaleDateString('es-CO')}</span>
                </div>
                <div class="total-row">
                  <span>TOTAL PAGADO:</span>
                  <span>${formattedAmount}</span>
                </div>
              </div>

              <div class="info-box">
                <strong>ℹ️ Información Importante:</strong><br>
                • Tu acceso es de por vida<br>
                • Puedes descargar el producto ilimitadas veces<br>
                • Revisa tu carpeta de spam si no recibes futuros emails<br>
                • Si tienes problemas, contacta a nuestro soporte
              </div>

              <p class="message">
                Esperamos que disfrutes mucho del producto. Si tienes alguna pregunta o necesitas soporte,
                no dudes en escribirnos. ¡Estamos aquí para ayudarte!
              </p>
            </div>
            <div class="footer">
              <p class="footer-text">© 2026 VentasPro - Plataforma de Ventas con IA</p>
              <p class="footer-text">Este es un email automático, por favor no respondas directamente a este mensaje.</p>
              <p class="footer-text">📧 Para soporte: soporte@ventaspro.com</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    // Si el negocio tiene su propio correo, sale de ahí y con su marca.
    // enviarComoNegocio cae solo al SMTP del servidor si no lo configuró.
    if (tenantId) {
      const { enviarComoNegocio } = await import("./tenant-email");
      const enviado = await enviarComoNegocio(tenantId, {
        to: email,
        subject: mailOptions.subject,
        html: mailOptions.html,
      });
      if (enviado) return true;
      // Si falla el correo del negocio se reintenta por el del servidor: es
      // preferible que el comprador reciba la confirmación desde una marca
      // rara a que no reciba nada después de haber pagado.
      logger.warn({ tenantId, email }, "[Email] Falló el correo del negocio; se reintenta por el del servidor");
      if (!transporter) return false;
    }

    const result = await transporter!.sendMail(mailOptions);
    logger.info({ email, productName, paymentId, messageId: result.messageId }, "[Email] ✅ Confirmación de orden enviada exitosamente");
    return true;
  } catch (error) {
    logger.error({ error, email, productName }, "[Email] ❌ Error enviando confirmación de orden");
    return false;
  }
}
