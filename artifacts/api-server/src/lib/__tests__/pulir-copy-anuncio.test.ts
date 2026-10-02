import { describe, it, expect } from "vitest";
import { pulirCopyDeAnuncio } from "../anuncio-por-modelo";

describe("pulirCopyDeAnuncio", () => {
  const real = {
    primaryText: "🪑 ¿Cuántas horas al día pasás con los hombros hacia adelante?\n\n💰 $45.000 COP, pago único. Pagás contraentrega cuando lo recibís en tu casa.\n\n👇 Completá tus datos acá",
    headline: "Hombros atrás, espalda alineada",
    description: "Pago único $45.000 · Pagás al recibir en tu casa",
  };
  it("físico en Colombia: tutea y quita 'pago único'", () => {
    const r = pulirCopyDeAnuncio(real, { esFisico: true, pais: "CO" });
    expect(r.primaryText).not.toMatch(/pasás|Pagás|recibís|Completá|pago único/i);
    expect(r.primaryText).toMatch(/\$45\.000 COP/);
    expect(r.description).toMatch(/^\$45\.000/);
    expect(r.description).not.toMatch(/pago único|Pagás/i);
  });
  it("digital conserva 'pago único'", () => {
    const r = pulirCopyDeAnuncio({ ...real, description: "Pago único $60.000 · Acceso de por vida" }, { esFisico: false, pais: "CO" });
    expect(r.description).toMatch(/Pago único/);
  });
});
