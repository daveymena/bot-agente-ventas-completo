/**
 * Envío de campañas de remarketing (email / WhatsApp) a leads guardados.
 *
 * Ambas funciones son SIEMPRE invocadas desde una tool NO read-only (ver
 * DESTRUCTIVE_TOOLS en app-operator.ts) -- el admin ya tuvo que confirmar el
 * plan (destinatarios + mensaje exactos) antes de que esto se ejecute. No
 * hay ningún camino que dispare un envío masivo sin esa confirmación.
 */
import { db, leads, remarketingCampaigns } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { enviarComoNegocio } from "./tenant-email";

// Techo de seguridad por llamada -- evita que un segmento mal filtrado
// dispare miles de envíos de una sola vez. Si el segmento es más grande,
// la tool devuelve error y pide acotar (por stage, por ejemplo) en vez de
// truncar en silencio.
const MAX_RECIPIENTS_PER_CALL = 300;
// Espaciado entre mensajes de WhatsApp: WhatsApp/Meta puede banear números
// que mandan ráfagas de mensajes idénticos muy rápido. No es un rate-limit
// global de la cuenta (eso requeriría tocar también el flujo de ventas),
// pero evita que ESTE envío masivo por sí solo dispare una ráfaga.
const WHATSAPP_SEND_DELAY_MS = 4000;
const WHATSAPP_MAX_PER_CALL = 80; // más conservador que el email por el riesgo de baneo

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function targetLeads(tenantId: number, stage?: string) {
  const conditions = [eq(leads.tenantId, tenantId), eq(leads.optOut, false)];
  if (stage) conditions.push(eq(leads.stage, stage));
  return db.select().from(leads).where(and(...conditions));
}

export interface CampaignResult {
  ok: boolean;
  summary: string;
  totalTargeted: number;
  totalSent: number;
  totalFailed: number;
  totalOptedOut: number;
}

export async function sendEmailCampaign(
  tenantId: number,
  opts: { subject: string; html: string; stage?: string },
): Promise<CampaignResult> {
  const targets = await targetLeads(tenantId, opts.stage);
  const withEmail = targets.filter((l) => !!l.email);
  if (withEmail.length === 0) {
    return { ok: false, summary: "No hay leads con email guardado en ese segmento.", totalTargeted: 0, totalSent: 0, totalFailed: 0, totalOptedOut: 0 };
  }
  if (withEmail.length > MAX_RECIPIENTS_PER_CALL) {
    return {
      ok: false,
      summary: `El segmento tiene ${withEmail.length} leads con email, por encima del máximo de ${MAX_RECIPIENTS_PER_CALL} por envío. Acotá con "stage" o dividí la campaña.`,
      totalTargeted: withEmail.length,
      totalSent: 0,
      totalFailed: 0,
      totalOptedOut: 0,
    };
  }

  const baseUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/$/, "");
  let sent = 0, failed = 0;
  const results: any[] = [];
  for (const lead of withEmail) {
    const unsubscribeLink = `${baseUrl}/api/public/unsubscribe?leadId=${lead.id}`;
    const htmlConLink = `${opts.html}<p style="font-size:11px;color:#999;margin-top:24px">¿No querés más correos como este? <a href="${unsubscribeLink}">Date de baja acá</a>.</p>`;
    const ok = await enviarComoNegocio(tenantId, { to: lead.email!, subject: opts.subject, html: htmlConLink });
    if (ok) sent++; else failed++;
    results.push({ leadId: lead.id, email: lead.email, ok });
  }

  try {
    await db.insert(remarketingCampaigns).values({
      tenantId, channel: "email", segment: opts.stage ? `stage=${opts.stage}` : "todos",
      subject: opts.subject, message: opts.html,
      totalTargeted: withEmail.length, totalSent: sent, totalFailed: failed, totalOptedOut: targets.length - withEmail.length,
      results, completedAt: new Date(),
    } as any);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Remarketing] No se pudo registrar el log de campaña de email");
  }

  return {
    ok: sent > 0,
    summary: `Campaña de email: ${sent} enviados, ${failed} fallidos, de ${withEmail.length} leads con email en el segmento.`,
    totalTargeted: withEmail.length, totalSent: sent, totalFailed: failed, totalOptedOut: targets.length - withEmail.length,
  };
}

export async function sendWhatsappBroadcast(
  tenantId: number,
  opts: { message: string; stage?: string },
): Promise<CampaignResult> {
  const targets = await targetLeads(tenantId, opts.stage);
  if (targets.length === 0) {
    return { ok: false, summary: "No hay leads en ese segmento.", totalTargeted: 0, totalSent: 0, totalFailed: 0, totalOptedOut: 0 };
  }
  if (targets.length > WHATSAPP_MAX_PER_CALL) {
    return {
      ok: false,
      summary: `El segmento tiene ${targets.length} leads, por encima del máximo de ${WHATSAPP_MAX_PER_CALL} por envío de WhatsApp (para no arriesgar el número). Acotá con "stage" o dividí la campaña en varias tandas.`,
      totalTargeted: targets.length,
      totalSent: 0,
      totalFailed: 0,
      totalOptedOut: 0,
    };
  }

  const { getWhatsAppForTenant } = await import("./whatsapp-factory");
  const mgr = getWhatsAppForTenant(tenantId);
  if (!mgr.isConnected()) {
    return { ok: false, summary: "El WhatsApp de este negocio no está conectado ahora mismo -- no se mandó nada.", totalTargeted: targets.length, totalSent: 0, totalFailed: 0, totalOptedOut: 0 };
  }

  let sent = 0, failed = 0;
  const results: any[] = [];
  for (const lead of targets) {
    try {
      await mgr.sendText(lead.phone, opts.message);
      sent++;
      results.push({ leadId: lead.id, phone: lead.phone, ok: true });
    } catch (e: any) {
      failed++;
      results.push({ leadId: lead.id, phone: lead.phone, ok: false, error: e?.message });
    }
    await sleep(WHATSAPP_SEND_DELAY_MS);
  }

  try {
    await db.insert(remarketingCampaigns).values({
      tenantId, channel: "whatsapp", segment: opts.stage ? `stage=${opts.stage}` : "todos",
      message: opts.message,
      totalTargeted: targets.length, totalSent: sent, totalFailed: failed, totalOptedOut: 0,
      results, completedAt: new Date(),
    } as any);
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[Remarketing] No se pudo registrar el log de campaña de WhatsApp");
  }

  return {
    ok: sent > 0,
    summary: `Broadcast de WhatsApp: ${sent} enviados, ${failed} fallidos, de ${targets.length} leads en el segmento.`,
    totalTargeted: targets.length, totalSent: sent, totalFailed: failed, totalOptedOut: 0,
  };
}
