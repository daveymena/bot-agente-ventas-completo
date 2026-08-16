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
import { db, adAgentLogs, tenants } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { getWhatsAppForTenant } from "./whatsapp-factory";
import { isApproval, isRejection } from "./architect-store";
import { FacebookService } from "./facebook";
import { tenantManager, type TenantContext } from "./tenantManager";
import { architectMemoryService } from "./architect-memory-service";

/**
 * Confianza basada en el tamaño de muestra REAL de la campaña, no un número
 * fijo -- más impresiones reales respaldando la decisión, más confianza.
 */
function sampleBasedConfidence(impressions: number): number {
  return Math.min(40 + Math.floor(impressions / 100), 95);
}

/**
 * Cierra el ciclo de aprendizaje: si el admin ya rechazó esta MISMA acción
 * para esta MISMA campaña recientemente, se lo recuerda en la nueva
 * sugerencia en vez de repetirla como si fuera la primera vez.
 */
async function recentRejectionNote(tenantId: number, campaignName: string, action: string): Promise<string> {
  try {
    const memories = await architectMemoryService.retrieveRelevantMemories(tenantId, campaignName, 10);
    const rejection = memories.find((m) => m.tags?.includes(action) && m.tags?.includes("rejected"));
    if (!rejection) return "";
    return `\n\n🧠 Nota: ya rechazaste una sugerencia similar (${action}) para esta campaña antes -- si sigue sin convencerte, decime "no" de nuevo y dejo de repetirla por un tiempo.`;
  } catch {
    return "";
  }
}

// Umbrales conservadores y auditables a propósito -- se pueden ajustar sin
// tocar la lógica de decisión.
const SPEND_PROTECTION_MIN_IMPRESSIONS = 500; // no juzgar con muestra chica
const TREND_MIN_IMPRESSIONS = 1000;
const TREND_SCALE_UP_MAX_COST_RATIO = 0.7; // costo/resultado actual <= 70% de la ventana anterior => va bien
const TREND_SCALE_DOWN_MIN_COST_RATIO = 1.5; // costo/resultado actual >= 150% de la ventana anterior => va mal

// Tope de gasto diario, en la moneda de la cuenta publicitaria. 0 lo
// desactiva, que es el valor por defecto -- nadie se encuentra de golpe con
// que le pausaron los anuncios por un límite que no configuró.
//
// ESTE ES EL ÚNICO CHEQUEO QUE ACTÚA SIN PEDIR CONFIRMACIÓN, y es a
// propósito: un tope que espera un "sí" por WhatsApp no es un tope. Si salta
// a las 3 de la mañana y el admin duerme, el presupuesto se sigue quemando
// hasta que despierte. Es defendible porque solo puede REDUCIR gasto (pausa),
// nunca aumentarlo, así que el peor error posible es dejar de gastar de más.
// Todo lo demás -- escalar, bajar, pausar por rendimiento -- sigue esperando
// la aprobación explícita del admin.
const DAILY_SPEND_CAP = Number(process.env.FB_DAILY_SPEND_CAP || 0);

/**
 * Todos los negocios activos, no solo el primero. Antes cada chequeo hacía
 * `tenantManager.getDefaultTenant()`, así que en una instalación con varios
 * negocios el agente vigilaba UNO y los demás gastaban sin supervisión.
 * Si la consulta falla se cae al tenant por defecto: es preferible vigilar
 * uno a no vigilar ninguno.
 */
async function getAdTenants(): Promise<TenantContext[]> {
  try {
    const rows = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, "active"));
    const out: TenantContext[] = [];
    for (const r of rows) {
      const t = await tenantManager.getTenantById(r.id);
      if (t) out.push(t);
    }
    return out.length > 0 ? out : [tenantManager.getDefaultTenant()];
  } catch (err) {
    logger.warn({ err }, "[AdGrowthAgent] No se pudieron listar los negocios, se usa el de por defecto");
    return [tenantManager.getDefaultTenant()];
  }
}

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
  checkType: "spend_protection" | "trend_review" | "daily_cap";
  suggestedAction: "pause" | "resume" | "increase_budget" | "decrease_budget" | null;
  status?: "suggested" | "applied";
  reason: string;
  metricsSnapshot: any;
}) {
  const [row] = await db.insert(adAgentLogs).values({
    tenantId: entry.tenantId,
    campaignId: entry.campaignId,
    adSetId: entry.adSetId || null,
    productName: entry.productName || null,
    checkType: entry.checkType,
    status: entry.status || (entry.suggestedAction ? "suggested" : "no_action"),
    suggestedAction: entry.suggestedAction,
    reason: entry.reason,
    metricsSnapshot: entry.metricsSnapshot,
  }).returning();
  return row;
}

async function notifyAdmin(tenantId: number, logId: number, campaignName: string, action: string, reason: string) {
  const phone = await getAdminPhone();
  if (!phone) {
    logger.warn("[AdGrowthAgent] ADMIN_PHONE no configurado, no se puede notificar la sugerencia");
    return;
  }
  // Antes usaba el singleton "./whatsapp" (instancia standalone que nunca se
  // inicia) -- isConnected() daba SIEMPRE false, así que ninguna sugerencia
  // del agente de anuncios llegaba nunca por WhatsApp, solo quedaba
  // registrada en la BD. getWhatsAppForTenant(tenantId) es la instancia real.
  const wa = getWhatsAppForTenant(tenantId);
  if (!wa.isConnected()) {
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
    await wa.sendText(phone, text);
  } catch (err) {
    logger.warn({ err }, "[AdGrowthAgent] Error enviando sugerencia por WhatsApp");
  }
}

/**
 * Freno de gasto diario: suma lo gastado HOY por todas las campañas activas
 * del negocio y, si pasa el tope, las pausa TODAS y avisa.
 *
 * A diferencia del resto del agente, este chequeo ejecuta sin pedir permiso
 * (ver el comentario de DAILY_SPEND_CAP arriba). Solo pausa: jamás sube
 * presupuestos ni reactiva nada.
 */
export async function runDailyBudgetGuard(): Promise<void> {
  if (!(DAILY_SPEND_CAP > 0)) return; // desactivado por defecto

  for (const tenant of await getAdTenants()) {
    try {
      const fb = new FacebookService(tenant);
      if (!fb.isConfigured()) continue;

      const activas = (await fb.listActiveCampaigns()).filter((c) => c.effectiveStatus === "ACTIVE");
      if (activas.length === 0) continue;

      let gastoTotal = 0;
      const conGasto: { id: string; name: string; spend: number }[] = [];
      for (const c of activas) {
        const ins = await fb.getCampaignInsights(c.id, "today");
        if (!ins) continue;
        gastoTotal += ins.spend;
        conGasto.push({ id: c.id, name: c.name, spend: ins.spend });
      }

      if (gastoTotal < DAILY_SPEND_CAP) continue;

      // Una sola vez por día: sin esto, al correr cada hora volvería a pausar
      // (y a avisar) campañas que el admin pudo haber reactivado a mano.
      const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
      const previo = await db.select().from(adAgentLogs)
        .where(and(eq(adAgentLogs.checkType, "daily_cap"), eq(adAgentLogs.tenantId, tenant.id)))
        .orderBy(desc(adAgentLogs.createdAt)).limit(1);
      if (previo[0] && new Date(previo[0].createdAt as any) >= hoy) continue;

      const pausadas: string[] = [];
      for (const c of conGasto) {
        if (await fb.pauseCampaign(c.id)) pausadas.push(c.name);
      }

      const razon =
        `Tope diario alcanzado: ${fmtCOP(gastoTotal)} gastados hoy (límite ${fmtCOP(DAILY_SPEND_CAP)}). ` +
        `Se pausaron ${pausadas.length} de ${conGasto.length} campañas activas para no seguir gastando.`;

      const log = await logSuggestion({
        tenantId: tenant.id,
        campaignId: conGasto.map((c) => c.id).join(","),
        productName: `${pausadas.length} campañas`,
        checkType: "daily_cap",
        suggestedAction: "pause",
        status: "applied", // ya ejecutado, no queda esperando aprobación
        reason: razon,
        metricsSnapshot: { gastoTotal, tope: DAILY_SPEND_CAP, campanas: conGasto, pausadas },
      });

      await notifyAdminExecuted(tenant, log.id, razon, pausadas);
      logger.warn({ tenantId: tenant.id, gastoTotal, tope: DAILY_SPEND_CAP }, "[AdGrowthAgent] Tope diario alcanzado, campañas pausadas");
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "[AdGrowthAgent] Error en el freno de gasto diario");
    }
  }
}

/** Aviso de algo YA EJECUTADO -- no pide confirmación, informa. */
async function notifyAdminExecuted(tenant: TenantContext, logId: number, reason: string, pausadas: string[]) {
  const phone = await getAdminPhone();
  const wa = getWhatsAppForTenant(tenant.id);
  if (!phone || !wa.isConnected()) return;
  const lista = pausadas.length ? `\n\n⏸️ Pausadas:\n${pausadas.map((n) => `· ${n}`).join("\n")}` : "";
  const text =
    `🛑 *Freno de gasto* — registro #${logId}\n` +
    `Negocio: *${tenant.brandName || tenant.name}*\n\n` +
    `${reason}${lista}\n\n` +
    `Ya está aplicado, no hace falta que respondas. Para reactivarlas, hacelo desde Ads Manager cuando quieras.`;
  try {
    await wa.sendText(phone, text);
  } catch (err) {
    logger.warn({ err }, "[AdGrowthAgent] Error avisando del freno de gasto");
  }
}

/** Protección de gasto: ventana corta, revisa si una campaña activa se está
 * comiendo el presupuesto sin resultados. Corre seguido a propósito. */
export async function runSpendProtectionCheck(): Promise<void> {
  for (const tenant of await getAdTenants()) {
    try {
      await spendProtectionForTenant(tenant);
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "[AdGrowthAgent] Error en protección de gasto del negocio");
    }
  }
}

async function spendProtectionForTenant(tenant: TenantContext): Promise<void> {
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
      await notifyAdmin(tenant.id, log.id, campaign.name, "pause", reason);
    }
  }
}

/** Revisión de tendencia: ventana larga, decide si escalar (subir
 * presupuesto a lo que va bien de forma sostenida) o bajar/pausar lo que
 * viene mal desde hace días -- no reacciona a un solo día. */
export async function runTrendReview(): Promise<void> {
  for (const tenant of await getAdTenants()) {
    try {
      await trendReviewForTenant(tenant);
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "[AdGrowthAgent] Error en revisión de tendencia del negocio");
    }
  }
}

async function trendReviewForTenant(tenant: TenantContext): Promise<void> {
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
      const memoryNote = await recentRejectionNote(tenant.id, campaign.name, "increase_budget");
      const reason = `Los últimos 3 días el costo por resultado bajó a ${fmtCOP(recent.costPerResult)} (antes ${fmtCOP(previous.costPerResult)} en la semana) -- tendencia consistente positiva, no un día suelto. Se sugiere subir el presupuesto 20% para escalar mientras funciona.${memoryNote}`;
      const log = await logSuggestion({
        tenantId: tenant.id, campaignId: campaign.id, productName: campaign.name,
        checkType: "trend_review", suggestedAction: "increase_budget", reason,
        metricsSnapshot: { recent, previous, ratio },
      });
      await notifyAdmin(tenant.id, log.id, campaign.name, "increase_budget", reason);
    } else if (ratio >= TREND_SCALE_DOWN_MIN_COST_RATIO) {
      const memoryNote = await recentRejectionNote(tenant.id, campaign.name, "decrease_budget");
      const reason = `Los últimos 3 días el costo por resultado subió a ${fmtCOP(recent.costPerResult)} (antes ${fmtCOP(previous.costPerResult)} en la semana) -- tendencia consistente negativa. Se sugiere pausarla o bajar el presupuesto 30% para no seguir perdiendo eficiencia.${memoryNote}`;
      const log = await logSuggestion({
        tenantId: tenant.id, campaignId: campaign.id, productName: campaign.name,
        checkType: "trend_review", suggestedAction: "decrease_budget", reason,
        metricsSnapshot: { recent, previous, ratio },
      });
      await notifyAdmin(tenant.id, log.id, campaign.name, "decrease_budget", reason);
    }
  }
}

/** Ejecuta una sugerencia ya aprobada. */
async function applySuggestion(log: typeof adAgentLogs.$inferSelect): Promise<{ ok: boolean; message: string }> {
  // El tenant sale del LOG, no del por defecto: ahora que el agente vigila
  // varios negocios, aplicar con las credenciales del primero tocaría la
  // cuenta publicitaria equivocada -- pausaría la campaña de otro negocio, o
  // fallaría porque ese id no existe en esa cuenta.
  const tenant = (log.tenantId ? await tenantManager.getTenantById(log.tenantId) : null)
    || tenantManager.getDefaultTenant();
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

  // La instancia correcta es la del negocio dueño de esta sugerencia
  // (log.tenantId), no un singleton global -- mismo criterio que ya usa
  // applySuggestion() más abajo para esta misma fila.
  const wa = getWhatsAppForTenant(log.tenantId ?? undefined);

  if (rejected) {
    await db.update(adAgentLogs).set({ status: "rejected", respondedAt: new Date() }).where(eq(adAgentLogs.id, log.id));
    await wa.sendText(phone, `Descartado — no se hizo ningún cambio en "${log.productName}".`);
    if (log.tenantId) {
      const impressions = (log.metricsSnapshot as any)?.impressions ?? (log.metricsSnapshot as any)?.recent?.impressions ?? 0;
      await architectMemoryService.recordLearning(
        log.tenantId,
        "observation",
        `❌ Sugerencia rechazada: ${log.checkType} → ${log.suggestedAction} (${log.productName})`,
        `El admin rechazó la sugerencia. Razón registrada del sistema: ${log.reason}`,
        ["ad-agent", log.checkType, String(log.suggestedAction), "rejected"],
        { confidence: sampleBasedConfidence(impressions), impact: 50, source: "ad-growth-agent" },
      );
    }
    return true;
  }

  const result = await applySuggestion(log);
  await db.update(adAgentLogs).set({
    status: result.ok ? "approved" : "rejected",
    respondedAt: new Date(),
  }).where(eq(adAgentLogs.id, log.id));
  await wa.sendText(phone, result.ok ? `✅ ${result.message}` : `⚠️ ${result.message}`);
  if (log.tenantId) {
    const impressions = (log.metricsSnapshot as any)?.impressions ?? (log.metricsSnapshot as any)?.recent?.impressions ?? 0;
    await architectMemoryService.recordLearning(
      log.tenantId,
      "decision",
      `${result.ok ? "✅" : "⚠️"} Sugerencia aplicada: ${log.checkType} → ${log.suggestedAction} (${log.productName})`,
      `${log.reason}\nResultado real al aplicarla: ${result.message}`,
      ["ad-agent", log.checkType, String(log.suggestedAction), result.ok ? "applied-ok" : "applied-failed"],
      { confidence: sampleBasedConfidence(impressions), impact: result.ok ? 80 : 40, source: "ad-growth-agent" },
    );
  }
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

  // Una primera pasada poco después de arrancar, sin esperar el intervalo.
  //
  // Con solo setInterval, la primera revisión de gasto caía recién a la hora
  // de haber arrancado, y la de tendencia a las 6 horas -- y CADA reinicio o
  // despliegue vuelve el reloj a cero. Entre despliegues seguidos, el agente
  // no llegaba a correr nunca: por eso su historial mostraba "0 revisiones"
  // aunque la pantalla prometiera que revisa cada 1h y 6h. Justamente el
  // guardián que evita gastar de más era el que nunca se despertaba.
  //
  // Los 2 minutos son para no competir con el arranque (WhatsApp
  // reconectando, migraciones, carga de claves).
  const ARRANQUE_MS = 2 * 60 * 1000;
  setTimeout(() => {
    logger.info("[AdGrowthAgent] Primera revisión tras el arranque");
    runSpendProtectionCheck().catch(err => logger.error({ err }, "[AdGrowthAgent] Error en la primera protección de gasto"));
    runTrendReview().catch(err => logger.error({ err }, "[AdGrowthAgent] Error en la primera revisión de tendencia"));
  }, ARRANQUE_MS).unref?.();

  // El freno de gasto corre más seguido que los demás: es el único que
  // detiene dinero saliendo, y cada 15 min acota cuánto se puede pasar del
  // tope antes de que alguien lo note.
  if (DAILY_SPEND_CAP > 0) {
    const CAP_CHECK_MS = 15 * 60 * 1000;
    setInterval(() => { runDailyBudgetGuard().catch(err => logger.error({ err }, "[AdGrowthAgent] Error en el freno de gasto diario")); }, CAP_CHECK_MS);
    logger.info(`[AdGrowthAgent] Freno de gasto diario activo en ${DAILY_SPEND_CAP} (revisión cada 15 min)`);
  } else {
    // Que no quede apagado en silencio: es el único mecanismo que detiene
    // dinero saliendo si una campaña se dispara.
    logger.warn("[AdGrowthAgent] SIN freno de gasto diario: FB_DAILY_SPEND_CAP no está configurado, no hay tope automático de gasto en anuncios");
  }
  logger.info("[AdGrowthAgent] Iniciado -- protección de gasto cada 1h, revisión de tendencia cada 6h");
}
