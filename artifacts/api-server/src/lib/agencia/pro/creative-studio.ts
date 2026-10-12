/**
 * AGENCIA PRO — CreativeStudio
 * ============================
 * Genera pack de 3 imágenes 4:5 listas para Meta (1080x1350, safe-zone feed)
 * + prompts para generador. No es 1:1 packshot: es producto EN USO.
 *
 * Asset feed spec: 3 imágenes + 1 video (recomendación Meta Advantage+).
 */
import { callMarketingAI } from "../../marketing-team/ai";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "./research-deep";
import type { CopyProVariant } from "./copy-pro";
import { validarCreativo } from "./validate-score";

export interface ImagenPro {
  rol: "hero_en_uso" | "detalle_beneficio" | "prueba_contenido";
  formato: "4:5 (1080x1350)";
  hookEnImagen: string; // 3-5 palabras, arriba safe-zone
  etiqueta?: string; // precio / pago contraentrega / acceso inmediato (chica, abajo)
  imagePrompt: string; // prompt para image generator (fotorreal, no packshot)
  porQueFunciona: string;
}

export interface CreativeStudioResult {
  imagenes: ImagenPro[];
  videoBrief: { duracion: string; escenas: string[]; hook0_2s: string;ctaOverlay: string };
  validacion: ReturnType<typeof validarCreativo>;
}

function etiquetaPara(product: ProductInfo, modelo: "digital"|"fisico"): string {
  if (!product.price) return modelo==="fisico" ? "Pago contraentrega" : "Acceso inmediato";
  const precio = `$${Number(product.price).toLocaleString("es-CO")}`;
  return modelo==="fisico" ? `${precio} · Pago contraentrega` : `${precio} · Pago único`;
}

function fallbackImagenes(product: ProductInfo, research: ResearchDeepResult, copy: CopyProVariant[]): ImagenPro[] {
  const hook = (copy[0]?.hook || research.hooksPro[0]?.hook || product.name).split(" ").slice(0,4).join(" ");
  const etiqueta = etiquetaPara(product, (product.category==="dropshipping"?"fisico":"digital") as any);
  return [
    {
      rol: "hero_en_uso",
      formato: "4:5 (1080x1350)",
      hookEnImagen: hook.slice(0, 28),
      etiqueta,
      imagePrompt: `Foto fotorrealista lifestyle 4:5 vertical: una persona real usando ${product.name} en contexto cotidiano, luz natural, fondo limpio desenfocado, producto visible en uso (no solo caja), sin texto extra, calidad estudio`,
      porQueFunciona: "Hero en uso detiene el scroll 3x más que packshot (Meta Creative Guidance).",
    },
    {
      rol: "detalle_beneficio",
      formato: "4:5 (1080x1350)",
      hookEnImagen: research.hooksPro[1]?.hook.split(" ").slice(0,4).join(" ") || "Detalle real",
      etiqueta: undefined,
      imagePrompt: `Foto macro 4:5 del producto ${product.name} en detalle: textura/material, 2-3 íconos sutiles de beneficios alrededor, fondo neutro, sin texto largo`,
      porQueFunciona: "Muestra calidad y resuelve objeción '¿cómo es por dentro?'.",
    },
    {
      rol: "prueba_contenido",
      formato: "4:5 (1080x1350)",
      hookEnImagen: "Así se ve por dentro",
      etiqueta: undefined,
      imagePrompt: `Captura/montaje 4:5 que muestra el CONTENIDO por dentro de ${product.name}: ${ (product.features||[]).slice(0,3).join(", ") || "módulos/lecciones" } en pantalla, UI limpia, sin inventar logos`,
      porQueFunciona: "Prueba tangible baja la desconfianza digital/físico.",
    },
  ];
}

export async function creativeStudio(
  product: ProductInfo,
  research: ResearchDeepResult,
  copyVariants: CopyProVariant[],
  opts: { tenantId?: number } = {},
): Promise<CreativeStudioResult> {
  const modelo = (product.category === "dropshipping" ? "fisico" : "digital") as "digital"|"fisico";
  const etiqueta = etiquetaPara(product, modelo);

  const ai = await callMarketingAI<{ imagenes: ImagenPro[]; videoBrief: CreativeStudioResult["videoBrief"] }>({
    tenantId: opts.tenantId,
    json: true,
    maxTokens: 1400,
    systemPrompt:
      `Eres CreativeStudio, director de arte performance para Meta Ads feed (formato 4:5 obligatorio, 1080x1350, safe-zone: texto clave centrado, sin cortar por avatar/CTA).\n` +
      `Entregas 3 imágenes + 1 video brief que formen asset_feed_spec (lo que Meta recomienda para Advantage+).\n` +
      `Reglas:\n` +
      `• Imagen 1 hero: producto EN USO por persona real, no packshot sobre blanco.\n` +
      `• Hook en imagen: 3-5 palabras arriba, centrado. Etiqueta chica abajo con precio+entrega real si hay precio.\n` +
      `• Prompts fotorrealistas, sin texto largo dentro de la imagen (el texto va en overlay separado).\n` +
      `• NUNCA inventes Garantía/Sello/5 estrellas/envío gratis si no está en ficha.\n` +
      `• JSON: {"imagenes":[{"rol":"hero_en_uso|detalle_beneficio|prueba_contenido","formato":"4:5 (1080x1350)","hookEnImagen":str,"etiqueta":str|null,"imagePrompt":str,"porQueFunciona":str}],"videoBrief":{"duracion":"15-25s","escenas":[str],"hook0_2s":str,"ctaOverlay":str}}\n`,
    userPrompt:
      `Producto: ${product.name}\n` +
      `Descripción: ${product.description?.slice(0, 400) || "(sin descripción)"}\n` +
      `Precio: ${product.price ? `${product.currency||"COP"} ${product.price}` : "sin precio"} | Modelo: ${modelo} | Etiqueta real: ${etiqueta}\n` +
      `Hooks: ${research.hooksPro.slice(0,3).map(h=>`[${h.arquetipo}] ${h.hook}`).join(" | ")}\n` +
      `Copy elegido (headline): ${copyVariants[0]?.headline || ""}\n` +
      `Características: ${(product.features||[]).join(" | ") || "ninguna"}\n` +
      `Genera las 3 imágenes y el video brief vertical 9:16 UGC 15-25s.`,
  });

  let imagenes: ImagenPro[] = (ai?.imagenes?.length
    ? ai.imagenes.slice(0, 3).map((im: any, i: number) => ({
        rol: (["hero_en_uso","detalle_beneficio","prueba_contenido"] as const)[i] || "hero_en_uso",
        formato: "4:5 (1080x1350)" as const,
        hookEnImagen: String(im.hookEnImagen || `Hook ${i+1}`).split(" ").slice(0,5).join(" ").slice(0,28),
        etiqueta: i===0 ? (im.etiqueta ? String(im.etiqueta).slice(0,36) : etiqueta) : (im.etiqueta ? String(im.etiqueta).slice(0,36) : undefined),
        imagePrompt: String(im.imagePrompt || "").slice(0, 500),
        porQueFunciona: String(im.porQueFunciona || "").slice(0, 140),
      }))
    : fallbackImagenes(product, research, copyVariants)
  );

  let videoBrief = ai?.videoBrief || {
    duracion: "15-25s",
    escenas: [
      "0-2s: HOOK en pantalla grande (pregunta dolor) + producto en mano",
      "2-8s: problema cotidiano (sin producto) → alivio con producto",
      "8-16s: 3 beneficios en texto quemado, 1 por corte",
      "16-22s: precio + entrega (framing) + garantía real si existe",
      "22-25s: CTA 'Escríbenos por WhatsApp' con botón",
    ],
    hook0_2s: imagenes[0]?.hookEnImagen || "¿Este dolor te suena?",
    ctaOverlay: copyVariants[0]?.cta || "Enviar mensaje por WhatsApp",
  };

  const validacion = validarCreativo(imagenes as any);
  return { imagenes, videoBrief, validacion };
}
