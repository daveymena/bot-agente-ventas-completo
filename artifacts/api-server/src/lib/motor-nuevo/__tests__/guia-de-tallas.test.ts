import { describe, test, expect } from "vitest";
import { lineasDeTallas, esAjustable, medidasDelTexto, mensajeDeTallas } from "../guia-de-tallas";
import { estadoInicial } from "../estado-conversacion";
import { ejecutores, type ContextoHerramientas } from "../herramientas";
import { guionDelNegocio } from "../nicho";

// El dueño (08-10): "a veces por talla o cosas así el bot se pega". Fichas con
// la forma de las de Dropi: la tabla viene en la descripción, en HTML o viñetas.
const FICHA_CON_TABLA =
  "<p>Corrector de postura en neopreno.</p><ul><li>Talla S: contorno de pecho 65-80 cm</li>" +
  "<li>Talla M: contorno de pecho 80-95 cm</li><li>Talla L: contorno de pecho 95-110 cm</li>" +
  "<li>Talla XL: contorno de pecho 110-125 cm</li></ul><p>Color negro.</p>";

describe("guía de tallas con datos reales", () => {
  test("encuentra la tabla en la descripción HTML y descarta lo que no es talla", () => {
    const l = lineasDeTallas([FICHA_CON_TABLA]);
    expect(l).toHaveLength(4);
    expect(l[1]).toContain("Talla M");
    expect(l.join(" ")).not.toContain("Color negro");
  });

  test("lee las medidas como las escribe un cliente", () => {
    expect(medidasDelTexto("peso 70 kg y mido 1.72, qué talla me sirve?")).toEqual({ pesoKg: 70, alturaCm: 172 });
    expect(medidasDelTexto("tengo 92 cm de pecho")).toMatchObject({ contornoCm: 92 });
  });

  test("con tabla y medida: le pide recomendar UNA talla con la tabla", () => {
    const r = mensajeDeTallas({ nombre: "Corrector", opciones: ["S", "M", "L", "XL"], lineas: lineasDeTallas([FICHA_CON_TABLA]), ajustable: false, medidas: { contornoCm: 92 } });
    expect(r.mensaje).toContain("Talla M: contorno de pecho 80-95 cm");
    expect(r.mensaje).toMatch(/recomiéndale UNA talla/);
  });

  test("sin tabla pero ajustable: lo dice con seguridad (no 'lo confirmo')", () => {
    const fuentes = ["Corrector de postura con velcro, totalmente ajustable"];
    const r = mensajeDeTallas({ nombre: "Corrector", opciones: [], lineas: lineasDeTallas(fuentes), ajustable: esAjustable(fuentes), medidas: {} });
    expect(r.mensaje).toMatch(/AJUSTABLE/);
  });

  test("sin tabla ni ajustable: no inventa rangos y pregunta al dueño", () => {
    const r = mensajeDeTallas({ nombre: "Faja", opciones: ["S", "M", "L"], lineas: [], ajustable: false, medidas: { pesoKg: 70 } });
    expect(r.mensaje).toMatch(/No inventes rangos/);
    expect(r.mensaje).toMatch(/preguntar_al_dueno/);
    expect(r.mensaje).toContain("S, M, L");
  });

  test("la herramienta usa el producto en foco y el mensaje del cliente", async () => {
    const ctx: ContextoHerramientas = {
      estado: { ...estadoInicial(1), productoEnFoco: 7 } as any,
      catalogo: [{ id: 7, name: "Corrector ZXF", description: FICHA_CON_TABLA, price: 55000, currency: "COP", kind: "physical", opciones: ["S", "M", "L", "XL"] }],
      partes: [], conocimiento: [],
      guion: guionDelNegocio({ catalogo: [], negocio: { nombre: "T" }, medios: [] }),
      mensajeDelCliente: "tengo 100 cm de pecho, qué talla?", efectos: [],
    } as any;
    const r = await ejecutores.guia_de_tallas(ctx, {});
    expect(r.ok).toBe(true);
    expect(r.mensaje).toContain("Talla L: contorno de pecho 95-110 cm");
    expect(r.mensaje).toMatch(/contorno 100 cm/);
  });
});
