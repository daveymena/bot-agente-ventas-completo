import { describe, it, expect } from "vitest";
import { elegirFamilia, tokensDe } from "../landing/design-system";

/**
 * "¿Por qué genera siempre con el mismo color de fondo, rosado o medio rojo,
 * cuando hay productos neutros o de otros colores?" (dueño, 19-09-2026).
 * Sin familia elegida, OpenCode recibía solo el color de marca del negocio.
 * Ahora la familia se elige por producto y cada una trae su paleta.
 */
describe("la paleta depende del producto", () => {
  const casos: Array<[string, string, string]> = [
    ["INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS", "Inteligencia Artificial", "tecnologia"],
    ["CURSO DE PIANO COMPLETO", "Música", "educacion"],
    ["CURSO EXCEL AVANZADO", "Tecnología", "tecnologia"],
    ["Crema facial antiarrugas", "Belleza", "belleza"],
    // "cojín moto" cayó en la taxonomía cerrada de físicos "Herramientas y
    // automotor" (lib/taxonomia.ts, 20-09-2026), que en el design system va con
    // la línea "oscura". El caso viejo lo esperaba como "ecommerce" (el default
    // de físico de antes); se actualiza al rubro que de verdad le corresponde.
    ["Cojín Moto Viajero", "Accesorios", "oscura"],
    ["Rutina de entrenamiento en casa", "Fitness", "fitness"],
    ["Organizador de cocina", "Hogar", "familiar"],
    ["Audífonos Bluetooth inalámbricos", "Tecnología", "electronica"],
    ["Colágeno hidrolizado con vitamina C", "Salud", "suplemento"],
    ["Café de origen tostado artesanal", "Alimentos", "gourmet"],
    ["Vestido largo de verano", "Moda", "minimal"],
  ];
  it.each(casos)("%s → %s", (nombre, categoria, esperada) => {
    const e = elegirFamilia({ nombre, categoria, descripcion: "", tipo: /coj|organizador|aud|colag|caf|vestido/i.test(nombre) ? "physical" : "digital", precio: 60000 });
    expect(e.familia).toBe(esperada);
    expect(e.porque.length).toBeGreaterThan(10);
  });

  it("las familias elegidas para el catálogo no comparten acento: no sale todo del mismo color", () => {
    const acentos = new Set(casos.map(([n, c]) => tokensDe(elegirFamilia({ nombre: n, categoria: c, tipo: "digital" }).familia).color.acento));
    expect(acentos.size).toBeGreaterThanOrEqual(8);
  });

  it("la línea tecnológica no es rosa ni pastel", () => {
    const t = tokensDe("tecnologia");
    expect(t.color.fondo.toLowerCase()).not.toMatch(/^#f[0-9a-f]e|^#fd|^#fce/);
    expect(t.color.acento).toBe("#5B4BE8");
  });
});
