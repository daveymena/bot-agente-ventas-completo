/**
 * Leads de FORMULARIO de Meta (objetivo Clientes potenciales), por negocio.
 *
 * Antes el webhook tenía `const tenantId = 1`: el lead de la página de
 * CUALQUIER negocio se guardaba en el negocio 1 y la bienvenida salía por el
 * WhatsApp del dueño de la plataforma. En un SaaS eso es entregarle los
 * clientes de una empresa a otra (25-09-2026). Ahora el negocio sale de la
 * PÁGINA que generó el lead, y todo (token, CRM, WhatsApp, país) es el suyo.
 */
import { db, tenants, leads, conversations, messages } from "@workspace/db";
import { tenantManager } from "./tenantManager";
import { logger } from "./logger";
import { FB_GRAPH_BASE } from "./meta-api-version";

/** El negocio dueño de esta página de Facebook, o null si ninguno la conectó. */
export async function tenantDePagina(pageId: string): Promise<{ id: number; tenant: any } | null> {
  const buscado = String(pageId || "").trim();
  if (!buscado) return null;
  const filas = await db.select({ id: tenants.id }).from(tenants);
  for (const f of filas) {
    const t: any = await tenantManager.getTenantById(Number(f.id)).catch(() => null);
    if (t && String(t?.facebook?.pageId || "").trim() === buscado) return { id: Number(f.id), tenant: t };
  }
  // La página del .env es del dueño del servidor, y solo de él.
  if (process.env.FB_PAGE_ID && process.env.FB_PAGE_ID === buscado) {
    const d: any = tenantManager.getDefaultTenant();
    return d ? { id: Number(d.id), tenant: d } : null;
  }
  return null;
}

const INDICATIVO: Record<string, string> = {
  colombia: "57", mexico: "52", méxico: "52", peru: "51", perú: "51", chile: "56", ecuador: "593",
  argentina: "54", venezuela: "58", bolivia: "591", paraguay: "595", uruguay: "598", panama: "507", panamá: "507",
  "costa rica": "506", guatemala: "502", "el salvador": "503", honduras: "504", nicaragua: "505",
  "republica dominicana": "1", "república dominicana": "1", "estados unidos": "1", espana: "34", españa: "34",
};

/** Teléfono con indicativo del país del negocio (no siempre +57). */
export function telefonoConIndicativo(telefono: string, pais: string | null | undefined): string {
  const limpio = String(telefono || "").replace(/[^0-9]/g, "");
  if (!limpio) return "";
  const ind = INDICATIVO[String(pais || "colombia").toLowerCase().trim()] || "57";
  if (String(telefono).trim().startsWith("+")) return limpio;
  return limpio.startsWith(ind) && limpio.length > 10 ? limpio : `${ind}${limpio}`;
}

/** Los campos del lead como vienen de Graph (field_data). */
export function camposDelLead(leadData: any): { nombre: string; telefono: string; email: string; ciudad: string; comentario: string } {
  const campos = Array.isArray(leadData?.field_data) ? leadData.field_data : [];
  const v = (...nombres: string[]) => {
    for (const n of nombres) {
      const c = campos.find((f: any) => String(f?.name || "").toLowerCase() === n);
      if (c?.values?.[0]) return String(c.values[0]);
    }
    return "";
  };
  return {
    nombre: v("full_name", "name", "nombre", "first_name") || "Cliente de formulario",
    telefono: v("phone_number", "phone", "telefono", "celular", "whatsapp"),
    email: v("email", "correo"),
    ciudad: v("city", "ciudad"),
    comentario: v("comments", "message", "mensaje", "comentario"),
  };
}

/** Procesa un lead que avisó Meta: lo guarda en el negocio correcto y le escribe por SU WhatsApp. */
export async function procesarLeadDeFormulario(p: { leadgenId: string; pageId: string; formId?: string | null; adId?: string | null }): Promise<{ ok: boolean; motivo?: string; tenantId?: number; leadId?: number }> {
  const dueno = await tenantDePagina(p.pageId);
  if (!dueno) {
    logger.warn({ pageId: p.pageId, leadgenId: p.leadgenId }, "[Leads] Ningún negocio tiene conectada esta página: el lead no se asigna a nadie");
    return { ok: false, motivo: "página sin negocio" };
  }
  const { FacebookService } = await import("./facebook");
  const fb = new FacebookService(dueno.tenant);
  const token = (fb as any).config?.accessToken || (fb as any).config?.userAccessToken;
  if (!token) return { ok: false, motivo: "el negocio no tiene token de Facebook", tenantId: dueno.id };

  let leadData: any = null;
  try {
    const r = await fetch(`${FB_GRAPH_BASE}/${encodeURIComponent(p.leadgenId)}?fields=field_data,ad_id,form_id,created_time&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(15000) });
    leadData = await r.json();
  } catch (e: any) {
    return { ok: false, motivo: `Graph no respondió: ${e?.message || e}`, tenantId: dueno.id };
  }
  if (!leadData || leadData.error) return { ok: false, motivo: `Graph: ${leadData?.error?.message || "sin datos"}`, tenantId: dueno.id };

  const c = camposDelLead(leadData);
  const { getBusinessContext } = await import("./business-context");
  const negocio: any = await getBusinessContext(dueno.id).catch(() => null);
  const pais = negocio?.condiciones?.pais || "Colombia";
  const telefono = telefonoConIndicativo(c.telefono, pais);

  const [lead] = await db.insert(leads).values({
    tenantId: dueno.id,
    name: c.nombre,
    phone: telefono || null,
    email: c.email || null,
    stage: "new",
    source: "meta_formulario",
    adContext: { adId: String(leadData.ad_id || p.adId || "") || undefined, formId: String(leadData.form_id || p.formId || "") || undefined, capturedAt: new Date().toISOString() } as any,
  } as any).returning();

  if (!telefono) {
    logger.warn({ tenantId: dueno.id, leadId: lead?.id }, "[Leads] Lead de formulario sin teléfono: queda en el CRM, no se puede escribir por WhatsApp");
    return { ok: true, tenantId: dueno.id, leadId: lead?.id };
  }

  const [conv] = await db.insert(conversations).values({
    tenantId: dueno.id, contactName: c.nombre, contactPhone: telefono, status: "ai", currentStage: "greeting", leadId: lead.id,
  } as any).returning();
  await db.insert(messages).values({
    conversationId: conv.id, role: "customer",
    content: c.comentario || `Llené el formulario del anuncio${c.ciudad ? ` (desde ${c.ciudad})` : ""} y quiero más información.`,
  } as any);

  try {
    const { getWhatsAppForTenant } = await import("./whatsapp-factory");
    const wa: any = getWhatsAppForTenant(dueno.id, dueno.tenant);
    if (wa?.isConnected?.()) {
      const nombreNegocio = negocio?.businessName || dueno.tenant?.brandName || "nuestro equipo";
      const pila = String(c.nombre).split(/\s+/)[0];
      await wa.sendText(telefono, `¡Hola ${pila}! 👋 Gracias por dejar tus datos en el anuncio de ${nombreNegocio}. ¿En qué te puedo ayudar?`);
    } else {
      logger.warn({ tenantId: dueno.id }, "[Leads] El WhatsApp del negocio no está conectado: el lead queda en el CRM sin bienvenida");
    }
  } catch (e: any) {
    logger.warn({ err: e?.message, tenantId: dueno.id }, "[Leads] No se pudo mandar la bienvenida por WhatsApp");
  }
  return { ok: true, tenantId: dueno.id, leadId: lead?.id };
}
