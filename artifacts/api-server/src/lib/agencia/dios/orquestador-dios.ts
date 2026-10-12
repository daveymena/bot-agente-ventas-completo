/**
 * DIOS — Orquestador Dios (Atlas → Research → Imagen → Video → Landing)
 * Flag DIOS=1. Si no está activo, no hace nada.
 * Atlas lo llama como plan de 5 pasos con presupuesto, no reescribe anuncio suelto.
 */
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import { researchDeep } from "../pro/research-deep";
import { imagenDios } from "./imagen-dios";
import { videoDios } from "./video-dios";

export interface OrquestarDiosInput {
  tenantId: number;
  product: ProductInfo;
  objetivo: "ventas"|"mensajes";
  galeriaFotos: string[];
  conAvatar?: boolean;
}
export interface OrquestarDiosResult {
  research: Awaited<ReturnType<typeof researchDeep>>;
  imagenes: Awaited<ReturnType<typeof imagenDios>>;
  video: Awaited<ReturnType<typeof videoDios>>;
  landing?: Awaited<ReturnType<typeof import("../../landing/dios/landing-dios").landingDios>>;
}

export async function orquestarDios(input: OrquestarDiosInput): Promise<OrquestarDiosResult | null> {
  if (process.env.DIOS !== "1") return null;
  const research = await researchDeep(input.product as any, { tenantId: input.tenantId }).catch(()=>null as any);
  const r = research || { hooksPro: [{ hook: input.product.name }], problemaPrincipal: input.product.description?.slice(0,120) || "", angulos: [] } as any;
  const imagenes = await imagenDios(input.product as any, r, { tenantId: input.tenantId });
  const video = await videoDios(input.product as any, r, { tenantId: input.tenantId, conAvatar: !!input.conAvatar });
  let landing: any = null;
  try {
    const { landingDios } = await import("../../landing/dios/landing-dios");
    landing = await landingDios({ product: input.product as any, research: r, imagenes, video, objetivo: input.objetivo, galeriaFotos: input.galeriaFotos, tenantId: input.tenantId });
  } catch {}
  return { research: r, imagenes, video, landing };
}
