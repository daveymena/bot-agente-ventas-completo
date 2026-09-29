import { describe, it, expect } from "vitest";
import { describePlannedAction, buildMcpToolRegistry } from "../opencode-mcp-tools";

/**
 * El plan que aprueba el admin tiene que mostrar LO QUE SE VA A EJECUTAR.
 *
 * Incidente 2026-09-29 (proveedor megacomputer): el plan mostraba
 * `.../uploads/2026/09/edite` -- la URL cortada a 60 caracteres a mitad del
 * nombre -- y parecía completa; el admin la aprobó rota → 404. Y los
 * productos se crearon sin foto y en categorías absurdas porque el plan solo
 * mostraba nombre y precio: el kind (digital/físico) y la categoría eran
 * invisibles al momento de aprobar.
 */
describe("El plan muestra URLs completas (nunca cortadas a mitad)", () => {
  const URL = "https://megacomputer.com.co/wp-content/uploads/2026/09/edited1-1-azul-abyss-laptop-lenovo-ideapad.webp";

  it("set_product_image sale con la URL entera, no a 60 caracteres", () => {
    const texto = describePlannedAction({ tool: "set_product_image", args: { productId: 125, imageUrl: URL } });
    // La URL de arriba mide 118: con el corte viejo a 60 salía "…/09/edite".
    expect(texto).toContain(URL);
    expect(texto).not.toContain("/09/edite ");
    expect(texto).not.toContain("/09/edite\n");
  });

  it("si igual hay que cortar, se avisa con … (no parece completa)", () => {
    const larguisima = `https://tienda.com/${"a".repeat(300)}.webp`;
    const texto = describePlannedAction({ tool: "set_product_image", args: { productId: 1, imageUrl: larguisima } });
    expect(texto).toContain("…");
  });
});

describe("El plan muestra kind, categoría e imagen al crear productos", () => {  it("un físico sin foto ni categoría salta a la vista antes del sí", () => {
    const texto = describePlannedAction({
      tool: "create_product",
      args: { name: "Portátil Lenovo", price: 1859000, currency: "COP" },
    });
    expect(texto).toContain("Portátil Lenovo");
    expect(texto).toContain("SIN imagen");
  });

  it("un físico bien armado muestra tipo y categoría", () => {
    const texto = describePlannedAction({
      tool: "create_product",
      args: { name: "Portátil Lenovo", price: 1859000, currency: "COP", kind: "physical", categoryId: 3, imageUrl: "https://x.com/foto.webp" },
    });
    expect(texto).toContain("physical");
    expect(texto).toContain("3");
    expect(texto).not.toContain("SIN imagen");
  });
});

describe("La estimación se muestra como lectura (no como gasto)", () => {
  it("fb_estimar dice objetivo, plata y que no gasta", () => {
    const texto = describePlannedAction({
      tool: "fb_estimar",
      args: { objetivo: "mensajes", dailyBudget: 20000, dias: 3 },
    });
    expect(texto).toContain("mensajes");
    expect(texto).toContain("20.000");
    expect(texto).toContain("no crea nada ni gasta");
  });
});

describe("Las herramientas estilo DropKiller llegan al modelo", () => {
  const nombres = (pedido: string) => buildMcpToolRegistry(pedido).map((t) => t.name);
  it("radar de ganadores con 'qué vender' / 'ganador'", () => {
    expect(nombres("qué producto ganador me recomiendas para vender")).toContain("producto_ganador");
  });
  it("calculadora con 'roi' / 'punto de equilibrio'", () => {
    expect(nombres("calcula el roi y el punto de equilibrio de este producto")).toContain("dropi_roi");
  });
  it("espía con 'espiar tienda'", () => {
    expect(nombres("quiero espiar esta tienda shopify de la competencia")).toContain("espiar_tienda");
  });
});
