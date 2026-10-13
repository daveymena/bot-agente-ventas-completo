/**
 * AGENCIA PRO — VideoFactory Pro
 * ===============================
 * Guión UGC vertical 9:16 (1080x1920), 15-25s, con subs quemados y cortes cada 1.5s.
 * Reutiliza EdgeTTS + ffmpeg del pipeline existente, pero con guión pro (hook 0-2s,
 * prueba, framing de precio) en vez de plantilla genérica.
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "./research-deep";
import type { CopyProVariant } from "./copy-pro";

export interface EscenaPro {
  seg: string; // "0-2s"
  plano: string; // qué se ve
  voz: string; // qué dice (max 22 palabras)
  overlay: string; // texto quemado en pantalla
}

export interface VideoFactoryProResult {
  sigla: string; // "UGC-15s"
  guion: EscenaPro[];
  vozRecomendada: "es-CO-SalomeNeural" | "es-CO-GonzaloNeural";
  musica: "sin_musica" | "suave_baja";
  ctaFinal: string;
  promptPexels: string; // para buscar B-roll si no hay UGC real
}

function fallbackGuion(product: ProductInfo, research: ResearchDeepResult, copy: CopyProVariant[]): EscenaPro[] {
  const hook = copy[0]?.hook || research.hooksPro[0]?.hook || `¿Conoces ${product.name}?`;
  const precio = product.price ? `$${Number(product.price).toLocaleString("es-CO")}` : "";
  return [
    { seg: "0-2s", plano: "Close-up persona mirando a cámara, producto en mano", voz: hook.slice(0, 80), overlay: hook.split(" ").slice(0,5).join(" ") },
    { seg: "2-6s", plano: "Problema cotidiano sin producto (ej. espalda cargada / pantalla sin saber)", voz: "Yo también pasaba horas así, sin ver resultado.", overlay: "¿Te pasa?" },
    { seg: "6-12s", plano: "Producto en uso, detalle anclado", voz: `Con ${product.name} noté la diferencia desde el primer uso.`, overlay: "En uso real" },
    { seg: "12-18s", plano: "3 cortes rápidos: 1 beneficio por corte con overlay", voz: "Cómodo, discreto y lo ajustas a tu medida.", overlay: "3 beneficios · 1 por corte" },
    { seg: "18-23s", plano: "Precio en pantalla + entrega", voz: precio ? `Está en ${precio} y lo pagas al recibir.` : "Pago seguro y entrega verificada.", overlay: precio ? `${precio} · Pago contraentrega` : "Entrega verificada" },
    { seg: "23-25s", plano: "CTA mano señalando botón WhatsApp", voz: "Escríbenos por WhatsApp y te lo apartamos.", overlay: "Enviar mensaje por WhatsApp →" },
  ];
}

export async function videoFactoryPro(
  product: ProductInfo,
  research: ResearchDeepResult,
  copyVariants: CopyProVariant[],
  opts: { tenantId?: number; duracion?: "15s"|"25s" } = {},
): Promise<VideoFactoryProResult> {
  const ai = await callMarketingAI<{ guion: EscenaPro[]; promptPexels: string }>({
    tenantId: opts.tenantId,
    json: true,
    maxTokens: 1200,
    systemPrompt:
      `Eres VideoFactory Pro, guionista UGC vertical 9:16 para Meta (15-25s, hook 0-2s obligatorio, subs quemados, cortes cada 1.5s).\n` +
      `Entregas guión listo para EdgeTTS + ffmpeg.\n` +
      `Reglas:\n` +
      `• Escena 1 (0-2s) = HOOK en mayúsculas en overlay + pregunta directa. Si falla, el video muere.\n` +
      `• Voz max 22 palabras por escena, español neutro, tono cercano (no locutor).\n` +
      `• Overlay = palabras clave del hook/beneficio, no frases largas.\n` +
      `• NUNCA inventes precio/envío gratis/garantía/testimonio.\n` +
      `• JSON: {"guion":[{"seg":str,"plano":str,"voz":str,"overlay":str}],"promptPexels":str}\n`,
    userPrompt:
      `Producto: ${product.name}\n` +
      `Descripción: ${product.description?.slice(0, 300) || ""}\n` +
      `Precio: ${product.price ? `${product.currency||"COP"} ${product.price}` : "sin precio"}\n` +
      `Hook principal: ${copyVariants[0]?.hook || research.hooksPro[0]?.hook}\n` +
      `Problema: ${research.problemaPrincipal}\n` +
      `Beneficios de copy: ${copyVariants[0]?.primaryText.split("✅").slice(1,4).join(" | ").slice(0,200) || ""}\n` +
      `Duración: ${opts.duracion || "15-25s"} | Entrega guión 6 escenas.\n` +
      `promptPexels: 2-3 keywords en inglés para B-roll si no hay UGC real (ej. "posture corrector office").`,
  });

  const guion: EscenaPro[] = (ai?.guion?.length
    ? ai.guion.slice(0, 6).map((e: any) => ({
        seg: String(e.seg || "").slice(0, 10),
        plano: String(e.plano || "").slice(0, 120),
        voz: String(e.voz || "").slice(0, 130),
        overlay: String(e.overlay || "").slice(0, 40),
      }))
    : fallbackGuion(product, research, copyVariants)
  );

  // Voz: por defecto SalomeMujer para físico/cuidado, Gonzalo para técnico/curso
  const esTecnico = /curso|clase|software|ia|programaci/i.test(product.name + (product.description||""));
  const vozRecomendada = esTecnico ? "es-CO-GonzaloNeural" : "es-CO-SalomeNeural";

  return {
    sigla: opts.duracion === "25s" ? "UGC-25s" : "UGC-15s",
    guion,
    vozRecomendada,
    musica: "suave_baja",
    ctaFinal: copyVariants[0]?.cta || "Enviar mensaje por WhatsApp",
    promptPexels: (ai as any)?.promptPexels ? String((ai as any).promptPexels).slice(0, 80) : `${product.name} lifestyle`,
  };
}
