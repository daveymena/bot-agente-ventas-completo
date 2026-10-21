/**
 * Procesa campañas de remarketing encoladas (ver remarketing.ts) en tandas
 * chicas cada tick, en vez de mandar todo de una -- mismo patrón que
 * followUpScheduler.ts (interval-based, revisa qué hay pendiente en la DB).
 *
 * Por qué progresivo importa acá específicamente: WhatsApp/Meta detecta
 * "blast" más por el PATRÓN de envío (ráfaga de mensajes casi idénticos en
 * poco tiempo) que por el volumen total en sí. Una campaña de 200 leads
 * mandada en 5 minutos se ve como spam aunque cada mensaje individualmente
 * esté espaciado; la misma campaña goteando 6 mensajes cada 10 minutos
 * durante varias horas se parece mucho más a actividad humana normal.
 */
import { eq, and, ne } from "drizzle-orm";
import { db, leads, remarketingCampaigns } from "@workspace/db";
import { logger } from "./logger";
import { enviarComoNegocio } from "./tenant-email";
import { buildUnsubscribeToken } from "./remarketing";
import { cuandoLaBaseEsteLista } from "./esperar-base";

const TICK_INTERVAL_MS = 10 * 60 * 1000; // cada 10 minutos
const EMAIL_BATCH_PER_TICK = 20;
const WHATSAPP_BATCH_PER_TICK = 5; // más conservador: WhatsApp es el canal con riesgo real de baneo
const WHATSAPP_INTRA_BATCH_DELAY_MS = 4000; // espera entre cada mensaje DENTRO de una misma tanda

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processEmailCampaign(campaign: typeof remarketingCampaigns.$inferSelect) {
  const pending = (campaign.pendingLeadIds as number[]) || [];
  const batch = pending.slice(0, EMAIL_BATCH_PER_TICK);
  if (batch.length === 0) return;

  const batchLeads = await db.select().from(leads).where(and(eq(leads.tenantId, campaign.tenantId!)));
  const byId = new Map<number, (typeof batchLeads)[number]>(batchLeads.map((l: any) => [l.id, l]));

  const baseUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/$/, "");
  let sent = campaign.totalSent, failed = campaign.totalFailed;
  const results: any[] = Array.isArray(campaign.results) ? [...(campaign.results as any[])] : [];

  for (const leadId of batch) {
    const lead = byId.get(leadId);
    if (!lead || !lead.email) { failed++; results.push({ leadId, ok: false, error: "lead sin email" }); continue; }
    const token = buildUnsubscribeToken(leadId);
    const unsubscribeLink = `${baseUrl}/api/public/unsubscribe?leadId=${leadId}&token=${token}`;
    const htmlConLink = `${campaign.message}<p style="font-size:11px;color:#999;margin-top:24px">¿No querés más correos como este? <a href="${unsubscribeLink}">Date de baja acá</a>.</p>`;
    const ok = await enviarComoNegocio(campaign.tenantId!, { to: lead.email, subject: campaign.subject || "", html: htmlConLink });
    if (ok) sent++; else failed++;
    results.push({ leadId, email: lead.email, ok });
  }

  const remaining = pending.slice(batch.length);
  await db.update(remarketingCampaigns).set({
    status: remaining.length === 0 ? "completed" : "sending",
    pendingLeadIds: remaining,
    totalSent: sent,
    totalFailed: failed,
    results,
    completedAt: remaining.length === 0 ? new Date() : null,
  } as any).where(eq(remarketingCampaigns.id, campaign.id));

  logger.info({ campaignId: campaign.id, batch: batch.length, remaining: remaining.length }, "[RemarketingScheduler] Tanda de email procesada");
}

async function processWhatsappCampaign(campaign: typeof remarketingCampaigns.$inferSelect) {
  const pending = (campaign.pendingLeadIds as number[]) || [];
  const batch = pending.slice(0, WHATSAPP_BATCH_PER_TICK);
  if (batch.length === 0) return;

  const { getWhatsAppForTenant } = await import("./whatsapp-factory");
  const mgr = getWhatsAppForTenant(campaign.tenantId!);
  if (!mgr.isConnected()) {
    // No se descarta la tanda -- se reintenta en el próximo tick, por si es
    // una desconexión momentánea. Los pendingLeadIds no se tocan.
    logger.warn({ campaignId: campaign.id }, "[RemarketingScheduler] WhatsApp no conectado, reintento en el próximo tick");
    return;
  }

  const batchLeads = await db.select().from(leads).where(and(eq(leads.tenantId, campaign.tenantId!)));
  const byId = new Map<number, (typeof batchLeads)[number]>(batchLeads.map((l: any) => [l.id, l]));

  let sent = campaign.totalSent, failed = campaign.totalFailed;
  const results: any[] = Array.isArray(campaign.results) ? [...(campaign.results as any[])] : [];

  for (const leadId of batch) {
    const lead = byId.get(leadId);
    if (!lead) { failed++; results.push({ leadId, ok: false, error: "lead no encontrado" }); continue; }
    try {
      await mgr.sendText(lead.phone, campaign.message);
      sent++;
      results.push({ leadId, phone: lead.phone, ok: true });
    } catch (e: any) {
      failed++;
      results.push({ leadId, phone: lead.phone, ok: false, error: e?.message });
    }
    await sleep(WHATSAPP_INTRA_BATCH_DELAY_MS);
  }

  const remaining = pending.slice(batch.length);
  await db.update(remarketingCampaigns).set({
    status: remaining.length === 0 ? "completed" : "sending",
    pendingLeadIds: remaining,
    totalSent: sent,
    totalFailed: failed,
    results,
    completedAt: remaining.length === 0 ? new Date() : null,
  } as any).where(eq(remarketingCampaigns.id, campaign.id));

  logger.info({ campaignId: campaign.id, batch: batch.length, remaining: remaining.length }, "[RemarketingScheduler] Tanda de WhatsApp procesada");
}

export class RemarketingScheduler {
  private intervalId: NodeJS.Timeout | null = null;

  start(intervalMs: number = TICK_INTERVAL_MS): void {
    if (this.intervalId) return;
    logger.info({ intervalMs }, "[RemarketingScheduler] Iniciado");
    // La primera vuelta espera a la base (ver esperar-base.ts): sin esto
    // fallaba siempre con "Cannot read properties of undefined (reading 'select')".
    cuandoLaBaseEsteLista()
      .then(() => this.tick())
      .catch((e) => logger.error({ err: e?.message }, "[RemarketingScheduler] Error en tick inicial"));
    this.intervalId = setInterval(() => {
      this.tick().catch((e) => logger.error({ err: e?.message }, "[RemarketingScheduler] Error en tick"));
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
  }

  private async tick(): Promise<void> {
    const active = await db.select().from(remarketingCampaigns).where(
      and(ne(remarketingCampaigns.status, "completed"), ne(remarketingCampaigns.status, "cancelled")),
    );
    for (const campaign of active) {
      try {
        if (campaign.channel === "email") await processEmailCampaign(campaign);
        else if (campaign.channel === "whatsapp") await processWhatsappCampaign(campaign);
      } catch (e: any) {
        logger.error({ campaignId: campaign.id, err: e?.message }, "[RemarketingScheduler] Error procesando campaña");
      }
    }
  }
}

export const remarketingScheduler = new RemarketingScheduler();
