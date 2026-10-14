import { describe, expect, it } from "vitest";
import { baseCredits, creditsFor, royaltyRate, subscriptionCovers } from "../shared/pricing";

describe("precios en créditos", () => {
  it("imágenes 1 crédito, ampliada 8", () => {
    expect(baseCredits({ type: "photo", isFree: false, isPremium: false })).toEqual({ standard: 1, extended: 8 });
  });
  it("vídeo HD 8 / 4K 30; ampliada 2×", () => {
    expect(baseCredits({ type: "video", isFree: false, isPremium: false, resolutionLabel: "HD" })).toEqual({ standard: 8, extended: 16 });
    expect(baseCredits({ type: "video", isFree: false, isPremium: false, resolutionLabel: "4K" })).toEqual({ standard: 30, extended: 60 });
  });
  it("premium sube el piso y gratis anula todo", () => {
    expect(creditsFor({ type: "photo", isFree: false, isPremium: true }, "standard")).toBe(12);
    expect(creditsFor({ type: "video", isFree: false, isPremium: true, resolutionLabel: "HD" }, "standard")).toBe(40);
    expect(baseCredits({ type: "video", isFree: true, isPremium: true })).toEqual({ standard: 0, extended: 0 });
  });
  it("3d cuesta 2 y los overrides mandan", () => {
    expect(baseCredits({ type: "3d", isFree: false, isPremium: false })).toEqual({ standard: 2, extended: 16 });
    expect(baseCredits({ type: "photo", isFree: false, isPremium: false, overrideStandard: 5, overrideExtended: 20 })).toEqual({ standard: 5, extended: 20 });
  });
  it("la suscripción cubre estándar (imagen = crédito, vídeo HD = cuota de vídeo) pero no 4K, premium ni ampliada", () => {
    expect(subscriptionCovers({ type: "photo", isFree: false, isPremium: false }, "standard")).toBe("credit");
    expect(subscriptionCovers({ type: "video", isFree: false, isPremium: false, resolutionLabel: "HD" }, "standard")).toBe("video");
    expect(subscriptionCovers({ type: "video", isFree: false, isPremium: false, resolutionLabel: "4K" }, "standard")).toBeNull();
    expect(subscriptionCovers({ type: "photo", isFree: false, isPremium: true }, "standard")).toBeNull();
    expect(subscriptionCovers({ type: "photo", isFree: false, isPremium: false }, "extended")).toBeNull();
  });
  it("regalías por tipo", () => {
    const rates = { image: 0.33, video: 0.35, audio: 0.35 };
    expect(royaltyRate("vector", rates)).toBe(0.33);
    expect(royaltyRate("video", rates)).toBe(0.35);
    expect(royaltyRate("audio", rates)).toBe(0.35);
  });
});
