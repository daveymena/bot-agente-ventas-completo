/**
 * Envío de campañas de remarketing (email / WhatsApp) a leads guardados.
 *
 * PROGRESIVO, NO MASIVO: una campaña nunca sale de una sola vez. Se encola
 * completa (todos los destinatarios calculados al momento de crearla) y
 * remarketing-scheduler.ts la va vaciando de a poco, en tandas espaciadas en
 * el tiempo -- así el patrón de envío no se parece a un blast, que es lo que
 * más fácil hace que Meta/WhatsApp marque o restrinja el número del negocio.
 * Encolar (email_campaign_send / whatsapp_broadcast_send) es siempre una tool
 * NO read-only (ver DESTRUCTIVE_TOOLS en app-operator.ts) -- el admin ya tuvo
 * que confirmar el plan (destinatarios + mensaje exactos) antes de que esto
 * cree la campaña. No hay ningún camino que la dispare sin esa confirmación.
 */
import { db, leads, remarketingCampaigns, conversations, messages } from "@workspace/db";
import { eq, and, notInArray, inArray } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

// Token de baja firmado -- antes /api/public/unsubscribe?leadId=123 confiaba
// en el ID crudo, secuencial y adivinable: cualquiera podía probar leadId=1,
// 2, 3... y dar de baja leads de OTROS negocios sin login ni permiso. Un HMAC
// del propio leadId con COOKIE_SECRET (el mismo secreto que ya firma las
// cookies de sesión) hace que el link solo sea válido si salió de acá -- no
// hay que guardar el token en ninguna tabla nueva, se puede recalcular.
function unsubscribeSecret(): string {
  return process.env.COOKIE_SECRET || "dev-only-unsubscribe-secret-insecure";
}

export function buildUnsubscribeToken(leadId: number): string {
  return createHmac("sha256", unsubscribeSecret()).update(String(leadId)).digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(leadId: number, token: string): boolean {
  if (!token || token.length !== 32) return false;
  const expected = Buffer.from(buildUnsubscribeToken(leadId), "hex");
  const given = Buffer.from(token, "hex");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

// Techo de seguridad por campaña -- evita que un segmento mal filtrado
// encole miles de envíos de una sola vez. Si el segmento es más grande, la
// tool devuelve error y pide acotar (por stage, por ejemplo) en vez de
// truncar en silencio. WhatsApp queda más bajo que email: aunque el envío ya
// es progresivo (ver remarketing-scheduler.ts), una campaña más chica es una
// capa extra de cuidado dado el riesgo real de que Meta banee el número.
const MAX_EMAIL_RECIPIENTS_PER_CAMPAIGN = 300;
const MAX_WHATSAPP_RECIPIENTS_PER_CAMPAIGN = 80;

// Etapas que representan clientes YA convertidos o que se dieron de baja del
// embudo -- "remarketing a clientes potenciales" no incluye a estos por
// default (mandarle a un "converted" es upsell, un caso distinto; mandarle a
// un "lost" es justo lo que un cliente potencial NO quiere). Si el admin
// pide explícitamente un stage puntual, eso manda por sobre esta exclusión.
const DEFAULT_EXCLUDED_STAGES = ["converted", "lost"];

async function targetLeads(tenantId: number, stage?: string) {
  const conditions = [eq(leads.tenantId, tenantId), eq(leads.optOut, false)];
  if (stage) {
    conditions.push(eq(leads.stage, stage));
  } else {
    conditions.push(notInArray(leads.stage, DEFAULT_EXCLUDED_STAGES));
  }
  return db.select().from(leads).where(and(...conditions));
}

/**
 * De esos leads, los que ALGUNA VEZ escribieron por WhatsApp.
 *
 * Es el filtro que más protege el número, y faltaba. Escribirle a alguien que
 * nunca te escribió es la causa numero uno de bloqueo -- muy por encima del
 * volumen: el que no esperaba tu mensaje toca "Bloquear y reportar", y con
 * pocos reportes Meta baja el numero. No hay espaciado ni tope que compense
 * eso.
 *
 * Un lead puede haber entrado de cualquier lado: importado de una planilla,
 * cargado a mano, de un formulario web. `targetLeads` solo miraba etapa y
 * opt-out, asi que todos esos entraban en la campaña sin haber iniciado nunca
 * una conversación.
 *
 * Se exige un mensaje ENTRANTE (`role: "customer"`), no que exista la
 * conversación: el propio bot puede haber creado el hilo al escribir primero,
 * y eso no es permiso de nadie.
 */
async function losQueEscribieron(tenantId: number, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  try {
    const filas = await db
      .select({ leadId: conversations.leadId })
      .from(conversations)
      .innerJoin(messages, eq(messages.conversationId, conversations.id))
      .where(and(
        eq(conversations.tenantId, tenantId),
        inArray(conversations.leadId, ids),
        eq(messages.role, "customer"),
      ));
    return new Set(filas.map((f: any) => Number(f.leadId)).filter(Boolean));
  } catch (err: any) {
    // Ante la duda, NO se manda. Un fallo de consulta no puede convertirse en
    // permiso para escribirle a gente que nunca escribió.
    logger.error({ err: err?.message, tenantId }, "[Remarketing] no se pudo verificar quién escribió: no se envía a nadie");
    return new Set();
  }
}

export interface QueueResult {
  ok: boolean;
  summary: string;
  campaignId?: number;
  totalTargeted: number;
}

export async function queueEmailCampaign(
  tenantId: number,
  opts: { subject: string; html: string; stage?: string },
): Promise<QueueResult> {
  const targets = await targetLeads(tenantId, opts.stage);
  const withEmail = targets.filter((l: any) => !!l.email);
  if (withEmail.length === 0) {
    return { ok: false, summary: "No hay leads con email guardado en ese segmento (potenciales, sin contar ya convertidos/perdidos salvo que pidas un stage puntual).", totalTargeted: 0 };
  }
  if (withEmail.length > MAX_EMAIL_RECIPIENTS_PER_CAMPAIGN) {
    return {
      ok: false,
      summary: `El segmento tiene ${withEmail.length} leads con email, por encima del máximo de ${MAX_EMAIL_RECIPIENTS_PER_CAMPAIGN} por campaña. Acotá con "stage" o dividí en varias campañas.`,
      totalTargeted: withEmail.length,
    };
  }

  const [campaign] = await db.insert(remarketingCampaigns).values({
    tenantId, channel: "email", segment: opts.stage ? `stage=${opts.stage}` : "potenciales (sin convertidos/perdidos)",
    subject: opts.subject, message: opts.html,
    status: "queued",
    pendingLeadIds: withEmail.map((l: any) => l.id),
    totalTargeted: withEmail.length,
  } as any).returning();

  logger.info({ tenantId, campaignId: campaign.id, total: withEmail.length }, "[Remarketing] Campaña de email encolada");
  return {
    ok: true,
    campaignId: campaign.id,
    totalTargeted: withEmail.length,
    summary: `📧 Campaña encolada para ${withEmail.length} leads con email. Se va a ir mandando gradualmente (no toda de una) durante las próximas horas para cuidar la reputación del remitente -- podés revisar el avance en remarketing_campaigns #${campaign.id}.`,
  };
}

export async function queueWhatsappBroadcast(
  tenantId: number,
  opts: { message: string; stage?: string },
): Promise<QueueResult> {
  const candidatos = await targetLeads(tenantId, opts.stage);
  if (candidatos.length === 0) {
    return { ok: false, summary: "No hay leads en ese segmento (potenciales, sin contar ya convertidos/perdidos salvo que pidas un stage puntual).", totalTargeted: 0 };
  }

  // Solo a quien ya escribió por WhatsApp. Ver `losQueEscribieron`: es la
  // proteccion que mas cuida el numero, y no aplica al email --ahi escribirle
  // a un lead que dejo su correo es normal--, por eso va solo en este canal.
  const escribieron = await losQueEscribieron(tenantId, candidatos.map((l: any) => l.id));
  const targets = candidatos.filter((l: any) => escribieron.has(l.id));
  const descartados = candidatos.length - targets.length;

  if (targets.length === 0) {
    return {
      ok: false,
      summary:
        `Ninguno de los ${candidatos.length} leads del segmento escribió antes por WhatsApp. ` +
        `No se envía: escribirle a quien no inició la conversación es lo que hace que reporten el número. ` +
        `Para estos, usá email o esperá a que escriban.`,
      totalTargeted: 0,
    };
  }
  if (targets.length > MAX_WHATSAPP_RECIPIENTS_PER_CAMPAIGN) {
    return {
      ok: false,
      summary: `El segmento tiene ${targets.length} leads, por encima del máximo de ${MAX_WHATSAPP_RECIPIENTS_PER_CAMPAIGN} por campaña de WhatsApp. Acotá con "stage" o dividí en varias campañas.`,
      totalTargeted: targets.length,
    };
  }

  const [campaign] = await db.insert(remarketingCampaigns).values({
    tenantId, channel: "whatsapp", segment: opts.stage ? `stage=${opts.stage}` : "potenciales (sin convertidos/perdidos)",
    message: opts.message,
    status: "queued",
    pendingLeadIds: targets.map((l: any) => l.id),
    totalTargeted: targets.length,
  } as any).returning();

  logger.info({ tenantId, campaignId: campaign.id, total: targets.length }, "[Remarketing] Broadcast de WhatsApp encolado");
  return {
    ok: true,
    campaignId: campaign.id,
    totalTargeted: targets.length,
    summary:
      `📲 Broadcast encolado para ${targets.length} leads` +
      (descartados > 0
        ? ` (se dejaron fuera ${descartados} que nunca escribieron por WhatsApp: mandarles a ellos es lo que hace que reporten el número)`
        : "") +
      `. Se va a ir mandando en tandas chicas espaciadas durante el día (no en ráfaga) para no arriesgar el número -- podés revisar el avance en remarketing_campaigns #${campaign.id}.`,
  };
}
