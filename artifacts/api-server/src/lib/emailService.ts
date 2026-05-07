import nodemailer from "nodemailer";
import { logger } from "./logger";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

function createTransport() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.SMTP_FROM || "noreply@ventaspro.app";
  const pass = process.env.SMTP_PASS;

  if (!pass) {
    logger.warn("[EmailService] SMTP_PASS not configured — emails will be skipped");
    return null;
  }

  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

const BASE_STYLE = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f0f0f; color: #ffffff; margin: 0; padding: 0;
`;
const CARD_STYLE = `
  background: #1a1a1a; border: 1px solid #333; border-radius: 12px;
  padding: 32px; max-width: 580px; margin: 32px auto;
`;
const ACCENT = "#f97316";

function wrapTemplate(title: string, icon: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="${BASE_STYLE}">
  <div style="${CARD_STYLE}">
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:48px">${icon}</div>
      <h1 style="color:${ACCENT};font-size:22px;margin:8px 0">${title}</h1>
      <div style="width:48px;height:2px;background:${ACCENT};margin:0 auto;border-radius:2px"></div>
    </div>
    ${body}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #333;text-align:center;color:#666;font-size:12px">
      VentasPro — Bot de Ventas IA · <span style="color:${ACCENT}">ventaspro.app</span>
    </div>
  </div>
</body></html>`;
}

function row(label: string, value: string): string {
  return `<tr><td style="color:#999;padding:6px 0;font-size:14px">${label}</td>
          <td style="color:#fff;padding:6px 0;font-size:14px;font-weight:600">${value}</td></tr>`;
}

async function send(payload: EmailPayload): Promise<boolean> {
  const transport = createTransport();
  if (!transport) return false;
  const from = process.env.SMTP_USER || process.env.SMTP_FROM || "noreply@ventaspro.app";
  try {
    await transport.sendMail({ from: `VentasPro <${from}>`, ...payload });
    logger.info({ to: payload.to, subject: payload.subject }, "[EmailService] Email sent");
    return true;
  } catch (err) {
    logger.error({ err, to: payload.to }, "[EmailService] Failed to send email");
    return false;
  }
}

export async function sendEscalationAlert(opts: {
  adminEmail: string;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  reason: string;
  conversationId?: number;
}): Promise<boolean> {
  const body = `
    <p style="color:#ccc;margin-bottom:20px">Un cliente necesita atención humana en WhatsApp.</p>
    <table style="width:100%">
      ${row("Negocio", opts.tenantName)}
      ${row("Cliente", opts.contactName || "Desconocido")}
      ${row("Teléfono", opts.contactPhone || "—")}
      ${row("Motivo", opts.reason)}
      ${opts.conversationId ? row("Conversación #", String(opts.conversationId)) : ""}
    </table>
    <div style="margin-top:24px;padding:16px;background:#f97316/10;border:1px solid #f9731640;border-radius:8px">
      <p style="color:#f97316;margin:0;font-size:13px">⚠️ Accede al dashboard para responder: <strong>dashboard → Conversaciones</strong></p>
    </div>`;
  return send({
    to: opts.adminEmail,
    subject: `⚠️ Escalación urgente — ${opts.contactName || "Cliente"} necesita ayuda`,
    html: wrapTemplate("Escalación de Conversación", "🚨", body),
  });
}

export async function sendNewOrderNotification(opts: {
  adminEmail: string;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  items: Array<{ name: string; qty: number; price: number }>;
  total: string;
  currency: string;
  paymentMethod?: string;
  orderId: number;
}): Promise<boolean> {
  const itemsHtml = opts.items.map(i => `<li style="color:#ccc;padding:4px 0">${i.qty}x ${i.name} — ${opts.currency} ${Number(i.price).toLocaleString("es-CO")}</li>`).join("");
  const body = `
    <p style="color:#ccc;margin-bottom:20px">Nuevo pedido capturado desde WhatsApp.</p>
    <table style="width:100%">
      ${row("Pedido #", String(opts.orderId))}
      ${row("Cliente", opts.contactName || "Desconocido")}
      ${row("Teléfono", opts.contactPhone || "—")}
      ${row("Método de pago", opts.paymentMethod || "Pendiente")}
    </table>
    <div style="margin:20px 0;padding:16px;background:#1f1f1f;border-radius:8px">
      <p style="color:#999;font-size:13px;margin:0 0 8px">Productos:</p>
      <ul style="margin:0;padding-left:20px">${itemsHtml}</ul>
    </div>
    <div style="text-align:center;margin-top:20px">
      <span style="font-size:28px;font-weight:800;color:#22c55e">${opts.currency} ${Number(opts.total).toLocaleString("es-CO")}</span>
    </div>`;
  return send({
    to: opts.adminEmail,
    subject: `🛒 Nuevo pedido #${opts.orderId} — ${opts.currency} ${Number(opts.total).toLocaleString("es-CO")}`,
    html: wrapTemplate("Nuevo Pedido Recibido", "🛒", body),
  });
}

export async function sendPaymentConfirmed(opts: {
  adminEmail: string;
  contactName?: string;
  contactPhone?: string;
  productName: string;
  amount: string;
  currency: string;
  paymentId: string;
  orderId?: number;
}): Promise<boolean> {
  const body = `
    <p style="color:#ccc;margin-bottom:20px">Se confirmó un pago exitoso.</p>
    <table style="width:100%">
      ${row("Cliente", opts.contactName || "Desconocido")}
      ${row("Teléfono", opts.contactPhone || "—")}
      ${row("Producto", opts.productName)}
      ${row("Payment ID", opts.paymentId)}
      ${opts.orderId ? row("Pedido #", String(opts.orderId)) : ""}
    </table>
    <div style="text-align:center;margin-top:24px;padding:20px;background:#0d2d1d;border:1px solid #22c55e40;border-radius:12px">
      <p style="color:#22c55e;font-size:13px;margin:0 0 4px">PAGO CONFIRMADO ✓</p>
      <span style="font-size:32px;font-weight:800;color:#22c55e">${opts.currency} ${Number(opts.amount).toLocaleString("es-CO")}</span>
    </div>`;
  return send({
    to: opts.adminEmail,
    subject: `✅ Pago confirmado — ${opts.currency} ${Number(opts.amount).toLocaleString("es-CO")} de ${opts.contactName || "cliente"}`,
    html: wrapTemplate("Pago Confirmado", "✅", body),
  });
}

export async function sendNewLeadAlert(opts: {
  adminEmail: string;
  tenantName: string;
  contactName?: string;
  contactPhone?: string;
  stage?: string;
  interestLevel?: string;
}): Promise<boolean> {
  const body = `
    <p style="color:#ccc;margin-bottom:20px">Un nuevo prospecto fue detectado por el agente IA.</p>
    <table style="width:100%">
      ${row("Nombre", opts.contactName || "Desconocido")}
      ${row("Teléfono", opts.contactPhone || "—")}
      ${row("Etapa", opts.stage || "Nuevo")}
      ${row("Nivel de interés", opts.interestLevel || "—")}
    </table>
    <div style="margin-top:20px;padding:12px;background:#0d1f2d;border:1px solid #3b82f640;border-radius:8px">
      <p style="color:#60a5fa;margin:0;font-size:13px">💡 Accede a <strong>Prospectos</strong> en el dashboard para hacer seguimiento.</p>
    </div>`;
  return send({
    to: opts.adminEmail,
    subject: `👤 Nuevo prospecto — ${opts.contactName || "Cliente desconocido"}`,
    html: wrapTemplate("Nuevo Prospecto Detectado", "👤", body),
  });
}

export async function sendSystemAlert(opts: {
  adminEmail: string;
  title: string;
  message: string;
  level?: "info" | "warning" | "error";
}): Promise<boolean> {
  const icons = { info: "ℹ️", warning: "⚠️", error: "🔴" };
  const colors = { info: "#3b82f6", warning: "#f59e0b", error: "#ef4444" };
  const level = opts.level || "info";
  const body = `
    <div style="padding:20px;background:#1f1f1f;border-left:4px solid ${colors[level]};border-radius:4px">
      <p style="color:#fff;font-size:16px;margin:0 0 8px;font-weight:600">${opts.title}</p>
      <p style="color:#ccc;margin:0;font-size:14px">${opts.message}</p>
    </div>`;
  return send({
    to: opts.adminEmail,
    subject: `${icons[level]} VentasPro — ${opts.title}`,
    html: wrapTemplate(opts.title, icons[level], body),
  });
}
