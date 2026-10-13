/**
 * Evidencia de conversación para Atlas. Todo el rango se calcula en Bogotá;
 * incluye extractos reales, atribución disponible y seguimientos pendientes.
 * Las conversaciones sintéticas de evaluación nunca cuentan como clientes.
 */
import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db, conversations, messages, leads, products, followUps, payments, facebookDrafts } from "@workspace/db";
import { condicionConversacionOperativa } from "./conversation-query";
import { rangoHoyColombia } from "./date-utils";

function limiteDeConsulta(d: Date): Date | string {
  return process.env.USE_SQLITE === "true" ? d.toISOString().slice(0, 19).replace("T", " ") : d;
}

function objeto(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as any;
  try { return JSON.parse(String(raw)); } catch { return {}; }
}

function epoch(raw: unknown): number {
  if (raw instanceof Date) return raw.getTime();
  const s = String(raw || "").trim();
  if (!s) return 0;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(" ", "T")}Z`);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function horaBogota(raw: unknown): string | null {
  const ms = epoch(raw);
  if (!ms) return null;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ms));
}

function adDeLead(lead: any, drafts: any[], catalogo: Array<{ id: number; name: string }>): Record<string, string | number | null> | null {
  const a = objeto(lead?.adContext);
  if (!Object.keys(a).length) return null;
  const adId = String(a.adId || "");
  const draft = adId ? drafts.find((d) => String(d.adId || "") === adId) : null;
  const textoAd = `${a.adTitle || ""} ${a.adBody || ""} ${a.adUrl || ""}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const coincidenciasExactas = catalogo.filter((p) => {
    const nombre = String(p.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return nombre.length >= 8 && textoAd.includes(nombre);
  });
  const producto = (draft?.productId ? catalogo.find((p) => p.id === draft.productId) : null)
    || (coincidenciasExactas.length === 1 ? coincidenciasExactas[0] : null);
  return {
    fuente: String(lead?.source || ""),
    origen: String(a.origen || ""),
    anuncioId: adId,
    titulo: String(a.adTitle || ""),
    cuerpo: String(a.adBody || ""),
    url: String(a.adUrl || ""),
    productoIdAnuncio: producto?.id ?? null,
    productoAnuncio: producto?.name ?? null,
    atribucionProducto: draft?.productId && producto ? "borrador-meta-por-adId" : producto ? "nombre-exacto-en-anuncio" : "no_resuelta",
  };
}

export interface RevisionConversacionesHoy {
  fechaColombia: string;
  zonaHoraria: "America/Bogota";
  conversaciones: number;
  chatsIncluidos: number;
  mensajes: number;
  pagosConfirmados: number;
  totalPagado: number;
  porEtapa: Record<string, number>;
  chats: Array<{
    id: number;
    cliente: string;
    etapa: string | null;
    estado: string;
    ultimoMensaje: string | null;
    actividad: string | null;
    anuncio: Record<string, string | number | null> | null;
    fichasQueSalieron: string[];
    oportunidad: OportunidadHoy;
    seguimiento: { fecha: string | null; etapa: string | null; prioridad: string | null; mensaje: string | null } | null;
    transcripcion: Array<{ hora: string | null; rol: "cliente" | "vendedor" | string; texto: string }>;
  }>;
}

export type OportunidadHoy = "respuesta_pendiente" | "espera_cliente" | "seguimiento_programado" | "sin_seguimiento" | "marcada_perdida";

/** No llama “venta perdida” a un lead caliente que sigue esperando respuesta. */
export function clasificarOportunidadHoy(etapa: string | null | undefined, ultimoRol: string | undefined, tieneSeguimiento: boolean): OportunidadHoy {
  if (String(etapa || "").toLowerCase() === "lost") return "marcada_perdida";
  const interes = ["hot", "qualified", "negotiating", "closing"].includes(String(etapa || "").toLowerCase());
  if (interes && ultimoRol === "customer") return "respuesta_pendiente";
  if (tieneSeguimiento) return "seguimiento_programado";
  if (interes && ultimoRol === "agent") return "espera_cliente";
  return "sin_seguimiento";
}

/** Revisión factual de los chats de hoy, no un resumen inferido de la bandeja. */
export async function revisarConversacionesDeHoy(
  tenantId: number,
  opts: { limite?: number; ahora?: Date } = {},
): Promise<RevisionConversacionesHoy> {
  const { desde, hasta, etiqueta } = rangoHoyColombia(opts.ahora);
  const limite = Math.max(1, Math.min(Math.trunc(Number(opts.limite) || 20), 30));
  const desdeDb = limiteDeConsulta(desde) as any;
  const hastaDb = limiteDeConsulta(hasta) as any;
  type ConvRow = { id: number; leadId: number | null; contactName: string; currentStage: string | null; status: string; lastMessage: string | null; lastMessageAt: Date | string | null };
  const todasConvs = await db.select({
    id: conversations.id,
    leadId: conversations.leadId,
    contactName: conversations.contactName,
    currentStage: conversations.currentStage,
    status: conversations.status,
    lastMessage: conversations.lastMessage,
    lastMessageAt: conversations.lastMessageAt,
  }).from(conversations).where(and(
    eq(conversations.tenantId, tenantId),
    gte(conversations.lastMessageAt, desdeDb),
    lt(conversations.lastMessageAt, hastaDb),
    condicionConversacionOperativa(),
  )).orderBy(desc(conversations.lastMessageAt)).limit(1000) as unknown as ConvRow[];
  const convs: ConvRow[] = todasConvs.slice(0, limite);

  const ids: number[] = convs.map((c: ConvRow) => c.id);
  const idsTodas: number[] = todasConvs.map((c: ConvRow) => c.id);
  if (!todasConvs.length) {
    return { fechaColombia: etiqueta, zonaHoraria: "America/Bogota", conversaciones: 0, chatsIncluidos: 0, mensajes: 0, pagosConfirmados: 0, totalPagado: 0, porEtapa: {}, chats: [] };
  }

  const [conteoMensajes, mensajes, prospectos, catalogo, pendientes, pagos] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(messages).where(and(
      inArray(messages.conversationId, idsTodas),
      gte(messages.createdAt, desdeDb),
      lt(messages.createdAt, hastaDb),
    )),
    db.select({ conversationId: messages.conversationId, role: messages.role, content: messages.content, metadata: messages.metadata, createdAt: messages.createdAt })
      .from(messages).where(and(
        inArray(messages.conversationId, ids),
        gte(messages.createdAt, desdeDb),
        lt(messages.createdAt, hastaDb),
      )).orderBy(desc(messages.createdAt)).limit(3000),
    db.select({ id: leads.id, source: leads.source, adContext: leads.adContext })
      .from(leads).where(and(eq(leads.tenantId, tenantId), inArray(leads.id, convs.map((c: ConvRow) => c.leadId).filter((id: number | null): id is number => id != null)))),
    db.select({ id: products.id, name: products.name }).from(products).where(eq(products.tenantId, tenantId)).limit(1000),
    db.select({ conversationId: followUps.conversationId, scheduledFor: followUps.scheduledFor, stage: followUps.stage, priority: followUps.priority, message: followUps.message })
      .from(followUps).where(and(inArray(followUps.conversationId, ids), eq(followUps.completed, false))).orderBy(desc(followUps.scheduledFor)),
    db.select({ amount: payments.amount, status: payments.status, paymentStatus: payments.paymentStatus, verifiedAt: payments.verifiedAt, updatedAt: payments.updatedAt, createdAt: payments.createdAt, conversationId: payments.conversationId })
      .from(payments).where(and(eq(payments.tenantId, tenantId), or(
        eq(payments.status, "confirmed"), eq(payments.status, "approved"),
        eq(payments.paymentStatus, "confirmed"), eq(payments.paymentStatus, "approved"),
      ))).limit(1000),
  ]);

  const leadById = new Map((prospectos as any[]).map((l) => [l.id, l]));
  const productNames = (catalogo as any[]).map((p) => ({ id: p.id, name: String(p.name || "") }));
  const adIds = [...new Set((prospectos as any[]).map((l) => String(objeto(l.adContext).adId || "")).filter(Boolean))];
  const drafts = adIds.length
    ? await db.select({ adId: facebookDrafts.adId, productId: facebookDrafts.productId })
        .from(facebookDrafts).where(and(eq(facebookDrafts.tenantId, tenantId), inArray(facebookDrafts.adId, adIds)))
    : [];
  const msgsByConversation = new Map<number, any[]>();
  for (const m of mensajes as any[]) {
    const a = msgsByConversation.get(m.conversationId) || [];
    a.push(m);
    msgsByConversation.set(m.conversationId, a);
  }
  for (const a of msgsByConversation.values()) a.sort((x, y) => epoch(x.createdAt) - epoch(y.createdAt));
  const followUpByConversation = new Map<number, any>();
  for (const f of pendientes as any[]) {
    if (!followUpByConversation.has(f.conversationId)) followUpByConversation.set(f.conversationId, f);
  }
  const porEtapa: Record<string, number> = {};
  for (const c of todasConvs) porEtapa[String(c.currentStage || "sin_etapa")] = (porEtapa[String(c.currentStage || "sin_etapa")] || 0) + 1;

  const pagosConfirmados = (pagos as any[]).filter((p) => {
    const fecha = epoch(p.verifiedAt || p.updatedAt || p.createdAt);
    return fecha >= desde.getTime() && fecha < hasta.getTime();
  });

  const chats = convs.map((c: ConvRow) => {
    const historial = msgsByConversation.get(c.id) || [];
    const fichaSet = new Set<string>();
    for (const m of historial) {
      const contenido = String(m.content || "");
      const meta = objeto(m.metadata);
      const idsFicha = [meta.productId, ...(Array.isArray(meta.cardProductIds) ? meta.cardProductIds : []), ...(Array.isArray(meta.partes) ? meta.partes.filter((x: any) => x?.kind === "card").map((x: any) => x.productId) : [])]
        .map(Number).filter((x: number) => Number.isFinite(x) && x > 0);
      for (const id of idsFicha) {
        const p = productNames.find((x) => x.id === id);
        if (p) fichaSet.add(p.name);
      }
      if (/\[ficha\s/i.test(contenido)) {
        for (const p of productNames) if (contenido.includes(p.name)) fichaSet.add(p.name);
      }
    }
    const l = c.leadId == null ? null : leadById.get(c.leadId);
    const f = followUpByConversation.get(c.id);
    const ultimoRol = historial[historial.length - 1]?.role;
    const oportunidad = clasificarOportunidadHoy(c.currentStage, ultimoRol, !!f);
    return {
      id: c.id,
      cliente: c.contactName,
      etapa: c.currentStage ?? null,
      estado: c.status,
      ultimoMensaje: c.lastMessage ? String(c.lastMessage).slice(0, 500) : null,
      actividad: horaBogota(c.lastMessageAt),
      anuncio: adDeLead(l, drafts as any[], productNames),
      fichasQueSalieron: [...fichaSet],
      oportunidad,
      seguimiento: f ? { fecha: horaBogota(f.scheduledFor), etapa: f.stage ?? null, prioridad: f.priority ?? null, mensaje: String(f.message || "").slice(0, 240) } : null,
      transcripcion: historial.slice(-10).map((m) => ({
        hora: horaBogota(m.createdAt),
        rol: m.role === "customer" ? "cliente" : m.role === "agent" ? "vendedor" : String(m.role),
        texto: String(m.content || "").slice(0, 500),
      })),
    };
  });
  return {
    fechaColombia: etiqueta,
    zonaHoraria: "America/Bogota",
    conversaciones: todasConvs.length,
    chatsIncluidos: convs.length,
    mensajes: Number((conteoMensajes as any[])[0]?.total) || 0,
    pagosConfirmados: pagosConfirmados.length,
    totalPagado: pagosConfirmados.reduce((n, p: any) => n + (Number(p.amount) || 0), 0),
    porEtapa,
    chats,
  };
}
