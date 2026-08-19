/**
 * MARKETING TEAM — Copywriter (MASTER PLAN §11)
 * 
 * Produce primary text, headline, description, CTA, copies para WhatsApp,
 * follow-ups, scripts, captions y variantes A/B. Regla visual: títulos
 * cortos, párrafos breves, beneficios en viñetas, CTA claro. Adapta tono,
 * país, audiencia y canal. Evita bloques enormes y plantillas repetitivas.
 */

import type { AgentHandoff } from "../types";
import { callMarketingAI } from "../ai";
import type { ProductInfo } from "./market-researcher";
import type { CreativeBrief } from "./creative-director";

export interface CopyVariant {
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  angle: string;
}

export interface CopyResult {
  variants: CopyVariant[];
  whatsappFollowUp: string;
  recomendaciones: string[];
}

function formatPrice(p?: number, c?: string): string {
  if (!p) return "consulta";
  const cur = (c || "COP").toUpperCase();
  return `${p.toLocaleString("es-CO")} ${cur}`;
}

export function buildCopyFallback(
  product: ProductInfo,
  brief?: CreativeBrief,
): CopyResult {
  const concepts = brief?.concepts?.length ? brief.concepts.slice(0, 3) : [];
  const name = product.name || "";
  const desc = (product.description || "").split(/\r?\n/)[0]?.slice(0, 90) || name;
  const price = formatPrice(product.price, product.currency);
  const features = (product.features || []).slice(0, 3);

  const variants: CopyVariant[] = concepts.length
    ? concepts.map((c) => ({
        angle: c.angulo,
        primaryText: `${c.hook}

${desc}

✅ Beneficio claro y directo
✅ Entrega inmediata
✅ Soporte y acompañamiento

━━━━━━━━━━━━━━
💰 ${name} — ${price}
━━━━━━━━━━━━━━

👇 Escríbenos ahora y lo tienes hoy`,
        headline: c.hook.slice(0, 40),
        description: desc.slice(0, 80),
        cta: "Escríbenos por WhatsApp",
      }))
    : [
        {
          angle: "Beneficio principal",
          primaryText: `${name}

${desc}

✅ Beneficio claro y directo
✅ Entrega inmediata
✅ Soporte y acompañamiento

━━━━━━━━━━━━━━
💰 ${price}
━━━━━━━━━━━━━━

👇 Escríbenos ahora`,
          headline: name.slice(0, 40),
          description: desc.slice(0, 80),
          cta: "Escríbenos por WhatsApp",
        },
      ];

  const featuresLine = features.length ? `Beneficios: ${features.join(" • ")}` : "";

  return {
    variants,
    whatsappFollowUp: `Hola 👋 ¿Tuviste tiempo de revisar lo de ${name}?

${featuresLine ? featuresLine + "\n" : ""}Quedé atento por si tienes alguna duda — es ${price} y la entrega es inmediata. 😊

¿Te lo aparto?`,
    recomendaciones: [
      "Probar los hooks en las primeras 2 líneas: es lo que decide el clic.",
      "Usar una sola CTA por anuncio.",
      "Adaptar el tono al público objetivo y al país del negocio.",
    ],
  };
}

export async function copywriting(
  input: {
    product: ProductInfo;
    brief?: CreativeBrief;
    research?: { angulos?: string[] };
    tenantId?: number;
    country?: string;
    channel?: "meta" | "whatsapp";
  },
): Promise<AgentHandoff<CopyResult>> {
  const fallback = buildCopyFallback(input.product, input.brief);

  const aiResult = await callMarketingAI<Partial<CopyResult>>({
    tenantId: input.tenantId,
    json: true,
    systemPrompt: `Eres el Copywriter de un equipo de marketing para anuncios en español (país: ${input.country || "Latinoamérica"}).
Escribís copy publicitario profesional para ${input.channel || "Meta Ads"}.
Reglas: frases cortas, párrafos breves, beneficios en viñetas, UNA sola CTA, emojis semánticos (sin exceso), lenguaje natural (no robótico), sin bloques gigantes. NUNCA inventes precios, garantías ni características que el producto no tenga.
Respondés SOLO JSON con:
{"variants": [{"primaryText": string, "headline": string, "description": string, "cta": string, "angle": string}], "whatsappFollowUp": string, "recomendaciones": string[]}
Máximo 4 variantes, cada una con un ángulo distinto.`,
    userPrompt: `Producto: ${input.product.name}
Descripción: ${input.product.description || "(sin descripción)"}
Precio: ${formatPrice(input.product.price, input.product.currency)}
Características: ${(input.product.features || []).join(", ") || "sin listar"}
Brief creativo: ${input.brief ? JSON.stringify(input.brief.concepts?.map((c) => ({ angulo: c.angulo, hook: c.hook }))) : "ninguno"}
Ángulos de investigación: ${input.research?.angulos?.join(", ") || "ninguno"}

Generá las variantes de copy.`,
  });

  const data: CopyResult = {
    variants: aiResult?.variants?.length ? aiResult.variants.slice(0, 4) : fallback.variants,
    whatsappFollowUp: aiResult?.whatsappFollowUp || fallback.whatsappFollowUp,
    recomendaciones: aiResult?.recomendaciones?.length ? aiResult.recomendaciones.slice(0, 4) : fallback.recomendaciones,
  };

  return {
    agent: "Copywriter",
    domain: "marketing",
    kind: "CopyVariants",
    data,
    summary: `${data.variants.length} variantes de copy para "${input.product.name}" con ángulos distintos.`,
    createdAt: new Date().toISOString(),
  };
}
