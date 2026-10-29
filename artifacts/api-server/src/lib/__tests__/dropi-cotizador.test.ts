import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Cotizador de envío (30-09-2026): el mismo cálculo del panel de Dropi, que
 * usan el panel, Atlas, la landing y el vendedor de WhatsApp. Lo que se fija:
 * disponibles primero y de la más económica a la más cara, y que el token de
 * sesión del .env solo lo use el dueño del servidor (multi-inquilino).
 */
const integracion = vi.hoisted(() => ({ responder: null as null | ((path: string, body: any) => any) }));
vi.mock("../dropi-directo", () => ({
  tokenDropiDelTenant: vi.fn(async (tenantId: number) => (tenantId === 7 ? "tok-integracion-7" : null)),
  // Por defecto la API de integraciones "falla" y se prueba el respaldo api-v2.
  dropiIntegracion: vi.fn(async (_t: string, path: string, body: any) =>
    integracion.responder ? integracion.responder(path, body) : { ok: false, error: "sin integración en este test" }),
}));
vi.mock("../respaldo-del-dueno", () => ({
  envSoloDelDueno: (tenantId: number, v?: string) => (tenantId === 1 ? String(v || "") : ""),
}));

import { cotizarEnvioDropi, limpiarCacheDropiCotizadorParaPruebas } from "../dropi-cotizador";

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

  it("API-v2 tampoco elige el primer Armenia si no se dio departamento", async () => {
    limpiarCacheDropiCotizadorParaPruebas();
    process.env.DROPI_TOKEN = "tok-session-sin-depto";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/location/departments")) return respuesta(200, { isSuccess: true, result: [
        { department_id: 5, name: "ANTIOQUIA" }, { department_id: 63, name: "QUINDIO" },
      ] });
      if (url.includes("/location/departments/5/cities")) return respuesta(200, { isSuccess: true, result: [
        { id: 501, name: "ARMENIA", cod_dane: "05031000", rate_type: "CON RECAUDO", department_id: 5 },
      ] });
      if (url.includes("/location/departments/63/cities")) return respuesta(200, { isSuccess: true, result: [
        { id: 63001, name: "ARMENIA", cod_dane: "63001000", rate_type: "CON RECAUDO", department_id: 63 },
      ] });
      if (url.includes("/shipping-quote/123")) return respuesta(200, { isSuccess: true, result: [{ conveyor: "TCC", totalFreight: 10000, isSuccess: true }] });
      return respuesta(404, { isSuccess: false, message: "no" });
    });
    globalThis.fetch = fetchMock as any;
    const r = await cotizarEnvioDropi(1, { dropiProductId: 123, ciudad: "Armenia", precioVenta: 55000 });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("departamento_requerido");
    expect(fetchMock.mock.calls.some(([url]) => url.includes("shipping-quote"))).toBe(false);
  });

  it("API-v2 cotiza Armenia solo en el departamento confirmado por el cliente", async () => {
    limpiarCacheDropiCotizadorParaPruebas();
    process.env.DROPI_TOKEN = "tok-session-con-depto";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/location/departments")) return respuesta(200, { isSuccess: true, result: [
        { department_id: 5, name: "ANTIOQUIA" }, { department_id: 63, name: "QUINDIO" },
      ] });
      if (url.includes("/location/departments/63/cities")) return respuesta(200, { isSuccess: true, result: [
        { id: 63001, name: "ARMENIA", cod_dane: "63001000", rate_type: "CON RECAUDO", department_id: 63 },
      ] });
      if (url.includes("/shipping-quote/123")) return respuesta(200, { isSuccess: true, result: [{ conveyor: "TCC", totalFreight: 10000, isSuccess: true }] });
      return respuesta(404, { isSuccess: false, message: "no" });
    });
    globalThis.fetch = fetchMock as any;
    const r = await cotizarEnvioDropi(1, { dropiProductId: 123, ciudad: "Armenia", departamento: "Quindío", precioVenta: 55000 });
    expect(r.ok).toBe(true);
    const quote = fetchMock.mock.calls.find(([url]) => url.includes("shipping-quote"))?.[0] as string;
    expect(quote).toContain("department_id=63");
    expect(quote).toContain("city_id=63001");
    expect(quote).toContain("cod_dane=63001000");
  });

  it("una ciudad fuera de cobertura se dice como tal, sin inventar transportadoras", async () => {
    globalThis.fetch = dropiFalso({ aceptaToken: () => true }) as any;
    const r = await cotizarEnvioDropi(7, { dropiProductId: 123, ciudad: "Ciudad Inexistente", precioVenta: 50000 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/cobertura/);
    expect(r.transportadoras).toBeUndefined();
  });
});

describe("cotizador por la API de integraciones (formas reales de Dropi, 30-09-2026)", () => {
  afterEach(() => { integracion.responder = null; limpiarCacheDropiCotizadorParaPruebas(); });

  it("resuelve el DANE de la ciudad, manda el producto y ordena por flete; los que dan error quedan no disponibles", async () => {
    let enviado: any = null;
    integracion.responder = (path, body) => {
      if (path === "trajectory/bycity") return { ok: true, data: { cities: [
        ...Array.from({ length: 150 }, (_, i) => ({ name: `PUEBLO ${i}`, department_id: 99, cod_dane: `9${i}`, rate_type: '["CON RECAUDO"]' })),
        { name: "MEDELLIN", department_id: 13, cod_dane: "05001000", rate_type: '["CON RECAUDO","SIN RECAUDO"]' },
      ] } };
      if (path === "department") return { ok: true, data: [{ id: 13, name: "ANTIOQUIA" }] };
      if (path === "orders/cotizaEnvioTransportadoraV2") {
        enviado = body;
        return { ok: true, data: [
          { transportadora: "INTERRAPIDISIMO", transportadora_id: 3, objects: { precioEnvio: 18145 } },
          { transportadora: "DOMINA", transportadora_id: 4, objects: {}, error: "No se tiene configurada tarifa" },
          { transportadora: "ENVIA", transportadora_id: 2, objects: { precioEnvio: 14599, seguroEnvio: 0 } },
        ] };
      }
      return { ok: false, error: "ruta inesperada" };
    };
    const r = await cotizarEnvioDropi(7, { dropiProductId: 2082770, ciudad: "Medellín", departamento: "Antioquia", precioVenta: 85000, costoUnitario: 39900 });
    expect(r.ok).toBe(true);
    expect(r.autenticacion).toBe("integracion");
    expect(enviado.ciudad_destino).toEqual({ nombre: "MEDELLIN", departamento: "ANTIOQUIA", cod_dane: "05001000" });
    expect(enviado.products[0]).toMatchObject({ id: 2082770, quantity: 1, type: "SIMPLE" });
    expect(r.transportadoras!.map((t) => [t.transportadora, t.id, t.disponible])).toEqual([["ENVIA", 2, true], ["INTERRAPIDISIMO", 3, true], ["DOMINA", 4, false]]);
    expect(r.transportadoras![0].ganancia).toBe(85000 - 39900 - 14599);
    expect(r.motivos).toEqual([{ transportadora: "DOMINA", motivo: "No se tiene configurada tarifa" }]);
  });

  it("Armenia, Quindío usa el homónimo correcto para cotizar recaudo", async () => {
    let payload: any = null;
    integracion.responder = (path, body) => {
      if (path === "trajectory/bycity") return { ok: true, data: { cities: [
        { name: "ARMENIA", department_id: 5, cod_dane: "05031000", rate_type: '["SIN RECAUDO"]' },
        { name: "ARMENIA", department_id: 63, cod_dane: "63001000", rate_type: '["CON RECAUDO","SIN RECAUDO"]' },
      ] } };
      if (path === "department") return { ok: true, data: [{ id: 5, name: "ANTIOQUIA" }, { id: 63, name: "QUINDIO" }] };
      if (path === "orders/cotizaEnvioTransportadoraV2") {
        payload = body;
        return { ok: true, data: [{ transportadora: "TCC", transportadora_id: 1, objects: { precioEnvio: 13000 } }] };
      }
      return { ok: false, error: "ruta inesperada" };
    };
    const r = await cotizarEnvioDropi(7, { dropiProductId: 155, ciudad: "Armenia", departamento: "Quindío", precioVenta: 55000, conRecaudo: true });
    expect(r.ok).toBe(true);
    expect(r.ciudad).toMatchObject({ nombre: "ARMENIA", departamento: "QUINDIO", aceptaContraentrega: true });
    expect(payload.ciudad_destino.cod_dane).toBe("63001000");
    expect(payload.EnvioConCobro).toBe(true);
  });

  it("Armenia en Quindío no cotiza por el registro homónimo de Antioquia", async () => {
    let intentoDeCotizar = false;
    integracion.responder = (path) => {
      if (path === "trajectory/bycity") return { ok: true, data: { cities: [
        { name: "ARMENIA", department_id: 5, cod_dane: "05031000", rate_type: '["SIN RECAUDO"]' },
      ] } };
      if (path === "department") return { ok: true, data: [{ id: 5, name: "ANTIOQUIA" }] };
      if (path === "orders/cotizaEnvioTransportadoraV2") { intentoDeCotizar = true; return { ok: true, data: [] }; }
      return { ok: false, error: "ruta inesperada" };
    };
    const r = await cotizarEnvioDropi(7, { dropiProductId: 155, ciudad: "Armenia", departamento: "Quindío", precioVenta: 55000, conRecaudo: true });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("departamento_incompatible");
    expect(r.error).toMatch(/no se puede confirmar contraentrega/i);
    expect(intentoDeCotizar).toBe(false);
  });

  it("sin departamento no cotiza el primer municipio homónimo ni asume recaudo", async () => {
    limpiarCacheDropiCotizadorParaPruebas();
    let intentoDeCotizar = false;
    integracion.responder = (path) => {
      if (path === "trajectory/bycity") return { ok: true, data: { cities: [
        { name: "ARMENIA", department_id: 5, cod_dane: "05031000", rate_type: '["SIN RECAUDO"]' },
        { name: "ARMENIA", department_id: 63, cod_dane: "63001000", rate_type: '["CON RECAUDO"]' },
      ] } };
      if (path === "department") return { ok: true, data: [{ id: 5, name: "ANTIOQUIA" }, { id: 63, name: "QUINDIO" }] };
      if (path === "orders/cotizaEnvioTransportadoraV2") { intentoDeCotizar = true; return { ok: true, data: [] }; }
      return { ok: false, error: "ruta inesperada" };
    };
    const r = await cotizarEnvioDropi(7, { dropiProductId: 155, ciudad: "Armenia", precioVenta: 55000, conRecaudo: true });
    expect(r.ok).toBe(false);
    expect(r.codigo).toBe("departamento_requerido");
    expect(r.error).toMatch(/hace falta el departamento/i);
    expect(intentoDeCotizar).toBe(false);
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
