import { describe, it, expect } from "vitest";
import { publicoDelProducto, paletaDelPublico, PALETAS } from "../publico-del-producto";

/**
 * Pedido del dueño (23-09-2026): la landing tiene que ser coherente con PARA
 * QUIÉN es el producto. Casos tomados del catálogo real de la tienda.
 */
const leer = (nombre: string, descripcion = "", categoria = "") => publicoDelProducto({ nombre, descripcion, categoria }).publico;

describe("para quién es", () => {
  it("un corrector 'unisex' es unisex aunque Dropi lo ponga en Belleza", () => {
    expect(leer("Corrector De Postura Espalda Unisex Black", "", "Belleza y cuidado personal")).toBe("unisex");
  });
  it("'puede ser usada por hombres y mujeres' es unisex", () => {
    expect(leer("Corrector de postura", "Faja diseñada para corregir la postura. Puede ser usada por hombres y mujeres.")).toBe("unisex");
  });
  it("si nombra a los dos por separado, también es unisex", () => {
    expect(leer("Reloj", "Ideal para regalar a tu mujer o a un hombre de la familia")).toBe("unisex");
  });
  it("faja de cintura para mujer → mujer", () => {
    expect(leer("Faja Miss Belt Cintura Delgada", "Moldea la figura de la mujer")).toBe("mujer");
  });
  it("afeitadora → hombre", () => {
    expect(leer("Afeitadora eléctrica recargable", "Para barba y bigote")).toBe("hombre");
  });
  it("cuadernos Montessori → niños (y no se confunde con nada más)", () => {
    expect(leer("CUADERNOS MÁGICOS CALIGRAFÍA MONTESSORI")).toBe("ninos");
  });
  it("tetero / recién nacido → bebés", () => {
    expect(leer("Esterilizador de teteros", "Para el bebé recién nacido")).toBe("bebes");
  });
  it("'hombros' no es 'hombre' y 'para el dolor' no es 'para él'", () => {
    expect(leer("Corrector de Hombros y Clavícula", "Alinea hombros y columna, ideal para el dolor de espalda")).toBe("general");
  });
  it("en un pack DIGITAL las características son el índice: 'COMIDA PARA BEBES' no lo vuelve de bebés", () => {
    expect(publicoDelProducto({
      nombre: "GASTRONOMÍA", tipo: "digital",
      descripcion: "Recetario completo, técnicas culinarias, cocina internacional. Para chefs y aficionados.",
      caracteristicas: ["APERITIVOS", "RECETAS VARIAS (292)", "COMIDA PARA BEBES"],
    }).publico).toBe("general");
  });
  it("una mención suelta al fondo de una descripción larga no decide", () => {
    const larga = `Pulsera de 7 piedras naturales. ${"Texto sobre cada piedra. ".repeat(12)}Se asocia con la sanación del útero en la mujer.`;
    expect(leer("Pulsera 7 chakras", larga)).toBe("general");
  });
  it("'nuestra línea masculina… cabello y barba' sí es de hombre", () => {
    expect(leer("KIT 19.98 CON CERA BRILLANTE", "KIT 19.98 es nuestra línea masculina que cuida cabello, barba y piel")).toBe("hombre");
  });
  it("sin señales no se fuerza nada", () => {
    expect(leer("Compresor de Aire 300 PSI", "Para llantas de carro y moto")).toBe("general");
    expect(paletaDelPublico("general")).toBeNull();
  });
});

describe("las paletas", () => {
  it("unisex es neutra y evita rosas; hombre también los evita", () => {
    expect(PALETAS.unisex.evitar).toMatch(/Rosas/);
    expect(PALETAS.hombre.evitar).toMatch(/Rosas/);
  });
  it("todos los acentos dejan leer texto blanco encima (contraste ≥ 3:1)", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
    };
    for (const [publico, p] of Object.entries(PALETAS)) {
      const contraste = 1.05 / (lum(p.acento) + 0.05);
      expect(contraste, `${publico} ${p.acento}`).toBeGreaterThanOrEqual(3);
    }
  });
});
