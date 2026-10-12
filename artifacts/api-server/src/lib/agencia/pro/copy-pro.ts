/**
 * AGENCIA PRO — CopyPro
 * =====================
 * Escribe copy que vende. 9 hooks de ResearchDeep → 3 variantes curadas
 * (no 27, no 1 sola) + validación anti-invento antes de salir.
 *
 * Score mínimo 70 para publicar (validador compartido).
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult, HookPro } from "./research-deep";
import { validarCopy, type ValidadorResultado } from "./validate-score";

export interface CopyProVariant {
  primaryText: string;
  headline: string; // ≤40 chars
  description: string;
  cta: string;
  hook: string;
  arquetipo: string;
  angulo: string;
  score?: number;
  motivos?: string[];
}

export interface CopyProResult {
  variants: CopyProVariant[];
  followUpWA: string;
  validacion: ValidadorResultado;
  notas: string[];
}

const CTA_POR_OBJETIVO: Record<string, string> = {
  mensajes: "Enviar mensaje por WhatsApp",
  ventas: "Comprar ahora",
  trafico: "Ver más",
  leads: "Registrarme",
  default: "Enviar mensaje por WhatsApp",
};

function ctaPara(objetivo?: string): string {
  return CTA_POR_OBJETIVO[objetivo || ""] || CTA_POR_OBJETIVO.default!;
}

function formatPrecio(p?: number, cur?: string): string {
  if (p == null) return "";
  return `$${Number(p).toLocaleString("es-CO")} ${cur || "COP"}`;
}

function fallbackCopy(product: ProductInfo, hooks: HookPro[], objetivo?: string): CopyProVariant[] {
  const precio = formatPrecio(product.price, product.currency);
  const desc = (product.description || "").split("\n")[0]?.slice(0, 90) || product.name;
  const cta = ctaPara(objetivo);
  return hooks.slice(0, 3).map((h) => ({
    hook: h.hook,
    arquetipo: h.arquetipo,
    angulo: h.angulo,
    primaryText:
      `${h.hook}\n\n` +
      `${desc}\n\n` +
      `✅ ${h.angulo}\n` +
      `✅ Entrega verificada\n` +
      `✅ Soporte real\n\n` +
      `━━━━━━━━━━━━━━\n` +
      `${precio ? `💰 ${product.name} — ${precio}\n` : ""}` +
      `━━━━━━━━━━━━━━\n\n` +
      `👇 ${cta}`,
    headline: h.hook.slice(0, 40),
    description: precio ? `${precio} · ${h.angulo.slice(0, 40)}` : h.angulo.slice(0, 60),
    cta,
  }));
}

export async function copyPro(
  product: ProductInfo,
  research: ResearchDeepResult,
  opts: { tenantId?: number; objetivo?: string; modeloEntrega?: "digital"|"fisico" } = {},
): Promise<CopyProResult> {
  const modelo = opts.modeloEntrega || (product.category === "dropshipping" ? "fisico" : "digital");
  const hooks = research.hooksPro?.length ? research.hooksPro : [];
  // Tomar 3 hooks de arquetipos distintos para las variantes (no 3 del mismo dolor)
  const elegidos = hooks.length >= 3 ? [hooks[0]!, hooks[3]!, hooks[6]!].filter(Boolean) : hooks.slice(0, 3);

  const ai = await callMarketingAI<{ variants: CopyProVariant[]; followUpWA: string }>({
    tenantId: opts.tenantId,
    json: true,
    maxTokens: 1600,
    systemPrompt:
      `Eres CopyPro, redactor performance para Meta Ads (español, país ${research.pais}).\n` +
      `Escribes 3 variantes de anuncio, cada una desde UN hook distinto (uno por variante, no mezcles).\n` +
      `Estructura obligatoria por variante:\n` +
      `1) Hook en 1ª línea (el que te doy, puede pulir 2-3 palabras, no cambiar la idea).\n` +
      `2) 1 línea de contexto (para quién / qué resuelve).\n` +
      `3) 3 bullets con emoji (beneficio → característica como prueba, no característica suelta).\n` +
      `4) Bloque precio con framing + entrega (Drive de por vida / contraentrega + envío a ${research.pais}).\n` +
      `5) 1 CTA solo, al final.\n` +
      `Reglas:\n` +
      `• NUNCA inventes precio, garantía, certificación, stock, envío gratis, testimonios ni resultados garantizados.\n` +
      `• Headline ≤40 chars. Primary 8-12 líneas. Description = precio + entrega/garantía real.\n` +
      `• Emojis semánticos (1 por bullet), sin exceso. Sin \"Oferta limitada\" si no hay fecha real.\n` +
      `• Responde JSON: {"variants":[{"primaryText":str,"headline":str,"description":str,"cta":str,"hook":str,"arquetipo":str,"angulo":str}],"followUpWA":str}\n`,
    userPrompt:
      `Producto: ${product.name}\n` +
      `Descripción: ${product.description || "(sin descripción)"}\n` +
      `Precio: ${formatPrecio(product.price, product.currency) || "sin precio"}\n` +
      `Características reales: ${(product.features || []).join(" | ") || "ninguna"}\n` +
      `Modelo entrega: ${modelo}\n` +
      `Problema: ${research.problemaPrincipal}\n` +
      `Deseo: ${research.deseo}\n` +
      `Objeciones: ${research.objeciones.join(" | ")}\n` +
      `Hooks a usar (uno por variante):\n${elegidos.map((h, i) => `V${i + 1} [${h.arquetipo}] ${h.hook} — ${h.angulo}`).join("\n")}\n` +
      `Objetivo Meta: ${opts.objetivo || "mensajes"} | CTA esperado: ${ctaPara(opts.objetivo)}\n` +
      `Escribe las 3 variantes. followUpWA es 1 mensaje corto para WhatsApp post-clic (2-3 líneas, con precio y entrega).`,
  });

  let variants: CopyProVariant[] = ai?.variants?.length ? ai.variants.slice(0, 3).map((v: any, i: number) => ({
    primaryText: String(v.primaryText || "").trim(),
    headline: String(v.headline || elegidos[i]?.hook || "").slice(0, 40),
    description: String(v.description || "").slice(0, 90),
    cta: String(v.cta || ctaPara(opts.objetivo)),
    hook: String(v.hook || elegidos[i]?.hook || ""),
    arquetipo: String(v.arquetipo || elegidos[i]?.arquetipo || ""),
    angulo: String(v.angulo || elegidos[i]?.angulo || ""),
  })) : fallbackCopy(product, elegidos, opts.objetivo);

  // Validación + auto-corrección si score bajo
  let validacion = validarCopy(variants, product);
  // Un reintento si inventa algo: pedir corrección sin la frase inventada
  if (!validacion.ok && ai?.variants) {
    const motivos = validacion.motivos.join(" | ");
    const corr = await callMarketingAI<{ variants: CopyProVariant[] }>({
      tenantId: opts.tenantId,
      json: true,
      maxTokens: 1400,
      systemPrompt:
        `Eres CopyPro corrigiendo. Te marco qué NO puedes decir. Reescribe las 3 variantes quitando SOLO lo marcado, sin inventar reemplazo.\n` +
        `Devuelve JSON: {"variants":[...]}`,
      userPrompt:
        `Producto real: ${product.name} — ${product.description?.slice(0, 400)}\n` +
        `Precio real: ${formatPrecio(product.price, product.currency) || "sin precio"}\n` +
        `Variantes a corregir:\n${variants.map((v,i)=>`V${i+1}: ${v.primaryText.slice(0,400)}`).join("\n---\n")}\n` +
        `Motivos de rechazo: ${motivos}\n` +
        `Quita exactamente eso. No inventes garantía, stock, envío gratis ni testimonios.`,
    });
    if (corr?.variants?.length) {
      variants = corr.variants.slice(0, 3).map((v: any, i: number) => ({
        primaryText: String(v.primaryText || variants[i]?.primaryText || "").trim(),
        headline: String(v.headline || variants[i]?.headline || "").slice(0, 40),
        description: String(v.description || variants[i]?.description || "").slice(0, 90),
        cta: String(v.cta || variants[i]?.cta || ctaPara(opts.objetivo)),
        hook: String(v.hook || variants[i]?.hook || ""),
        arquetipo: String(v.arquetipo || variants[i]?.arquetipo || ""),
        angulo: String(v.angulo || variants[i]?.angulo || ""),
      }));
      validacion = validarCopy(variants, product);
    }
  }

  const followUpWA = (ai as any)?.followUpWA
    ? String((ai as any).followUpWA).slice(0, 300)
    : `Hola 👋 ¿Viste lo de ${product.name}? ${formatPrecio(product.price, product.currency) ? `Es ${formatPrecio(product.price, product.currency)}` : ""} y te llega ${modelo==="fisico"?"a domicilio (pago contraentrega)":"acceso inmediato"}. ¿Te ayudo con alguna duda?`;

  return {
    variants: variants.map(v => ({ ...v, score: validacion.score, motivos: validacion.motivos })),
    followUpWA,
    validacion,
    notas: research.notasParaCopy || [],
  };
}
