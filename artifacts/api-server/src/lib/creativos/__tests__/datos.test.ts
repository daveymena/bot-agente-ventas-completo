import { describe, expect, it } from "vitest";
import { beneficiosDe, inventaCifras } from "../datos";

describe("datos del creativo", () => {
  it("los beneficios salen sin emojis ni viñetas al principio (la maqueta pone sus ✓)", () => {
    expect(beneficiosDe({ features: ["🪢 Diseño en X para soporte lumbar", "🎛️ Cierres de velcro", "- Ajustable a tu talla", "✓ Tela fresca"] }))
      .toEqual(["Diseño en X para soporte lumbar", "Cierres de velcro", "Ajustable a tu talla", "Tela fresca"]);
  });

  it("un gancho con cifras que no están en la ficha se descarta", () => {
    const d = { datos: { precio: "$36.000", beneficios: ["Llega en 3 a 5 días"], sellos: [], nombre: "Corrector" } } as any;
    expect(inventaCifras("50% OFF hoy", d)).toBe(true);
    expect(inventaCifras("+10.000 clientes felices", d)).toBe(true);
    expect(inventaCifras("Solo $36.000", d)).toBe(false);
    expect(inventaCifras("Llega en 3 a 5 días", d)).toBe(false);
  });
});
