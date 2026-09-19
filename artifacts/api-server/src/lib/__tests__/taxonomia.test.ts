import { describe, it, expect } from "vitest";
import { categoriaReal, NOMBRES_CANONICOS } from "../taxonomia";

// Nombres REALES del catálogo de producción (19-09-2026) con la categoría
// que traía el proveedor. Lo que se espera es un nombre de la lista cerrada.
const casos: Array<[string, string | null, string]> = [
  ["Corrector de postura en X", "Salud y bienestar", "Salud y bienestar"],
  ["RUEDA ABDOMINAL CON SOPORTE", "Deportes", "Deporte y fitness"],
  ["Bolso canguro antirrobo", "Hogar", "Moda y accesorios"],
  ["BOLSO VIAJERO TIPO MORRAL EQUIPAJE MANO", "General", "Moda y accesorios"],
  ["THERATUBO ELASTICO CON AGARRADERAS GROSO", "General", "Deporte y fitness"],
  ["Faja Miss Belt Cintura Delgada", "General", "Salud y bienestar"],
  ["Bolso Morral Térmica Estilo Gato Pañalera", "bebes y materno", "Bebés y maternidad"],
  ["TRANSPORTADOR DE MASCOTAS PH", "General", "Mascotas"],
  ["LAZO CROSSFIT DROPSHIPPING", "Otro", "Deporte y fitness"],
  ["RUEDAS PARA MUEBLES", "General", "Hogar y organización"],
  ["Tensiómetro digital con voz", "General", "Salud y bienestar"],
  ["Compresor de Aire 300 PSI", "General", "Herramientas y automotor"],
  ["Cojín Moto Viajero 3d", "General", "Herramientas y automotor"],
  ["Linterna Tactica Recargable + Estuche", "General", "Tecnología y accesorios"],
  ["CUADERNOS MÁGICOS CALIGRAFÍA MONTESSORI", "General", "Juguetes y entretenimiento"],
  ["Afilador De Cuchillos Tijera Acero Mango", "General", "Cocina"],
  ["Mini Licuadora Portatil Batidora Recargable", "General", "Cocina"],
  ["LOCIÓN HIDRONUTRITIVA", "General", "Belleza y cuidado personal"],
  ["Colgante Cuarzo Amatista", "Bisutería", "Moda y accesorios"],
  ["DESENGRASANTE MULTIPROPOSITO 2 litros ESSENTIAL", "General", "Limpieza"],
  ["MEDITACIONES DIARIAS CON  JESUS", "General", "Libros y espiritualidad"],
  ["Renovador Negro Perfecto x 200ml", "General", "Herramientas y automotor"],
  ["LUZ LED SOLAR", "General", "Hogar y organización"],
  ["PRUNEX 1 ¡Libera el tránsito en tu sistema!", "General", "Alimentos y suplementos"],
  ["ORGANIZADOR DE ZAPATOS CAJA X 4", "General", "Hogar y organización"],
  ["Producto rarísimo sin pistas", "Vaporizadores", "Tecnología y accesorios"],
  ["Cosa sin ninguna pista", "General", "Otros"],
];

describe("taxonomía: nombre real de categoría para cada producto físico", () => {
  for (const [nombre, prov, esperado] of casos) {
    it(`${nombre} → ${esperado}`, () => {
      const r = categoriaReal({ nombre, categoriaProveedor: prov });
      expect(NOMBRES_CANONICOS).toContain(r);
      expect(r).toBe(esperado);
    });
  }
  it("respeta lo que sugiere el curador si es canónico, y corrige si no lo es", () => {
    expect(categoriaReal({ nombre: "Faja", categoriaSugerida: "Salud y bienestar" })).toBe("Salud y bienestar");
    expect(categoriaReal({ nombre: "Faja reductora", categoriaSugerida: "Dropshipping" })).toBe("Salud y bienestar");
  });
});

describe("'Otro(s)' del proveedor nunca manda", () => {
  it("Cojín Moto Viajero 3d con categoría 'Otro' → Herramientas y automotor", () => {
    expect(categoriaReal({ nombre: "Cojín Moto Viajero 3d", categoriaProveedor: "Otro" })).toBe("Herramientas y automotor");
    expect(categoriaReal({ nombre: "Cojín Moto Viajero 3d", categoriaSugerida: "Otros" })).toBe("Herramientas y automotor");
  });
});
