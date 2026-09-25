/**
 * ============================================================
 * MARKETING TEAM — ATTRIBUTION (Fase 5 / GAP-1)
 * ============================================================
 * Cierra el circuito de atribución ad → lead → venta que estaba
 * cortado: el contexto del anuncio llegaba a messages.metadata y
 * moría ahí. Ahora:
 *
 *   Meta click-to-WhatsApp
 *     → extraerContextoDeAnuncio() (whatsapp.ts)
 *     → message-handler.ts copia adContext al lead
 *     → este módulo cruza leads.adContext con payments
 *     → CAC / ROAS / conversión REALES por anuncio
 *
 * La atribución es por ctwaClid (adId) y por adTitle (fallback para
 * instalaciones que no guardaron el adId). Nunca inventa datos: si no
 * hay spend de Meta (insights), cpa/roas se reportan como null y el
 * sistema optimiza con las métricas reales que sí tiene.
 */

import { db, leads, payments, conversations, messages } from "@workspace/db";
import { eq, and, gte, desc, isNotNull, count, inArray } from "drizzle-orm";
import type { AdAttribution, FunnelSnapshot } from "./types";
import { toDbDate } from "../date-utils";

export interface AnuncioContext {
  titulo: string;
  cuerpo: string;
  url: string;
  anuncioId: string;
  /** "ctwa_ad"/"fb_ads" cuando WhatsApp marcó el origen sin externalAdReply. */
  origen?: string;
}

const CONFIRMED_STATUSES = new Set(["confirmed", "approved"]);

function isConfirmedPayment(p: { status: string | null; paymentStatus: string | null }): boolean {
  return (
    CONFIRMED_STATUSES.has(String(p.status).toLowerCase()) ||
    CONFIRMED_STATUSES.has(String(p.paymentStatus).toLowerCase())
  );
}

/** Copia el contexto del anuncio al lead al crearlo/actualizarlo (GAP-1 fix). */
export async function attachAdContextToLead(
  leadId: number | null | undefined,
  anuncio: AnuncioContext | undefined,
): Promise<void> {
  if (!leadId || !anuncio) return;
  try {
    await db
      .update(leads)
      .set({
        source: "meta_ads",
        adContext: {
          adId: anuncio.anuncioId || undefined,
          adTitle: anuncio.titulo || undefined,
          adBody: anuncio.cuerpo || undefined,
          adUrl: anuncio.url || undefined,
          origen: anuncio.origen || undefined,
          capturedAt: new Date().toISOString(),
        },
      })
      .where(eq(leads.id, leadId));
  } catch (err) {
    console.error("[Attribution] No se pudo adjuntar adContext al lead", leadId, err);
  }
}

/**
 * Atribución agregada por anuncio: cruza leads (adContext) con payments
 * confirmados (vía leadId/conversationId) para el tenant y ventana de días.
 *
 * @param spendByAd opcional: { [adId o adTitle]: spend } desde insights de Meta.
 */
export async function getAttributionSummary(
  tenantId: number,
  days = 30,
  spendByAd: Record<string, number> = {},
): Promise<{ rows: AdAttribution[]; totalLeads: number; totalPaid: number; totalRevenue: number }> {
  // La fecha va con toDbDate(), el MISMO helper que usa followUpScheduler.ts:
  // con SQLite (sql.js) las columnas timestamp son `text` y el driver rechaza
  // bindear un objeto Date crudo ("Wrong API use: tried to bind a value of an
  // unknown type"). Con Postgres, Drizzle espera un Date y lo serializa él.
  // toDbDate() devuelve el formato correcto para el motor activo en cada caso.
  const since = toDbDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)) as any;

  const leadRows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.adContext), gte(leads.createdAt, since)));

  const payRows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), gte(payments.createdAt, since)));

  const paidByLead = new Map<number, { count: number; revenue: number }>();
  for (const p of payRows) {
    if (!isConfirmedPayment(p)) continue;
    const key = p.leadId ?? p.conversationId;
    if (key == null) continue;
    const cur = paidByLead.get(key) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += Number(p.amount) || 0;
    paidByLead.set(key, cur);
  }

  const buckets = new Map<string, { adId: string; adTitle: string; leads: number; paid: number; revenue: number }>();
  let totalLeads = 0;
  let totalPaid = 0;
  let totalRevenue = 0;

  for (const l of leadRows) {
    const ctx = l.adContext as { adId?: string; adTitle?: string } | null;
    const adId = ctx?.adId?.trim() || ctx?.adTitle?.trim() || "desconocido";
    const title = ctx?.adTitle?.trim() || ctx?.adId?.trim() || "Sin título de anuncio";

    const key = adId || title;
    const cur = buckets.get(key) ?? { adId, adTitle: title, leads: 0, paid: 0, revenue: 0 };
    cur.leads += 1;
    totalLeads += 1;

    const paid = paidByLead.get(l.id);
    if (paid) {
      cur.paid += paid.count;
      cur.revenue += paid.revenue;
      totalPaid += paid.count;
      totalRevenue += paid.revenue;
    }
    buckets.set(key, cur);
  }

  const rows: AdAttribution[] = [...buckets.values()]
    .map((b) => {
      const spend = spendByAd[b.adId] ?? spendByAd[b.adTitle];
      return {
        adId: b.adId,
        adTitle: b.adTitle,
        leads: b.leads,
        conversations: b.leads, // el primer mensaje del click-to-WhatsApp abre conversación
        paid: b.paid,
        revenue: Math.round(b.revenue * 100) / 100,
        conversionRate: b.leads > 0 ? Math.round((b.paid / b.leads) * 10000) / 100 : 0,
        avgOrderValue: b.paid > 0 ? Math.round((b.revenue / b.paid) * 100) / 100 : 0,
        spend: spend != null ? Math.round(spend * 100) / 100 : undefined,
        cpa: spend != null && b.paid > 0 ? Math.round((spend / b.paid) * 100) / 100 : undefined,
        roas: spend != null && spend > 0 ? Math.round((b.revenue / spend) * 100) / 100 : undefined,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  return { rows, totalLeads, totalPaid, totalRevenue: Math.round(totalRevenue * 100) / 100 };
}

/**
 * Embudo completo del DiagnosticAgent (MASTER PLAN §15): impresión →
 * CTR → click → lead → conversación → venta → ingreso. Solo reporta
 * los eslabones que el sistema puede medir de verdad.
 */
export async function getFunnelSnapshot(tenantId: number, days = 30): Promise<FunnelSnapshot> {
  // Mismo criterio que getAttributionSummary: toDbDate() para que la fecha
  // bindee bien tanto en SQLite (text) como en Postgres (timestamp/Date).
  const since = toDbDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)) as any;

  const [leadCount] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), gte(leads.createdAt, since)));

  const [convoCount] = await db
    .select({ n: count() })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, since)));

  // messages no tiene tenantId: se filtra por las conversaciones del tenant.
  // Sin esto, un negocio veía los mensajes de todos los demás en su embudo.
  const convIds = db.select({ id: conversations.id }).from(conversations).where(eq(conversations.tenantId, tenantId));
  const [msgCount] = await db
    .select({ n: count() })
    .from(messages)
    .where(and(gte(messages.createdAt, since), inArray(messages.conversationId, convIds)));

  const payRows = await db
    .select({ amount: payments.amount, status: payments.status, paymentStatus: payments.paymentStatus })
    .from(payments)
    .where(and(eq(payments.tenantId, tenantId), gte(payments.createdAt, since)));

  let paid = 0;
  let revenue = 0;
  for (const p of payRows) {
    if (isConfirmedPayment(p)) {
      paid += 1;
      revenue += Number(p.amount) || 0;
    }
  }

  const leadsN = leadCount?.n ?? 0;
  const convosN = convoCount?.n ?? 0;

  return {
    leads: leadsN,
    conversations: convosN,
    paid,
    revenue: Math.round(revenue * 100) / 100,
    leadToConversationRate: leadsN > 0 ? Math.round((convosN / leadsN) * 10000) / 100 : 0,
    conversationToPaidRate: convosN > 0 ? Math.round((paid / convosN) * 10000) / 100 : 0,
    ...(msgCount?.n != null ? { messages: msgCount.n } : {}),
  };
}

/** Últimos leads con contexto de anuncio (para debugging / dashboard). */
export async function listLeadsWithAdContext(tenantId: number, limit = 50) {
  return db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      source: leads.source,
      adContext: leads.adContext,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.adContext)))
    .orderBy(desc(leads.createdAt))
    .limit(limit);
}
