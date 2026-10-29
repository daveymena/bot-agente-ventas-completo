import { describe, expect, it } from "vitest";
import { estaActiva } from "./sidebar-navigation";

describe("selección del menú", () => {
  it("selecciona Inicio solo en la raíz", () => {
    expect(estaActiva("/", "/")).toBe(true);
    expect(estaActiva("/pedidos", "/")).toBe(false);
  });
  it("reconoce detalles de sección sin confundir rutas similares", () => {
    expect(estaActiva("/products/7", "/products")).toBe(true);
    expect(estaActiva("/products-other", "/products")).toBe(false);
  });
  it("distingue Studio y Creativos aunque compartan ruta", () => {
    expect(estaActiva("/estudio", "/estudio", "espacio=creativos")).toBe(false);
    expect(estaActiva("/estudio", "/estudio?espacio=creativos", "producto=7&espacio=creativos")).toBe(true);
    expect(estaActiva("/estudio", "/estudio?espacio=creativos", "espacio=landings")).toBe(false);
    expect(estaActiva("/estudio", "/estudio", "espacio=landings")).toBe(true);
  });
});
