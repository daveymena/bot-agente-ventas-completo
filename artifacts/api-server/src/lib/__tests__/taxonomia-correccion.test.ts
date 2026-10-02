import { describe, it, expect } from "vitest";
import { categoriaCorregida, categoriaReal, lineaDeProducto, NOMBRES_DIGITALES } from "../taxonomia";

// Casos REALES de sofia-premium (30-09-2026): nombre, categoría con la que
// estaban, y dónde tienen que quedar.

describe("físicos mal ubicados se corrigen", () => {
  const casos: Array<[string, string, string]> = [
    ["Portátil HP 14-DQ6101DX | Intel Processor N150 | 4GB", "Cocina", "Computadores y portátiles"],
    ["Portátil ASUS Vivobook 15 X1504VA-BQ4555 | Core i5", "Moda y accesorios", "Computadores y portátiles"],
    ["Portátil Lenovo IdeaPad Slim 3 15AMN8 | Ryzen 5", "Papelería y oficina", "Computadores y portátiles"],
    ["Portátil HP 15-DY0700TG | Pentium N5030 | 8GB", "Otros", "Computadores y portátiles"],
    ["Portátil Lenovo V14 Gen 4 AMN | Ryzen 3 7320U", "Tecnología y accesorios", "Computadores y portátiles"],
    // "Morral" respalda Moda, pero el nombre respalda más a Computadores.
    ["Portátil ASUS Vivobook 15 X1504VA-BQ4555 | Core i5-1334U | 12GB DDR5 | 512GB SSD | 15.6\" WUXGA | Incluye Morral + Mouse", "Moda y accesorios", "Computadores y portátiles"],
  ];
  for (const [nombre, actual, esperado] of casos) {
    it(`${nombre} (en ${actual}) → ${esperado}`, () => {
      expect(categoriaCorregida({ kind: "physical", actual, nombre })).toBe(esperado);
    });
  }

  it("no mueve lo que su nombre respalda", () => {
    expect(categoriaCorregida({ kind: "physical", actual: "Deporte y fitness", nombre: "Bolso Mochila Deportiva Futbol Deportes" })).toBeNull();
    expect(categoriaCorregida({ kind: "physical", actual: "Tecnología y accesorios", nombre: "Cámara de Seguridad 3 Antenas con Puerto LAN" })).toBeNull();
    expect(categoriaCorregida({ kind: "physical", actual: "Bebés y maternidad", nombre: "Coche Mecedora para Bebé con Cierre de Maleta" })).toBeNull();
  });

  it("no toca una categoría que el dueño inventó", () => {
    expect(categoriaCorregida({ kind: "physical", actual: "Ofertas de temporada", nombre: "Portátil HP 14" })).toBeNull();
  });
});

describe("la clave tiene que ser palabra, no pedazo de palabra", () => {
  it("'olla' no calza dentro de 'desarrollador' (el portátil no va a Cocina)", () => {
    const r = categoriaReal({ nombre: "Equipo X", descripcion: "Ideal para el desarrollador y el estudiante" });
    expect(r).not.toBe("Cocina");
  });
  it("sigue sirviendo como prefijo: 'deport' calza 'deportiva'", () => {
    expect(categoriaReal({ nombre: "Toalla deportiva", categoriaProveedor: "General" })).toBe("Deporte y fitness");
  });
  it("la licuadora portátil sigue en Cocina", () => {
    expect(categoriaReal({ nombre: "Mini Licuadora Portatil Batidora Recargable", categoriaProveedor: "General" })).toBe("Cocina");
  });
});

describe("digitales en 'General' van a su categoría", () => {
  const casos: Array<[string, string]> = [
    ["CURSO ADOBE INDESIGN DESDE CERO", "Diseño Gráfico"],
    ["DISEÑO DE LOGOTIPOS CON RETICULAS", "Diseño Gráfico"],
    ["PACK CANVA", "Diseño Gráfico"],
    ["PRESETS LIGHTROOM", "Fotografía"],
    ["CURSO PHOTOSHOP PARA RETOQUE DE RETRATOS", "Fotografía"],
    ["PACK FILMORA", "Video y animación"],
    ["CURSO CINEMA 4D", "Video y animación"],
    ["CURSO MASTER EN WORDPRESS", "Programación"],
    ["CURSO CIBERSEGURIDAD", "Programación"],
    ["📂2 OFFICE", "Office y software"],
    ["CURSO DE ECOMMERCE", "Marketing"],
    ["PACK CONTABILIDAD", "Negocios y finanzas"],
    ["CURSO INGLES OXFORD", "Idiomas"],
    ["GUITARRA ACÚSTICA", "Música"],
    ["CURSO REVIT BIM", "Construcción"],
    ["PACK DRYWALL DESDE CERO", "Construcción"],
    ["CURSO MECANICA DE MOTOS", "Oficios"],
    ["CURSO CAR AUDIO DESDE CERO", "Oficios"],
    ["15 MIL PLANOS PARA MUEBLES DE CARPINTERIA", "Oficios"],
    ["CURSO PILATES PARA UN CUERPO DE 10", "Salud y Deporte"],
    ["KID IMPRIMIBLE", "Plantillas e imprimibles"],
    ["PREUNIVERSITARIO", "Educación"],
    ["PACK EDUCA A TU PERRO", "Mascotas"],
  ];
  for (const [nombre, esperado] of casos) {
    it(`${nombre} → ${esperado}`, () => {
      const r = categoriaCorregida({ kind: "digital", actual: "General", nombre });
      expect(r).toBe(esperado);
      expect(NOMBRES_DIGITALES).toContain(r);
    });
  }

  it("sin ninguna pista se queda donde está (no se inventa)", () => {
    expect(categoriaCorregida({ kind: "digital", actual: "General", nombre: "PROYECTOS" })).toBeNull();
  });
  it("'Musica' y 'Música' dejan de ser dos categorías", () => {
    expect(categoriaCorregida({ kind: "digital", actual: "Musica", nombre: "CURSO DE PIANO COMPLETO" })).toBe("Música");
  });
  it("gastronomía sale de 'Salud y Deporte'", () => {
    expect(categoriaCorregida({ kind: "digital", actual: "Salud y Deporte", nombre: "GASTRONOMÍA" })).toBe("Cocina y gastronomía");
  });
  it("un digital nunca cae en una categoría física", () => {
    expect(categoriaCorregida({ kind: "digital", actual: "General", nombre: "CURSO REPARACIÓN DE CELULARES" })).toBe("Tecnología");
  });
});

describe("línea del producto", () => {
  it("físico importado de Dropi es dropshipping", () => {
    expect(lineaDeProducto({ kind: "physical", metadata: JSON.stringify({ source: "dropi", dropiProductId: 1407660 }) })).toBe("dropshipping");
    expect(lineaDeProducto({ kind: "physical", metadata: { dropiProductId: 55 } })).toBe("dropshipping");
  });
  it("físico sin rastro de Dropi es stock propio", () => {
    expect(lineaDeProducto({ kind: "physical", metadata: JSON.stringify({ woocommerce: { id: 9 } }) })).toBe("fisico");
    expect(lineaDeProducto({ kind: "physical", metadata: null })).toBe("fisico");
    expect(lineaDeProducto({ kind: "physical", metadata: "no es json" })).toBe("fisico");
  });
  it("digital y servicio", () => {
    expect(lineaDeProducto({ kind: "digital" })).toBe("digital");
    expect(lineaDeProducto({ kind: "servicio" })).toBe("servicio");
  });
});
