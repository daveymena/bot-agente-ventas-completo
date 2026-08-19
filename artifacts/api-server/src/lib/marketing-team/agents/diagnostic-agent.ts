/**
 * MARKETING TEAM — DiagnosticAgent (MASTER PLAN §15)
 * 
 * Diagnostica el embudo completo: impresión → CTR → click → landing →
 * lead → WhatsApp → conversación → venta → recompra. Señala en qué eslabón
 * está el problema y deriva al equipo correcto (sales, oferta, producto) en
 * lugar de intentar arreglarlo todo desde publicidad.
 */

import type { AgentHandoff } from "../types";
import { getFunnelSnapshot, getAttributionSummary } from "../attribution";

export interface DiagnosticResult {
  embudo: {
    eslabon: string;
    estado: "🟢" | "🟡" | "🔴";
    observacion: string;
  }[];
  conclusion: string;
  derivaciones: string[]; // a qué agentes/equipos se deriva
  accionesInmediatas: string[];
}

export async function diagnostic(
  input: { tenantId: number; days?: number },
): Promise<AgentHandoff<DiagnosticResult>> {
  const days = input.days ?? 30;
  const funnel = await getFunnelSnapshot(input.tenantId, days);
  const attribution = await getAttributionSummary(input.tenantId, days);

  const embudo: DiagnosticResult["embudo"] = [];

  // Eslabón 1: adquisición (leads)
  const leadsOk = funnel.leads > 0;
  embudo.push({
    eslabon: "Adquisición (leads)",
    estado: leadsOk ? "🟢" : "🔴",
    observacion: leadsOk
      ? `${funnel.leads} leads en ${days} días${attribution.rows.length ? `, de los cuales ${attribution.rows.filter((r) => r.adId !== "desconocido").length} con contexto de anuncio (atribución activa).` : ", ninguno con contexto de anuncio (revisar que el píxel/click-to-WhatsApp esté enviando ctwaClid)."}`
      : `Sin leads en ${days} días: el problema está en adquisición (audiencias, creativos, presupuesto) o no llegan anuncios.`,
  });

  // Eslabón 2: conversación
  const convoRate = funnel.leadToConversationRate;
  embudo.push({
    eslabon: "Lead → Conversación",
    estado: convoRate >= 80 ? "🟢" : convoRate >= 50 ? "🟡" : "🔴",
    observacion: `${convoRate}% de los leads abren conversación. ${convoRate < 80 ? "Revisar si los leads reciben respuesta del bot y si el primer mensaje es claro." : "Saludable."}`,
  });

  // Eslabón 3: venta
  const convToPaid = funnel.conversationToPaidRate;
  const paidOk = convToPaid >= 10;
  embudo.push({
    eslabon: "Conversación → Venta",
    estado: paidOk ? "🟢" : convToPaid >= 3 ? "🟡" : "🔴",
    observacion: `${convToPaid}% de las conversaciones terminan en venta confirmada. ${!paidOk ? "El embudo se cae en la conversación: oferta, tiempo de respuesta o seguimiento." : "Saludable."}`,
  });

  // Eslabón 4: ingreso
  embudo.push({
    eslabon: "Ingresos",
    estado: funnel.revenue > 0 ? "🟢" : "🔴",
    observacion: `${funnel.revenue.toLocaleString("es-CO")} en ingresos confirmados en ${days} días (${funnel.paid} ventas).`,
  });

  const adquisicionOK = funnel.leads > 0;
  const conversionMala = !paidOk;
  const conclusion = adquisicionOK && conversionMala
    ? "La adquisición genera oportunidades, pero la conversión a venta es baja: el problema NO está en los anuncios, está después del clic."
    : !adquisicionOK
      ? "El problema está en la adquisición: sin leads no hay embudo que optimizar."
      : "El embudo está funcionando dentro de rangos aceptables; continuar escalando ganadores con cautela.";

  const derivaciones: string[] = [];
  const acciones: string[] = [];

  if (adquisicionOK && conversionMala) {
    derivaciones.push("SalesAgent (calidad de lead, cierre)", "FollowUpAgent (seguimiento)", "OfferStrategist (oferta y precio)");
    acciones.push("Revisar tiempo de respuesta del bot en WhatsApp", "Revisar la oferta y garantía visibles", "Activar follow-up automático para leads tibios");
  } else if (!adquisicionOK) {
    derivaciones.push("MetaAdsManager (campañas y presupuesto)", "CreativeDirector (creativos)", "AudienceStrategist (públicos)");
    acciones.push("Verificar que las campañas estén activas y con presupuesto", "Renovar creativos u hooks", "Revisar segmentación y audiencias");
  }

  return {
    agent: "DiagnosticAgent",
    domain: "marketing",
    kind: "DiagnosticResult",
    data: { embudo, conclusion, derivaciones, accionesInmediatas: acciones },
    summary: conclusion,
    createdAt: new Date().toISOString(),
  };
}
