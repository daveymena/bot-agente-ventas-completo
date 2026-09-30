import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Cotizador de envío (30-09-2026): el mismo cálculo del panel de Dropi, que
 * usan el panel, Atlas, la landing y el vendedor de WhatsApp. Lo que se fija:
 * disponibles primero y de la más económica a la más cara, y que el token de
 * sesión del .env solo lo use el dueño del servidor (multi-inquilino).
 */
vi.mock("../dropi-directo", () => ({
  tokenDropiDelTenant: vi.fn(async (tenantId: number) => (tenantId === 7 ? "tok-integracion-7" : null)),
}));
vi.mock("../respaldo-del-dueno", () => ({
  envSoloDelDueno: (tenantId: number, v?: string) => (tenantId === 1 ? String(v || "") : ""),
}));

import { cotizarEnvioDropi } from "../dropi-cotizador";

const respuesta = (status: number, json: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(json) });

function dropiFalso(opciones: { aceptaToken: (t: string) => boolean }) {
  return vi.fn(async (url: string, init: any) => {
    const token = String(init?.headers?.["X-Authorization"] || "").replace("Bearer ", "");
    if (!opciones.aceptaToken(token)) return respuesta(401, { isSuccess: false, message: "Unauthenticated" });
    if (url.includes("location/departments/5/cities")) {
      return respuesta(200, { isSuccess: true, result: [{ id: 50, name: "MEDELLIN", cod_dane: "05001", rate_type: "CON RECAUDO", department_id: 5 }] });
    }
    if (url.includes("location/departments")) {
      return respuesta(200, { isSuccess: true, result: [{ department_id: 5, name: "ANTIOQUIA" }] });
    }
    if (url.includes("carrier/shipping-quote/123")) {
      return respuesta(200, {
        isSuccess: true,
        result: [
          { conveyor: "SERVIENTREGA", totalFreight: 16000, amountearned: 30000, isSuccess: true },
          { conveyor: "COORDINADORA", totalFreight: 99000, amountearned: 1000, isSuccess: false },
          { conveyor: "ENVIA", totalFreight: 12000, amountearned: 34000, dropiComision: 2000, isSuccess: true },
        ],
      });
    }
    return respuesta(404, { message: "no" });
  });
}

describe("cotizador de envío de Dropi", () => {
  const original = globalThis.fetch;
  beforeEach(() => { process.env.DROPI_TOKEN = "tok-sesion-del-dueno"; });
  afterEach(() => { globalThis.fetch = original; delete process.env.DROPI_TOKEN; });

  it("ordena disponibles primero y de la más económica a la más cara, con la ganancia real", async () => {
    globalThis.fetch = dropiFalso({ aceptaToken: () => true }) as any;
    const r = await cotizarEnvioDropi(7, { dropiProductId: 123, ciudad: "Medellín", departamento: "Antioquia", precioVenta: 59900 });
    expect(r.ok).toBe(true);
    expect(r.autenticacion).toBe("integracion");
    expect(r.ciudad).toEqual({ nombre: "MEDELLIN", departamento: "ANTIOQUIA", aceptaContraentrega: true });
    expect(r.transportadoras!.map((t) => t.transportadora)).toEqual(["ENVIA", "SERVIENTREGA", "COORDINADORA"]);
    expect(r.transportadoras![0]).toMatchObject({ disponible: true, flete: 12000, ganancia: 34000, comisionDropi: 2000 });
    expect(r.transportadoras![2].disponible).toBe(false);
  });

  it("si Dropi rechaza el token de integración, el de sesión del .env SOLO lo usa el dueño del servidor", async () => {
    globalThis.fetch = dropiFalso({ aceptaToken: (t) => t === "tok-sesion-del-dueno" }) as any;
    const ajeno = await cotizarEnvioDropi(7, { dropiProductId: 123, ciudad: "Medellin", precioVenta: 50000 });
    expect(ajeno.ok).toBe(false);
    const llamadas = (globalThis.fetch as any).mock.calls.map((c: any[]) => c[1].headers["X-Authorization"]);
    expect(llamadas.some((h: string) => h.includes("tok-sesion-del-dueno"))).toBe(false);

    const dueno = await cotizarEnvioDropi(1, { dropiProductId: 123, ciudad: "Medellin", precioVenta: 50000 });
    expect(dueno.ok).toBe(true);
    expect(dueno.autenticacion).toBe("sesion");
  });

  it("una ciudad fuera de cobertura se dice como tal, sin inventar transportadoras", async () => {
    globalThis.fetch = dropiFalso({ aceptaToken: () => true }) as any;
    const r = await cotizarEnvioDropi(7, { dropiProductId: 123, ciudad: "Ciudad Inexistente", precioVenta: 50000 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cobertura/);
    expect(r.transportadoras).toBeUndefined();
  });
});

describe("selector de transportadora en el formulario de la landing", () => {
  it("el checkout trae el hueco del selector y el script que consulta /envio, sin precios de envío", async () => {
    const { renderCheckout } = await import("../landing/renderer-v3");
    const html = renderCheckout({ tipo: "contraentrega", accion: "/api/landing-publica/mi-landing/pedido", pais: "co" } as any, { name: "Faja", price: 59900 } as any, null);
    expect(html).toContain('class="field field--full envio-transportadora" hidden');
    expect(html).toContain("/envio");
    expect(html).toContain("La más económica (recomendada)");
    expect(html).not.toMatch(/flete/i);
  });
});
