/**
 * DIOS — VideoDios (UGC 18s Dios)
 * Guión pro con hook 0-2s, subs quemados karaoke, corte 1.2s, B-roll de TU producto, voz neural, avatar opcional stub.
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "../pro/research-deep";
export interface EscenaDios { seg:string; plano:string; voz:string; overlay:string; broll:string; }
export interface VideoDiosResult { duracion:"18s"; guion:EscenaDios[]; voz:"es-CO-SalomeNeural"|"es-CO-GonzaloNeural"; subs:"quemados_karaoke"; corte:"1.2s"; cta:string; avatar?: "none"|"heygen_stub"; }

export async function videoDios(
  product: ProductInfo,
  research: ResearchDeepResult,
  opts: { tenantId?: number; conAvatar?: boolean } = {},
): Promise<VideoDiosResult> {
  const fallback: EscenaDios[] = [
    { seg:"0-2s", plano:"Tú a cámara, producto en mano", voz: research.hooksPro[0]?.hook || `¿${product.name}?`, overlay:"HOOK GIGANTE", broll:"closeup producto en mano" },
    { seg:"2-6s", plano:"Dolor cotidiano sin producto", voz:"Yo también perdía tiempo así", overlay:"¿TE PASA?", broll:"persona frustrada sin producto" },
    { seg:"6-11s", plano:"Producto en uso, detalle", voz:`Con ${product.name} lo resuelves en minutos`, overlay:"EN USO REAL", broll:"uso real en contexto" },
    { seg:"11-15s", plano:"3 beneficios 1 por corte", voz:"Rápido, fácil y sin pagar de más", overlay:"3 BENEFICIOS", broll:"macro detalle + UI" },
    { seg:"15-17s", plano:"Precio framing", voz: product.price?`$${Number(product.price).toLocaleString("es-CO")} pago único`:"Pago seguro", overlay:"OFERTA ANCLADA", broll:"precio en pantalla" },
    { seg:"17-18s", plano:"CTA", voz:"Escríbenos y te lo dejo hoy", overlay:"ENVIAR MENSAJE →", broll:"mano señala botón WA" },
  ];
  const ai = await callMarketingAI<{ guion: EscenaDios[] }>({
    tenantId: opts.tenantId, json:true,
    systemPrompt:`Eres VideoDios, guionista UGC Dios 9:16. Hook 0-2s obligatorio, subs quemados karaoke, corte 1.2s, B-roll de TU producto (no genérico). JSON {"guion":[{"seg":str,"plano":str,"voz":str,"overlay":str,"broll":str}]}`,
    userPrompt:`Producto: ${product.name} — ${product.description?.slice(0,200)}\nHook: ${research.hooksPro[0]?.hook}\nProblema: ${research.problemaPrincipal}\nGuión 6 escenas 18s, voz max 18 palabras por escena.`,
  }).catch(()=>null);
  const guion = ai?.guion?.length ? ai.guion.slice(0,6) as EscenaDios[] : fallback;
  const esTecnico = /curso|excel|photoshop|inglés/i.test(product.name + (product.description||""));
  return { duracion:"18s", guion, voz: esTecnico?"es-CO-GonzaloNeural":"es-CO-SalomeNeural", subs:"quemados_karaoke", corte:"1.2s", cta:"Enviar mensaje por WhatsApp", avatar: opts.conAvatar?"heygen_stub":"none" };
}
