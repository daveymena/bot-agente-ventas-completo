/**
 * Reglas de precio en créditos por tipo de recurso y licencia.
 *
 * Calcadas de la lógica de Adobe Stock (plans, 13-10-2026): imágenes,
 * vectores, música, plantillas y 3D cuestan 1 crédito estándar; vídeo HD 8;
 * vídeo 4K 30; la licencia ampliada multiplica. Son valores por defecto: cada
 * recurso puede traer `price_credits_standard/extended` propios.
 */
import type { AssetType, LicenseType } from "./types";

export interface PriceInput {
  type: AssetType;
  isFree: boolean;
  isPremium: boolean;
  resolutionLabel?: string | null;
  overrideStandard?: number | null;
  overrideExtended?: number | null;
}

export function baseCredits(input: PriceInput): { standard: number; extended: number } {
  if (input.isFree) return { standard: 0, extended: 0 };
  let standard: number;
  switch (input.type) {
    case "video": standard = input.resolutionLabel === "4K" ? 30 : 8; break;
    case "audio": standard = 1; break;
    case "3d": standard = 2; break;
    default: standard = 1;
  }
  if (input.isPremium) standard = Math.max(standard, input.type === "video" ? 40 : 12);
  let extended = Math.max(standard * 8, standard + 7);
  if (input.type === "video") extended = standard * 2;
  if (input.overrideStandard != null && input.overrideStandard >= 0) standard = input.overrideStandard;
  if (input.overrideExtended != null && input.overrideExtended >= 0) extended = input.overrideExtended;
  return { standard, extended };
}

export function creditsFor(input: PriceInput, license: LicenseType): number {
  const p = baseCredits(input);
  return license === "extended" ? p.extended : p.standard;
}

/** Si una suscripción cubre este recurso con su cuota mensual (no la ampliada). */
export function subscriptionCovers(input: PriceInput, license: LicenseType): "credit" | "video" | null {
  if (license === "extended") return null;
  if (input.isFree) return null;
  if (input.isPremium) return null;
  if (input.type === "video") return input.resolutionLabel === "4K" ? null : "video";
  return "credit";
}

export function royaltyRate(type: AssetType, rates: { image: number; video: number; audio: number }): number {
  if (type === "video") return rates.video;
  if (type === "audio") return rates.audio;
  return rates.image;
}

export const LICENSE_TEXT: Record<LicenseType, { name: string; short: string; bullets: string[] }> = {
  standard: {
    name: "Licencia estándar",
    short: "Uso comercial en web, redes, anuncios, impresión hasta 500.000 copias.",
    bullets: [
      "Uso ilimitado en web, redes sociales, correo y anuncios digitales",
      "Impresión hasta 500.000 copias (folletos, empaques, vallas)",
      "Vídeo y presentaciones sin límite de audiencia",
      "No permite reventa, plantillas para vender ni productos impresos para la venta",
      "Licencia perpetua, mundial y no exclusiva",
    ],
  },
  extended: {
    name: "Licencia ampliada",
    short: "Todo lo de la estándar + impresión ilimitada y productos para la venta.",
    bullets: [
      "Todo lo incluido en la licencia estándar",
      "Impresión sin límite de copias",
      "Productos para la venta (camisetas, tazas, pósters, plantillas)",
      "Varios usuarios dentro de la misma organización",
      "Licencia perpetua, mundial y no exclusiva",
    ],
  },
};
