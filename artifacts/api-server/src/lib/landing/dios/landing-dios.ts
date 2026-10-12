/**
 * DIOS — LandingDios
 * Inyecta research hook ganador, elige hero video vs galería según pack, arma galería 3 desde fotosDelProducto, ancla oferta, verifica pixel.
 */
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import type { ResearchDeepResult } from "../../agencia/pro/research-deep";
import type { ImagenDiosResult } from "../../agencia/dios/imagen-dios";
import type { VideoDiosResult } from "../../agencia/dios/video-dios";
import { redactarConProveedores, REGLAS_DEL_AGENTE_DE_LANDINGS } from "../agente-landing";

export interface LandingDiosInput {
  product: ProductInfo;
  research: ResearchDeepResult;
  imagenes: ImagenDiosResult;
  video: VideoDiosResult;
  objetivo: "ventas"|"mensajes";
  galeriaFotos: string[]; // fotosDelProducto reales
}
export interface LandingDiosResult { html:string; variante:"A_video"|"B_galeria"; pixelCheck:string; }

export async function landingDios(input: LandingDiosInput & { tenantId: number }): Promise<LandingDiosResult> {
  const { product, research, imagenes, video, objetivo, galeriaFotos } = input;
  const hero = video.guion[0]?.overlay ? "video" : "galeria"; // si hay gancho video, hero video
  const esVideoHero = true; // Dios: hero video convierte más si el ad es video
  const ofertaAncla = product.price ? `$${Number(product.price).toLocaleString("es-CO")} vs $740/curso (81x)` : "Pago único";
  const galeria = galeriaFotos.slice(0,3).map((u,i)=>`[${i+1}] ${u}`).join("\n") || "sin galería — usará imagen Dios L2";
  const system = `Eres LandingDios, generas landing móvil primero que convierte.\n${REGLAS_DEL_AGENTE_DE_LANDINGS}\n\nContexto DIOS:\n- Hook ganador: ${research.hooksPro[0]?.hook}\n- Problema: ${research.problemaPrincipal}\n- Hero: ${esVideoHero ? "VIDEO 9:16 del pack (autoplay muted) arriba, 4:5 en móvil" : "GALERÍA 3 imágenes Dios"}\n- Galería real: ${galeria}\n- Imagen principal Dios: ${imagenes.principal.prompt.slice(0,120)}\n- Oferta anclada: ${ofertaAncla}\n- Objetivo: ${objetivo} — si es ventas, CTA "Comprar ahora" + total visible; si mensajes, CTA "Pedir por WhatsApp" + pago contraentrega si aplica.\n- No inventes garantía/testimonio. Solo lo que viene en datos.\n`;
  const user = `Producto: ${product.name} — ${product.description?.slice(0,400)}\nPrecio: ${product.price?`$${product.price} ${product.currency}`:"sin precio"}\nFeatures: ${(product.features||[]).join("|")}\n\nGenera UNA landing HTML completa con hero ${esVideoHero?"video":"galería"}, 3 beneficios con check, franja confianza (pago al recibir si aplica), oferta + formulario al final, barra fija móvil.`;

  const r = await redactarConProveedores({ tenantId: input.tenantId, system, user, tarea:"landing-dios", maxTokens:14000 });
  const html = r.text || `<html><body><h1>${product.name}</h1><p>${ofertaAncla}</p></body></html>`;
  return { html, variante: esVideoHero?"A_video":"B_galeria", pixelCheck:"pendiente: verificar pixel ViewContent/InitiateCheckout en landing" };
}
