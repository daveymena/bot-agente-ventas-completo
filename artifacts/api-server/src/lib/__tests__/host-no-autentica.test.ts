import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveTenant, tenantManager } from "../tenantManager";

/**
 * Agujero encontrado el 29-09-2026: resolveTenant asignaba el negocio por
 * SUBDOMINIO o DOMINIO antes de mirar la sesión y sin pedirla. El host
 * `ventasproia.com` da el "subdominio" `ventasproia`: un cliente con ese slug
 * se quedaba con TODAS las peticiones a la API (anónimas o de otro usuario).
 */
const NEGOCIO_VENTASPROIA = { id: 7, slug: "ventasproia" } as any;
const OTRO = { id: 3, slug: "otro" } as any;

function correr(req: any) {
  const res: any = { statusCode: 200, status(c: number) { this.statusCode = c; return this; }, json(b: any) { this.body = b; return this; } };
  const next = vi.fn();
  return resolveTenant()(req, res, next).then(() => ({ res, next, req }));
}

describe("el host no autentica", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sin sesión, un subdominio que coincide con un slug NO entra (401)", async () => {
    vi.spyOn(tenantManager, "getTenantBySlug").mockResolvedValue(NEGOCIO_VENTASPROIA);
    vi.spyOn(tenantManager, "getTenantByDomain").mockResolvedValue(null);
    const { res, next, req } = await correr({ path: "/products", headers: { host: "ventasproia.com" }, signedCookies: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(req.tenant).toBeUndefined();
  });

  it("con sesión de OTRO negocio, el host no lo cambia de negocio", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue(OTRO);
    vi.spyOn(tenantManager, "getTenantBySlug").mockResolvedValue(NEGOCIO_VENTASPROIA);
    vi.spyOn(tenantManager, "getTenantByDomain").mockResolvedValue(null);
    const { next, req } = await correr({ path: "/products", headers: { host: "ventasproia.com" }, signedCookies: { tenant_id: "3" } });
    expect(next).toHaveBeenCalled();
    expect(req.tenant.id).toBe(3);
  });

  it("un dominio propio tampoco autentica sin sesión", async () => {
    vi.spyOn(tenantManager, "getTenantBySlug").mockResolvedValue(null);
    vi.spyOn(tenantManager, "getTenantByDomain").mockResolvedValue(OTRO);
    const { res, next } = await correr({ path: "/conversations", headers: { host: "tienda-de-otro.com" }, signedCookies: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
