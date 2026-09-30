import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Aislamiento entre negocios (29-09-2026): el puente de Dropi (lib/dropi.ts)
 * usa DROPI_TOKEN, la sesión GLOBAL del servidor = la cuenta de Dropi del
 * dueño de la plataforma. `dropi_create_order` la usaba para cualquier
 * negocio (pedido real contra la cuenta del dueño) y los respaldos de
 * búsqueda/estado leían con ella. Un negocio sin token propio que no es admin
 * no debe llegar nunca al puente.
 */
const puente = {
  dropiStatus: vi.fn(async () => ({ ok: true })),
  dropiSearchProducts: vi.fn(async () => ({ ok: true, data: [] })),
  dropiProductosConOrdenes: vi.fn(async () => ({ ok: true, data: [] })),
  dropiCreateOrder: vi.fn(async () => ({ ok: true, data: {} })),
};
vi.mock("../dropi", async (orig) => ({ ...(await orig<any>()), ...puente }));
vi.mock("../dropi-directo", async (orig) => ({
  ...(await orig<any>()),
  tokenDropiDelTenant: vi.fn(async () => null),
  estadoTokenDropi: vi.fn(async () => ({ estado: "ausente" })),
}));

import { executeAction } from "../app-operator";
import { tenantManager } from "../tenantManager";

const CLIENTE = { email: "cliente@gmail.com", isAdmin: false } as any;
const ADMIN = { email: "daveymena16@gmail.com", isAdmin: true } as any;

describe("puente de Dropi: solo el admin de la plataforma", () => {
  afterEach(() => { vi.restoreAllMocks(); Object.values(puente).forEach((f) => f.mockClear()); });

  it("un cliente sin token propio NO usa la sesión global (estado, búsqueda, con órdenes)", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue(CLIENTE);
    const ctx = { tenantId: 2 } as any;
    const estado = await executeAction("dropi_status", {}, ctx);
    const busca = await executeAction("dropi_search_products", { query: "faja" }, ctx);
    const conOrdenes = await executeAction("dropi_con_ordenes", {}, ctx);
    for (const r of [estado, busca, conOrdenes]) {
      expect(r.ok).toBe(false);
      expect(r.summary).toMatch(/dropi_conectar|token de Dropi/i);
    }
    expect(puente.dropiStatus).not.toHaveBeenCalled();
    expect(puente.dropiSearchProducts).not.toHaveBeenCalled();
    expect(puente.dropiProductosConOrdenes).not.toHaveBeenCalled();
  });

  it("el admin sin token propio sí puede usar el puente como respaldo", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue(ADMIN);
    const r = await executeAction("dropi_status", {}, { tenantId: 1 } as any);
    expect(puente.dropiStatus).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });

  it("si no se puede resolver el negocio, se deniega (fail-closed)", async () => {
    vi.spyOn(tenantManager, "getTenantById").mockResolvedValue(null as any);
    await executeAction("dropi_status", {}, { tenantId: 9 } as any);
    expect(puente.dropiStatus).not.toHaveBeenCalled();
  });
});
