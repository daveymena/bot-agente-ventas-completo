import { describe, it, expect } from "vitest";
import { copyDeOtroModelo } from "../anuncio-por-modelo";

/**
 * 24-09-2026: se subió a Meta un producto FÍSICO con texto de curso digital, y
 * el admin pidió cuidar también lo contrario.
 */
describe("el texto del anuncio tiene que prometer lo que el producto entrega", () => {
  it("físico con texto de curso: NO", () => {
    expect(copyDeOtroModelo("Haz clic abajo para descargar todo el contenido. Acceso de por vida.", "fisico")).toMatch(/digital/);
    expect(copyDeOtroModelo("Corrector de postura: 12 módulos en video", "fisico")).not.toBeNull();
  });
  it("físico con texto de físico: sí", () => {
    expect(copyDeOtroModelo("😣 ¿Hombros hacia adelante? Pagás al recibir, envíos a todo Colombia.", "fisico")).toBeNull();
  });
  it("digital con 'pagás al recibir' o 'contraentrega': NO", () => {
    expect(copyDeOtroModelo("Curso de piano. Pagás al recibir en tu casa.", "digital")).toMatch(/física/);
    expect(copyDeOtroModelo("Curso de piano, contraentrega", "digital")).not.toBeNull();
  });
  it("digital con texto de digital: sí", () => {
    expect(copyDeOtroModelo("Curso de piano desde cero. Acceso inmediato por WhatsApp.", "digital")).toBeNull();
  });
  it("'recurso' no es 'curso'", () => {
    expect(copyDeOtroModelo("Un buen recurso para tu espalda", "fisico")).toBeNull();
  });
});
