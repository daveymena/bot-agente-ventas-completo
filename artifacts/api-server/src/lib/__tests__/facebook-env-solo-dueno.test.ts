import { describe, it, expect, afterEach, vi } from "vitest";
import { credencialesFacebookDe, respaldoEnvFacebook } from "../tenant-facebook-credentials";
import { tenantManager } from "../tenantManager";

/**
 * Aislamiento de Meta entre negocios (29-09-2026): el .env de producción
 * tiene FB_ACCESS_TOKEN, FB_AD_ACCOUNT_ID, FB_PAGE_ID y FB_PIXEL_ID del DUEÑO
 * del servidor. credencialesFacebookDe (y ~10 lecturas sueltas) los usaban de
 * respaldo para CUALQUIER negocio sin Facebook propio: publicaba en la página
 * del dueño, leía su cuenta publicitaria y medía en su píxel.
 */
const ENV = { FB_ACCESS_TOKEN: "tok-dueno", FB_AD_ACCOUNT_ID: "act_dueno", FB_PAGE_ID: "page-dueno", FB_PIXEL_ID: "pixel-dueno", FB_APP_ID: "app-plataforma" };

describe("respaldo del .env de Meta: solo para el dueño del servidor", () => {
  const previo = { ...process.env };
  afterEach(() => { process.env = { ...previo }; vi.restoreAllMocks(); });

  it("otro negocio sin Facebook propio NO hereda la cuenta del dueño", () => {
    Object.assign(process.env, ENV);
    vi.spyOn(tenantManager, "getDefaultTenant").mockReturnValue({ id: 1 } as any);
    const c = credencialesFacebookDe({ id: 2, facebook: {} } as any);
    expect(c.accessToken).toBe("");
    expect(c.adAccountId).toBe("");
    expect(c.pageId).toBe("");
    expect(c.pixelId).toBe("");
    expect(c.propias).toBe(false);
    // Lo de la APP de Meta (no es de una cuenta) sigue siendo global.
    expect(c.appId).toBe("app-plataforma");
  });

  it("el dueño del servidor sí usa el .env", () => {
    Object.assign(process.env, ENV);
    vi.spyOn(tenantManager, "getDefaultTenant").mockReturnValue({ id: 1 } as any);
    const c = credencialesFacebookDe({ id: 1, facebook: {} } as any);
    expect(c.accessToken).toBe("tok-dueno");
    expect(c.adAccountId).toBe("act_dueno");
  });

  it("lo propio del negocio siempre gana", () => {
    Object.assign(process.env, ENV);
    vi.spyOn(tenantManager, "getDefaultTenant").mockReturnValue({ id: 1 } as any);
    const c = credencialesFacebookDe({ id: 2, facebook: { accessToken: "tok-propio", adAccountId: "act_propio" } } as any);
    expect(c.accessToken).toBe("tok-propio");
    expect(c.adAccountId).toBe("act_propio");
  });

  it("respaldoEnvFacebook: vacío para otro negocio, valor para el dueño y sin negocio", () => {
    vi.spyOn(tenantManager, "getDefaultTenant").mockReturnValue({ id: 1 } as any);
    expect(respaldoEnvFacebook(2)("x")).toBe("");
    expect(respaldoEnvFacebook(1)("x")).toBe("x");
    expect(respaldoEnvFacebook(null)("x")).toBe("x");
  });
});
