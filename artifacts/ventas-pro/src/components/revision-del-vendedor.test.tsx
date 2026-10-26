import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Revision } from "./revision-del-vendedor";

const comunes = { alertas: [], ocupado: null, i: 0, alCorregir: () => {}, alConfigurarEnvio: () => {} };
describe("resultado honesto de la revisión", () => {
  it("un fallo de revisión no aparece como una respuesta validada", () => {
    const html = renderToStaticMarkup(<Revision {...comunes} estado="no_disponible" />);
    expect(html).toContain("Revisión automática no disponible");
    expect(html).not.toContain("Sin alertas");
  });
  it("un servidor anterior sin estado no se interpreta como revisión completa", () => {
    expect(renderToStaticMarkup(<Revision {...comunes} />)).toContain("no disponible");
  });
  it("limita el resultado a las comprobaciones realizadas", () => {
    const html = renderToStaticMarkup(<Revision {...comunes} estado="completada" />);
    expect(html).toContain("Sin alertas en las comprobaciones automáticas");
    expect(html).not.toContain("no promete nada fuera de la ficha");
  });
});
