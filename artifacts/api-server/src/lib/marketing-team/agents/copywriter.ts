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
  const name = product.name || "";
  const desc = (product.description || "").split(/\r?\n/)[0]?.slice(0, 90) || name;
  const price = formatPrice(product.price, product.currency);
  const features = (product.features || []).slice(0, 3);
  const beneficios = features.length ? features : ["Entrega rápida y segura", "Calidad que se nota", "Soporte real"];
  const descCorta = desc.slice(0, 80);

  // DIOS: 3 variantes A/B con ángulos DISTINTOS (problema · beneficio · curiosidad)
  // Si hay brief, úsalo; si no, genera los 3 de forma determinística para que nunca haya 1 solo genérico
  const conceptosBase = brief?.concepts?.length
    ? brief.concepts.slice(0, 3)
    : [
        { angulo: "Problema → Alivio", hook: `¿Cansado de ${name.toLowerCase().split(" ").slice(0, 3).join(" ")} que no funciona?` },
        { angulo: "Beneficio → Deseo", hook: `Consigue ${name.toLowerCase()} y nota la diferencia desde el primer día` },
        { angulo: "Curiosidad → Prueba", hook: `Lo que nadie te dijo sobre ${name.toLowerCase().split(" ").slice(0, 2).join(" ")}` },
      ] as any[];

  const variantesA: CopyVariant[] = conceptosBase.map((c: any, i: number) => {
    const hook = String(c.hook || c.angulo || name).slice(0, 80);
    const angulo = String(c.angulo || `Variante ${i + 1}`);
    // Estructura PAS DIOS: Problema/Deseo → Solución → Beneficio → Confianza → Acción
    const cuerpos = [
      `${hook}\n\n${desc}\n\n✅ ${beneficios[0]}\n✅ ${beneficios[1] || beneficios[0]}\n✅ ${beneficios[2] || beneficios[0]}\n\n━━━━━━━━━━━━━━\n💰 ${name} — ${price}\n━━━━━━━━━━━━━━\n\n👇 Escríbenos ahora y lo tienes hoy`,
      `${hook}\n\n¿Te imaginas ${desc.toLowerCase().slice(0, 60)} sin complicaciones?\n\nCon ${name} lo tienes:\n• ${beneficios[0]}\n• ${beneficios[1] || beneficios[0]}\n• ${beneficios[2] || beneficios[0]}\n\n💰 ${price} — entrega inmediata\n\n👉 Toca y te asesoramos por WhatsApp`,
      `${hook}\n\n${desc}\n\nPor qué lo eligen:\n— ${beneficios[0]}\n— ${beneficios[1] || beneficios[0]}\n— ${beneficios[2] || beneficios[0]}\n\n🛡️ ${name} — ${price}\n\n¿Lo apartamos para ti? Escríbenos.`,
    ];
    const ctas = ["Escríbenos por WhatsApp", "Quiero el mío", "Ver más detalles"];
    return {
      angle: angulo,
      primaryText: cuerpos[i % cuerpos.length]!,
      headline: hook.slice(0, 40) || name.slice(0, 40),
      description: descCorta.slice(0, 80),
      cta: ctas[i % ctas.length]!,
    };
  });
  const variants: CopyVariant[] = variantesA.length >= 3 ? variantesA.slice(0, 3) : variantesA;

  const featuresLine = features.length ? `Beneficios: ${features.join(" • ")}` : "";

  return {
    variants,
    whatsappFollowUp: `Hola 👋 ¿Tuviste tiempo de revisar lo de ${name}?\n\n${featuresLine ? featuresLine + "\n" : ""}Quedé atento por si tienes alguna duda — es ${price} y la entrega es inmediata. 😊\n\n¿Te lo aparto?`,
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
    systemPrompt: `Eres el Copywriter DIOS de un equipo de marketing para anuncios en español (país: ${input.country || "Colombia"}).
Escribís copy publicitario profesional que CONVIERTE para ${input.channel || "Meta Ads"} — no genérico.
Reglas DIOS: frases cortas, párrafos breves, beneficios en viñetas, UNA sola CTA, emojis semánticos (sin exceso), lenguaje natural y cercano (no robótico), sin bloques gigantes. NUNCA inventes precios, garantías ni características que el producto no tenga. Cada variante debe tener un ÁNGULO DISTINTO (A: problema/dolor · B: beneficio/deseo · C: curiosidad/historia) — no 3 sinónimos del mismo texto.
Respondés SOLO JSON con:
{"variants": [{"primaryText": string, "headline": string, "description": string, "cta": string, "angle": string}], "whatsappFollowUp": string, "recomendaciones": string[]}
Máximo 3 variantes A/B, cada una con hook y estructura diferente.`,
    userPrompt: `Producto: ${input.product.name}
Descripción: ${input.product.description || "(sin descripción)"}
Precio: ${formatPrice(input.product.price, input.product.currency)}
Características: ${(input.product.features || []).join(", ") || "sin listar"}
Brief creativo: ${input.brief ? JSON.stringify(input.brief.concepts?.map((c) => ({ angulo: c.angulo, hook: c.hook }))) : "ninguno"}
Ángulos de investigación REAL: ${input.research?.angulos?.join(", ") || "ninguno — usa los beneficios verificables del producto, no inventes"}
Instrucción DIOS: Generá 3 variantes A/B con ángulos distintos (problema, beneficio, curiosidad), cada una lista para publicar, sin prometer lo que el producto no tiene.`,
  });

  const data: CopyResult = {
    variants: aiResult?.variants?.length ? aiResult.variants.slice(0, 3) : fallback.variants,
    whatsappFollowUp: aiResult?.whatsappFollowUp || fallback.whatsappFollowUp,
    recomendaciones: aiResult?.recomendaciones?.length ? aiResult.recomendaciones.slice(0, 4) : fallback.recomendaciones,
  };

  return {
    agent: "Copywriter",
    domain: "marketing",
    kind: "CopyVariants",
    data,
    summary: `${data.variants.length} variantes de copy DIOS para "${input.product.name}" con ángulos distintos (A/B/C).`,
    createdAt: new Date().toISOString(),
  };
}
