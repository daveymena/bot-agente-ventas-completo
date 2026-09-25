import { describe, it, expect } from "vitest";
import { resumenDelPedido, confirmacionDelPedido, type PedidoDropshipping } from "../dropshipping";
import { CONDICIONES_DE_RESPALDO } from "../modelo-de-negocio";

const pedido: PedidoDropshipping = {
  id: 1, tenantId: 1, conversationId: 1, productId: 2, productName: "Corrector de postura en X",
  quantity: 1, unitPrice: "36000", total: "36000", metodoPago: "contraentrega", estado: "por_confirmar",
  wooOrderId: null, wooError: null,
  nombre: "Laura Gómez", telefono: "3001234567", documento: null,
  direccion: "Calle 45 # 23-10", barrio: "Laureles", ciudad: "Medellín", departamento: "Antioquia",
};

describe("el pedido le llega al cliente como ficha", () => {
  it("el resumen no muestra la cédula si no se dio (antes decía 'Cédula undefined')", () => {
    const r = resumenDelPedido(pedido, CONDICIONES_DE_RESPALDO);
    expect(r).not.toMatch(/Cédula|undefined|null/);
    expect(r).toContain("👤 Laura Gómez");
  });

  it("si la dio, sí aparece", () => {
    expect(resumenDelPedido({ ...pedido, documento: "1020304050" }, CONDICIONES_DE_RESPALDO)).toContain("🪪 Cédula 1020304050");
  });

  it("la confirmación sale un dato por línea con su emoji, no como frases corridas", () => {
    const lineas = confirmacionDelPedido(pedido, CONDICIONES_DE_RESPALDO).split("\n");
    expect(lineas[0]).toBe("📦 Corrector de postura en X × 1");
    expect(lineas.find((l) => l.startsWith("🏠"))).toBe("🏠 Calle 45 # 23-10, barrio Laureles");
    expect(lineas.find((l) => l.startsWith("🏙️"))).toBe("🏙️ Medellín, Antioquia");
    expect(lineas.every((l) => /^\p{Extended_Pictographic}/u.test(l))).toBe(true);
  });
});
