import { describe, expect, it } from "vitest";
import { benchmarksDeLaCuenta } from "../experto-en-anuncios";

describe("métricas de Meta no equivalen a compradores", () => {
  it("no declara ganadora la campaña con conversaciones más baratas", async () => {
    const fb = {
      listActiveCampaigns: async () => [{ id: "mensajes", name: "Chats baratos" }, { id: "compras", name: "Ventas" }],
      getCampaignMetrics: async () => ({ campaigns: [{ id: "mensajes", spend: 100, results: 100 }, { id: "compras", spend: 100, results: 2 }] }),
      radiografiaDeCampana: async () => null,
    };
    const r = await benchmarksDeLaCuenta(fb);
    expect(r.mejor).toBeNull();
    expect(r.peor).toBeNull();
    expect(r.campanas).toHaveLength(2);
  });
  it("consulta fallida no es cuenta sin campañas", async () => {
    await expect(benchmarksDeLaCuenta({ listActiveCampaigns: async () => [], lastCampaignListError: "token expired" })).rejects.toThrow("No se pudieron consultar");
  });
  it("métricas ausentes no son cero ventas", async () => {
    await expect(benchmarksDeLaCuenta({ listActiveCampaigns: async () => [{ id: "x" }], getCampaignMetrics: async () => null })).rejects.toThrow("no disponibles");
  });
});
