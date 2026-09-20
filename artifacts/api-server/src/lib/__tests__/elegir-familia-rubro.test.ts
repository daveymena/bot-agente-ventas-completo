import { describe, it, expect } from "vitest";
import { elegirFamilia } from "../landing/design-system";

// Medido 20-09-2026: las 4 landings nuevas salieron "gourmet" porque "te "
// calzaba dentro de "soporte" y de la descripción.
describe("elegirFamilia: palabras completas, categoría y nombre antes que la descripción", () => {
  it("corrector de postura con soporte → ecommerce, no gourmet", () => {
    const r = elegirFamilia({ nombre: "Corrector De Postura Espalda Unisex Blac", categoria: "Salud y bienestar", descripcion: "Corrector con soporte lumbar. Ajustable, te queda bien y te ayuda.", tipo: "physical", precio: 62000 });
    expect(r.familia).toBe("ecommerce");
  });
  it("rueda abdominal con soporte → fitness", () => {
    expect(elegirFamilia({ nombre: "RUEDA ABDOMINAL CON SOPORTE", categoria: "Deporte y fitness", descripcion: "te ayuda a entrenar", tipo: "physical" }).familia).toBe("fitness");
  });
  it("té de hierbas sí es gourmet", () => {
    expect(elegirFamilia({ nombre: "Te de hierbas orgánico", categoria: "Alimentos y suplementos", tipo: "physical" }).familia).toBe("gourmet");
  });
  it("licuadora → familiar (cocina)", () => {
    expect(elegirFamilia({ nombre: "Mini Licuadora Portátil", categoria: "Cocina", tipo: "physical" }).familia).toBe("familiar");
  });
  it("curso de inteligencia artificial → tecnologia", () => {
    expect(elegirFamilia({ nombre: "Curso de Inteligencia Artificial", categoria: "Cursos", tipo: "digital" }).familia).toBe("tecnologia");
  });
});
