/**
 * Landing Forge quedó abierto a cualquiera (07-10). Ahora exige sesión firmada;
 * el dueño entra desde el menú de VentasPro con un enlace firmado de 2 minutos.
 * El formato tiene que coincidir con el que verifica Forge (src/lib/auth.ts):
 *   sso.<exp>.<hex64>  con HMAC-SHA256("sso.<exp>") y la misma LANDING_API_KEY.
 */
import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";

describe("enlaceDeEntradaForge", () => {
  it("firma un token que Forge acepta y vence en ~2 minutos", async () => {
    vi.resetModules();
    vi.stubEnv("LANDINGFORGE_API_KEY", "clave-compartida");
    vi.stubEnv("LANDINGFORGE_URL", "https://landings.ejemplo.co");
    const { enlaceDeEntradaForge } = await import("../landingforge-client");
    const u = new URL(enlaceDeEntradaForge("/editor/abc"));
    expect(u.origin + u.pathname).toBe("https://landings.ejemplo.co/api/auth/sso");
    expect(u.searchParams.get("next")).toBe("/editor/abc");
    const [tipo, exp, firma] = String(u.searchParams.get("t")).split(".");
    expect(tipo).toBe("sso");
    const vence = Number(exp) - Math.floor(Date.now() / 1000);
    expect(vence).toBeGreaterThan(100);
    expect(vence).toBeLessThanOrEqual(120);
    expect(firma).toBe(createHmac("sha256", "clave-compartida").update(`sso.${exp}`).digest("hex"));
    vi.unstubAllEnvs();
  });

  it("sin variable de entorno firma con la clave GENÉRICA (la misma que trae Forge por defecto)", async () => {
    vi.resetModules();
    vi.stubEnv("LANDINGFORGE_API_KEY", "");
    vi.stubEnv("LANDING_API_KEY", "");
    vi.stubEnv("LANDINGFORGE_URL", "https://landings.ejemplo.co");
    const { enlaceDeEntradaForge } = await import("../landingforge-client");
    const u = new URL(enlaceDeEntradaForge("/"));
    const [, exp, firma] = String(u.searchParams.get("t")).split(".");
    expect(firma).toBe(createHmac("sha256", "vpf-generica-cambiar-7Qk2Lm9Xz4Rt").update(`sso.${exp}`).digest("hex"));
    vi.unstubAllEnvs();
  });
});
