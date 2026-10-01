import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { avisarCompraRealAMeta } from "../compra-verificada-meta";

/**
 * El Purchase a Meta sale SOLO desde un pago verificado (2026-10-01).
 *
 * El motor v1 mandaba el Purchase con el pago PENDIENTE (el cliente decía
 * "sí" y Meta aprendía de una venta que todavía no existía). La regla ahora:
 * pasarelas (webhooks), comprobante aprobado (verificacion-pago) o
 * transferencia confirmada (confirm_transfer_payment). Todo pasa por
 * `avisarCompraRealAMeta`, y este archivo lo amarra.
 */

const COMPRA = {
  tenantId: 1,
  productId: 168,
  amount: 89900,
  currency: "COP",
  customerPhone: "3001234567",
  customerEmail: "cliente@ejemplo.com",
  origen: "test",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("avisarCompraRealAMeta", () => {
  it("sin píxel o sin token no hace nada (y no lanza)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    for (const facebook of [{}, { pixelId: "123" }, { accessToken: "tok" }]) {
      const ok = await avisarCompraRealAMeta({ ...COMPRA }, async () => ({ facebook }));
      expect(ok).toBe(false);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("con píxel y token manda el Purchase a Graph API", async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchSpy);
    const ok = await avisarCompraRealAMeta(
      { ...COMPRA },
      async () => ({ facebook: { pixelId: "PIXEL", accessToken: "TOKEN" } }),
    );
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();
    const llamada = fetchSpy.mock.calls[0] as any[];
    const url = llamada[0];
    const init = llamada[1] || {};
    expect(String(url)).toContain("PIXEL/events");
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo.data[0].event_name).toBe("Purchase");
    expect(cuerpo.data[0].custom_data.value).toBe(89900);
  });

  it("si Meta falla, devuelve false y no lanza", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("red caída"); }));
    const ok = await avisarCompraRealAMeta(
      { ...COMPRA },
      async () => ({ facebook: { pixelId: "PIXEL", accessToken: "TOKEN" } }),
    );
    expect(ok).toBe(false);
  });
});

describe("Purchase solo desde pago verificado (fuente)", () => {
  const leer = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");

  it("agent.ts (motor v1) ya NO manda Purchase con el pago pendiente", () => {
    const codigo = leer("../agent.ts");
    expect(codigo).not.toMatch(/sendPurchaseEvent/);
  });

  it("los tres caminos reales usan avisarCompraRealAMeta", () => {
    expect(leer("../verificacion-pago.ts")).toMatch(/avisarCompraRealAMeta/);
    expect(leer("../app-operator.ts")).toMatch(/avisarCompraRealAMeta/);
    expect(leer("../../routes/webhooks.ts")).toMatch(/avisarCompraRealAMeta/);
  });
});
