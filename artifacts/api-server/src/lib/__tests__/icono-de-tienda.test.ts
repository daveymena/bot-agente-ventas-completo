import { describe, it, expect } from "vitest";
import { iconoDeTienda, inicialDe, tintaSobre } from "../icono-de-tienda";

describe("icono de la tienda: la marca del negocio, no la de VentasPro", () => {
  it("con logo cargado, el icono es el logo", () => {
    const r = iconoDeTienda({ nombre: "Tecnovariedades", logo: "/uploads/logo.png", color: "#0F766E", appUrl: "https://ventasproia.com" });
    expect(r.href).toBe("https://ventasproia.com/uploads/logo.png");
    expect(r.color).toBe("#0F766E");
  });
  it("sin logo, genera un SVG con su color y sus iniciales", () => {
    const r = iconoDeTienda({ nombre: "Tecno Variedades", logo: null, color: "#0F766E" });
    expect(r.tipo).toBe("image/svg+xml");
    const svg = decodeURIComponent(r.href.replace("data:image/svg+xml;utf8,", ""));
    expect(svg).toContain('fill="#0F766E"');
    expect(svg).toContain(">TV<");
  });
  it("color inválido → índigo por defecto; tinta legible según el fondo", () => {
    expect(iconoDeTienda({ nombre: "X", color: "rojo" }).color).toBe("#4F46E5");
    expect(tintaSobre("#FDE68A")).toBe("#111827");
    expect(tintaSobre("#173A6D")).toBe("#FFFFFF");
    expect(inicialDe("¡Mi tienda! 🛍️")).toBe("MT");
  });
});
