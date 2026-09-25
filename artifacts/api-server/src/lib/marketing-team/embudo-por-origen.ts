/**
 * Embudo por ORIGEN y PRODUCTO: anuncio → chat → producto → precio →
 * datos de pago → pagó/pidió → cobrado.
 *
 * Por qué existe (25-09-2026): el embudo anterior contaba leads,
 * conversaciones y pagos del negocio entero. No decía EN QUÉ PASO se cae
 * cada cliente ni separaba lo que trajo un anuncio de lo orgánico. Con 10
 * conversaciones reales y 0 cierres, lo primero es saber dónde se pierden
 * antes de gastar en más anuncios o experimentos.
 *
 * La etapa sale del estado que registra el motor v2 (`estado_agente.compra`,
 * hechos registrados por herramientas, no adivinados del texto) y del cobro
 * real en `payments`. Una conversación sin estado (motor viejo) cuenta solo
 * como "chat".
 */
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, conversations, leads, payments, products } from "@workspace/db";
import { toDbDate } from "../date-utils";

export const ETAPAS = ["chat", "producto", "precio", "datos_de_pago", "pago_o_pedido", "cobrado"] as const;
export type Etapa = (typeof ETAPAS)[number];

const ETAPA_DE_COMPRA: Record<string, number> = {
  ninguno: 0,
  interes: 0,
  producto_definido: 1,
  precio_dado: 2,
  listo_para_pagar: 3,
  pago_reportado: 4,
  pedido_creado: 4,
  pago_confirmado: 5,
  entregado: 5,
  cancelado: 0,
};

export interface FilaDeEmbudo {
  conversationId: number;
  /** "anuncio: <título o id>" | "anuncio (sin datos)" | "orgánico" */
  origen: string;
  producto: string;
  /** Índice en ETAPAS de lo más lejos que llegó. */
  etapa: number;
}

export interface GrupoDeEmbudo {
  origen: string;
  producto: string;
  /** Cuántos LLEGARON al menos a cada etapa (acumulado). */
  llegaron: Record<Etapa, number>;
  /** Dónde se quedaron: la etapa en que está parado cada uno. */
  sequedaron: Record<Etapa, number>;
}

function origenDe(lead: { source?: string | null; adContext?: any } | undefined): string {
  const ad = lead?.adContext || null;
  if (ad && (ad.adTitle || ad.adId)) return `anuncio: ${String(ad.adTitle || ad.adId).slice(0, 60)}`;
  if (lead?.source === "meta_ads" || ad) return "anuncio (sin datos)";
  return "orgánico";
}

/** Pura: agrupa filas por origen+producto. */
export function agruparEmbudo(filas: FilaDeEmbudo[]): GrupoDeEmbudo[] {
  const vacio = () => Object.fromEntries(ETAPAS.map((e) => [e, 0])) as Record<Etapa, number>;
  const grupos = new Map<string, GrupoDeEmbudo>();
  for (const f of filas) {
    const clave = `${f.origen}|${f.producto}`;
    const g = grupos.get(clave) ?? { origen: f.origen, producto: f.producto, llegaron: vacio(), sequedaron: vacio() };
    for (let i = 0; i <= f.etapa; i++) g.llegaron[ETAPAS[i]]++;
    g.sequedaron[ETAPAS[f.etapa]]++;
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.llegaron.chat - a.llegaron.chat);
}

/** Pura: el texto para el dueño. Dice dónde se cae la mayoría, no porcentajes vacíos. */
export function describirEmbudo(grupos: GrupoDeEmbudo[]): string {
  if (!grupos.length) return "No hubo conversaciones en esa ventana.";
  const NOMBRE: Record<Etapa, string> = {
    chat: "escribió",
    producto: "eligió producto",
    precio: "vio el precio",
    datos_de_pago: "recibió cómo pagar",
    pago_o_pedido: "pagó o pidió",
    cobrado: "cobrado",
  };
  return grupos
    .map((g) => {
      const camino = ETAPAS.map((e) => `${NOMBRE[e]} ${g.llegaron[e]}`).join(" → ");
      const noCobrados = ETAPAS.filter((e) => e !== "cobrado").map((e) => [e, g.sequedaron[e]] as const);
      const peor = noCobrados.sort((a, b) => b[1] - a[1])[0];
      const donde = peor && peor[1] > 0 ? ` · la mayoría se quedó en "${NOMBRE[peor[0]]}" (${peor[1]})` : "";
      return `• ${g.origen} · ${g.producto}: ${camino}${donde}`;
    })
    .join("\n");
}

/** Carga las conversaciones de la ventana y arma el embudo. */
export async function embudoPorOrigen(tenantId: number, dias = 30): Promise<{ grupos: GrupoDeEmbudo[]; texto: string; total: number }> {
  const desde = toDbDate(new Date(Date.now() - dias * 24 * 60 * 60 * 1000)) as any;
  const convs = await db
    .select({ id: conversations.id, leadId: conversations.leadId, estado: conversations.estadoAgente })
    .from(conversations)
    .where(and(eq(conversations.tenantId, tenantId), gte(conversations.createdAt, desde)));
  if (!convs.length) return { grupos: [], texto: describirEmbudo([]), total: 0 };

  const leadIds = [...new Set(convs.map((c: any) => c.leadId).filter(Boolean))] as number[];
  const filasLeads = leadIds.length
    ? await db.select({ id: leads.id, source: leads.source, adContext: leads.adContext }).from(leads).where(inArray(leads.id, leadIds))
    : [];
  const leadPorId = new Map(filasLeads.map((l: any) => [l.id, l]));

  const cobradas = await db
    .select({ conversationId: payments.conversationId, leadId: payments.leadId, status: payments.status, paymentStatus: payments.paymentStatus })
    .from(payments)
    .where(eq(payments.tenantId, tenantId));
  const pago = (p: any) => ["confirmed", "approved"].includes(String(p.status).toLowerCase()) || ["confirmed", "approved"].includes(String(p.paymentStatus).toLowerCase());
  const cobradoConv = new Set(cobradas.filter(pago).map((p: any) => p.conversationId).filter(Boolean));
  const cobradoLead = new Set(cobradas.filter(pago).map((p: any) => p.leadId).filter(Boolean));

  const estadoDe = (v: unknown): any => {
    if (!v) return {};
    if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
    return v;
  };
  const focoIds = [...new Set(convs.map((c: any) => Number(estadoDe(c.estado).productoEnFoco)).filter((n: number) => Number.isFinite(n) && n > 0))] as number[];
  const nombres = focoIds.length
    ? new Map((await db.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, focoIds))).map((p: any) => [p.id, p.name]))
    : new Map();

  const filas: FilaDeEmbudo[] = convs.map((c: any) => {
    const e = estadoDe(c.estado);
    let etapa = ETAPA_DE_COMPRA[String(e.compra || "ninguno")] ?? 0;
    if (cobradoConv.has(c.id) || (c.leadId && cobradoLead.has(c.leadId))) etapa = 5;
    const foco = Number(e.productoEnFoco);
    return {
      conversationId: c.id,
      origen: origenDe(leadPorId.get(c.leadId) as any),
      producto: Number.isFinite(foco) && foco > 0 ? String(nombres.get(foco) || `#${foco}`) : "sin producto",
      etapa,
    };
  });

  const grupos = agruparEmbudo(filas);
  return { grupos, texto: describirEmbudo(grupos), total: filas.length };
}
