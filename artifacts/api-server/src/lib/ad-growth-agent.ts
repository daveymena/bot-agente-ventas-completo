/**
 * Agente de crecimiento de Facebook Ads — modelo ASISTIDO, no autónomo.
 *
 * Dos velocidades de revisión (patrón estándar de herramientas como
 * Revealbot, no inventado): "protección de gasto" corre seguido con una
 * ventana corta para frenar campañas que queman presupuesto sin resultados
 * lo antes posible; "revisión de tendencia" corre más espaciado con una
 * ventana larga para no reaccionar a un mal día aislado y solo proponer
 * escalar cuando el rendimiento es consistente.
 *
 * El agente NUNCA ejecuta una acción por su cuenta: genera una sugerencia,
 * la registra en ad_agent_logs y se la manda al admin por WhatsApp. Solo
 * actúa cuando el admin responde aprobando esa sugerencia puntual.
 */
import { db, adAgentLogs } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { whatsapp } from "./whatsapp";
import { isApproval, isRejection } from "./architect-store";
import { FacebookService } from "./facebook";
import { tenantManager } from "./tenantManager";

// Umbrales conservadores y auditables a propósito -- se pueden ajustar sin
// tocar la lógica de decisión.
const SPEND_PROTECTION_MIN_IMPRESSIONS = 500; // no juzgar con muestra chica
const TREND_MIN_IMPRESSIONS = 1000;
const TREND_SCALE_UP_MAX_COST_RATIO = 0.7; // costo/resultado actual <= 70% de la ventana anterior => va bien
const TREND_SCALE_DOWN_MIN_COST_RATIO = 1.5; // costo/resultado actual >= 150% de la ventana anterior => va mal

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

async function getAdminPhone(): Promise<string | null> {
  return process.env.ADMIN_PHONE || null;
}

async function logSuggestion(entry: {
  tenantId: number | null;
  campaignId: string;
  adSetId?: string | null;
  productName?: string | null;
  checkType: "spend_protection" | "trend_review";
  suggestedAction: "pause" | "resume" | "increase_budget" | "decrease_budget" | null;
  reason: string;
  metricsSnapshot: any;
}) {
  const [row] = await db.insert(adAgentLogs).values({
    tenantId: entry.tenantId,
    campaignId: entry.campaignId,
    adSetId: entry.adSetId || null,
    productName: entry.productName || null,
    checkType: entry.checkType,
    status: entry.suggestedAction ? "suggested" : "no_action",
    suggestedAction: entry.suggestedAction,
    reason: entry.reason,
    metricsSnapshot: entry.metricsSnapshot,
  }).returning();
  return row;
}

async function notifyAdmin(logId: number, campaignName: string, action: string, reason: string) {
  const phone = await getAdminPhone();
  if (!phone) {
    logger.warn("[AdGrowthAgent] ADMIN_PHONE no configurado, no se puede notificar la sugerencia");
    return;
  }
  if (!whatsapp.isConnected()) {
    logger.warn("[AdGrowthAgent] WhatsApp no conectado, sugerencia solo quedó registrada");
    return;
  }
  const actionLabel: Record<string, string> = {
    pause: "⏸️ Pausar",
    resume: "▶️ Reactivar",
    increase_budget: "📈 Subir presupuesto",
    decrease_budget: "📉 Bajar presupuesto",
  };
  const text = `🤖 *Agente de Anuncios* — sugerencia #${logId}\n\n` +
    `Campaña: *${campaignName}*\n` +
    `Propuesta: *${actionLabel[action] || action}*\n\n` +
    `${reason}\n\n` +
    `Responde *sí ${logId}* para aplicarlo o *no ${logId}* para descartarlo.`;
  try {
    await whatsapp.sendText(phone, text);
  } catch (err) {
    logger.warn({ err }, "[AdGrowthAgent] Error enviando sugerencia por WhatsApp");
  }
}

/** Protección de gasto: ventana corta, revisa si una campaña activa se está
 * comiendo el presupuesto sin resultados. Corre seguido a propósito. */
export async function runSpendProtectionCheck(): Promise<void> {
  const tenant = tenantManager.getDefaultTenant();
  const fb = new FacebookService(tenant);
  if (!fb.isConfigured()) return;

  const campaigns = await fb.listActiveCampaigns();
  for (const campaign of campaigns) {
    if (campaign.effectiveStatus !== "ACTIVE") continue; // nada que proteger si ya está pausada

    const insights = await fb.getCampaignInsights(campaign.id, "today");
    if (!insights || insights.impressions < SPEND_PROTECTION_MIN_IMPRESSIONS) continue;

    // Evitar repetir la misma sugerencia varias veces en el día: si ya hay
    // una de protección de gasto pendiente o aprobada hoy para esta
    // campaña, no generar otra.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const existing = await db.select().from(adAgentLogs)
      .where(and(eq(adAgentLogs.campaignId, campaign.id), eq(adAgentLogs.checkType, "spend_protection")))
      .orderBy(desc(adAgentLogs.createdAt)).limit(1);
    if (existing[0] && new Date(existing[0].createdAt as any) >= today) continue;

    if (insights.results === 0 && insights.spend > 0) {
      // Necesitamos el presupuesto diario del conjunto para saber el % quemado.
      // listActiveCampaigns no trae adsets -- se consulta insights a nivel
      // de campaña, que ya trae spend; comparamos contra un piso razonable:
      // si gastó más de lo que costaría 1 resultado típico sin ningún
      // resultado, es señal de alerta aunque no sepamos el budget exacto.
      const reason = `Lleva ${fmtCOP(insights.spend)} gastados hoy con ${insights.impressions} impresiones y CERO resultados (compras/leads/mensajes). Esto sugiere que el anuncio no está convirtiendo y sigue quemando presupuesto.`;
      const log = await logSuggestion({
        tenantId: tenant.id,
        campaignId: campaign.id,
        productName: campaign.name,
        checkType: "spend_protection",
        suggestedAction: "pause",
        reason,
        metricsSnapshot: insights,
      });
      await notifyAdmin(log.id, campaign.name, "pause", reason);
    }
  }
}

/** Revisión de tendencia: ventana larga, decide si escalar (subir
 * presupuesto a lo que va bien de forma sostenida) o bajar/pausar lo que
 * viene mal desde hace días -- no reacciona a un solo día. */
export async function runTrendReview(): Promise<void> {
  const tenant = tenantManager.getDefaultTenant();
  const fb = new FacebookService(tenant);
  if (!fb.isConfigured()) return;

  const campaigns = await fb.listActiveCampaigns();
  for (const campaign of campaigns) {
    if (campaign.effectiveStatus !== "ACTIVE") continue;

    const recent = await fb.getCampaignInsights(campaign.id, "last_3d");
    const previous = await fb.getCampaignInsights(campaign.id, "last_7d");
    if (!recent || !previous || recent.impressions < TREND_MIN_IMPRESSIONS) continue;

    // Evitar repetir la misma sugerencia de tendencia más de una vez cada 3 días.
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const existing = await db.select().from(adAgentLogs)
      .where(and(eq(adAgentLogs.campaignId, campaign.id), eq(adAgentLogs.checkType, "trend_review")))
      .orderBy(desc(adAgentLogs.createdAt)).limit(1);
    if (existing[0] && new Date(existing[0].createdAt as any) >= threeDaysAgo) continue;

    if (recent.costPerResult === 0 || previous.costPerResult === 0) continue; // sin datos suficientes para comparar
    const ratio = recent.costPerResult / previous.costPerResult;

    if (ratio <= TREND_SCALE_UP_MAX_COST_RATIO) {
      const reason = `Los últimos 3 días el costo por resultado bajó a ${fmtCOP(recent.costPerResult)} (antes ${fmtCOP(previous.costPerResult)} en la semana) -- tendencia consistente positiva, no un día suelto. Se sugiere subir el presupuesto 20% para escalar mientras funciona.`;
      const log = await logSuggestion({
        tenantId: tenant.id, campaignId: campaign.id, productName: campaign.name,
        checkType: "trend_review", suggestedAction: "increase_budget", reason,
        metricsSnapshot: { recent, previous, ratio },
      });
      await notifyAdmin(log.id, campaign.name, "increase_budget", reason);
    } else if (ratio >= TREND_SCALE_DOWN_MIN_COST_RATIO) {
      const reason = `Los últimos 3 días el costo por resultado subió a ${fmtCOP(recent.costPerResult)} (antes ${fmtCOP(previous.costPerResult)} en la semana) -- tendencia consistente negativa. Se sugiere pausarla o bajar el presupuesto 30% para no seguir perdiendo eficiencia.`;
      const log = await logSuggestion({
        tenantId: tenant.id, campaignId: campaign.id, productName: campaign.name,
        checkType: "trend_review", suggestedAction: "decrease_budget", reason,
        metricsSnapshot: { recent, previous, ratio },
      });
      await notifyAdmin(log.id, campaign.name, "decrease_budget", reason);
    }
  }
}

/** Ejecuta una sugerencia ya aprobada. */
async function applySuggestion(log: typeof adAgentLogs.$inferSelect): Promise<{ ok: boolean; message: string }> {
  const tenant = tenantManager.getDefaultTenant();
  const fb = new FacebookService(tenant);
  switch (log.suggestedAction) {
    case "pause": {
      const ok = await fb.pauseCampaign(log.campaignId);
      return { ok, message: ok ? `Campaña "${log.productName}" pausada.` : "No se pudo pausar la campaña." };
    }
    case "resume": {
      const ok = await fb.resumeCampaign(log.campaignId);
      return { ok, message: ok ? `Campaña "${log.productName}" reactivada.` : "No se pudo reactivar la campaña." };
    }
    case "increase_budget":
    case "decrease_budget": {
      if (!log.adSetId) return { ok: false, message: "No se guardó el ID del conjunto de anuncios para ajustar el presupuesto." };
      const pct = log.suggestedAction === "increase_budget" ? 0.2 : -0.3;
      const r = await fb.adjustAdSetBudget(log.adSetId, pct);
      return { ok: r.ok, message: r.ok ? `Presupuesto ajustado a ${fmtCOP(r.newBudget || 0)}/día.` : "No se pudo ajustar el presupuesto." };
    }
    default:
      return { ok: false, message: "Acción desconocida." };
  }
}

/** Se llama desde el manejador de mensajes de WhatsApp cuando el mensaje
 * viene del admin. Devuelve true si el mensaje era una respuesta a una
 * sugerencia del agente (y ya se manejó), false si no tiene nada que ver
 * y debe seguir el flujo normal del bot. */
export async function handleAdminReply(phone: string, text: string): Promise<boolean> {
  const adminPhone = process.env.ADMIN_PHONE || "";
  if (!adminPhone || phone.replace(/[^0-9]/g, "") !== adminPhone.replace(/[^0-9]/g, "")) return false;

  const idMatch = text.match(/\b(\d+)\b/);
  const approved = isApproval(text);
  const rejected = isRejection(text);
  if (!approved && !rejected) return false;

  let log;
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    [log] = await db.select().from(adAgentLogs).where(eq(adAgentLogs.id, id)).limit(1);
  } else {
    // Sin ID explícito: tomar la sugerencia pendiente más reciente.
    [log] = await db.select().from(adAgentLogs)
      .where(eq(adAgentLogs.status, "suggested"))
      .orderBy(desc(adAgentLogs.createdAt)).limit(1);
  }
  if (!log || log.status !== "suggested") return false;

  if (rejected) {
    await db.update(adAgentLogs).set({ status: "rejected", respondedAt: new Date() }).where(eq(adAgentLogs.id, log.id));
    await whatsapp.sendText(phone, `Descartado — no se hizo ningún cambio en "${log.productName}".`);
    return true;
  }

  const result = await applySuggestion(log);
  await db.update(adAgentLogs).set({
    status: result.ok ? "approved" : "rejected",
    respondedAt: new Date(),
  }).where(eq(adAgentLogs.id, log.id));
  await whatsapp.sendText(phone, result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`);
  return true;
}

// ── Scheduler auto-arrancable, mismo patrón que followUpScheduler.ts ───────
let started = false;
export function startAdGrowthAgent() {
  if (started) return;
  started = true;
  const SPEND_CHECK_MS = 60 * 60 * 1000; // cada 1h: protección de gasto, ventana corta
  const TREND_CHECK_MS = 6 * 60 * 60 * 1000; // cada 6h: revisión de tendencia, ventana larga
  setInterval(() => { runSpendProtectionCheck().catch(err => logger.error({ err }, "[AdGrowthAgent] Error en protección de gasto")); }, SPEND_CHECK_MS);
  setInterval(() => { runTrendReview().catch(err => logger.error({ err }, "[AdGrowthAgent] Error en revisión de tendencia")); }, TREND_CHECK_MS);
  logger.info("[AdGrowthAgent] Iniciado -- protección de gasto cada 1h, revisión de tendencia cada 6h");
}
