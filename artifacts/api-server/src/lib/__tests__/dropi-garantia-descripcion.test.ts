import { describe, it, expect } from "vitest";
import { garantiaDesdeDropi } from "../dropi-directo";

// Desc real de AB Roller #1620647 (medida 03-10-2026)
const descAb = "<p>Entrena en casa, sin gimnasio. Aprovecha esta oportunidad!<br><br>GARANT\u00cdAS<br>- En caso de recibir el producto diferente al solicitado o averiado, se enviar\u00e1 uno nuevamente completamente nuevo. Debe solicitarlo 5 d\u00edas despu\u00e9s de recibido.&nbsp;</p><p>- En caso de que el producto presente una falla, puede solicitar el cambio de ese, hasta un mes despu\u00e9s de recibido el producto.&nbsp;</p><p>En estos casos de garant\u00eda, nosotros como proveedores asumimos todos los costos de env\u00edo.</p>";
// Desc real de Mochila Antirrobo #2248412: NO tiene sección de garantía (solo el claim "Seguridad garantizada!")
const descMochila = "<p>Mochila Antirrobo Manos Libres</p><p>\u00a1Seguridad garantizada!</p><p>Sistema antirrobo oculto.</p>";

describe("garantiaDesdeDropi con descriptions reales de proveedores", () => {
  it("AB Roller: extrae las reglas de la sección GARANTÍAS", () => {
    const g = garantiaDesdeDropi({ description: descAb } as any);
    expect(g).toBeTruthy();
    expect(g).toMatch(/5 d/i);
    expect(g).toMatch(/recibid/i);
    // no debe traer la parte de "asumimos costos" (línea de cierre separada) ni TODO el texto
    expect(g!.length).toBeLessThan(230);
  });
  it("Mochila Antirrobo: sin política de garantía -> null (no inventas)", () => {
    expect(garantiaDesdeDropi({ description: descMochila } as any)).toBeNull();
  });
  it("description vacía -> null", () => {
    expect(garantiaDesdeDropi({ description: "" } as any)).toBeNull();
  });
  it("undefined -> null", () => {
    expect(garantiaDesdeDropi({} as any)).toBeNull();
  });
  it("recorta a 220 chars si la política es larga", () => {
    const larga = "<p>GARANT\u00cdAS<br>- " + "Regla importante del proveedor. ".repeat(20) + "</p>";
    const g = garantiaDesdeDropi({ description: larga } as any);
    expect(g!.length).toBeLessThanOrEqual(220);
    expect(g!.endsWith("…")).toBe(true);
  });
  it("con rótulo en minúscula (garantía) también la encuentra", () => {
    const g = garantiaDesdeDropi({ description: "<p>Descripci\u00f3n</p><p>garant\u00eda: 30 d\u00edas por defectos de f\u00e1brica.</p>" } as any);
    expect(g).toBeTruthy();
    expect(g).toMatch(/30 d/i);
  });
});
