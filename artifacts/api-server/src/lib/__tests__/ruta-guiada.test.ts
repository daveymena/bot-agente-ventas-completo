/**
 * La ruta guiada: Atlas lleva la conversación y el servidor hace los pasos.
 * Acá se prueba lo que no necesita base ni modelo: cuándo arranca, cómo lee
 * lo que el modelo declara, y que el marcador nunca llega al admin.
 */
import { describe, it, expect } from "vitest";
import { detectarInicioDeRuta, pideSalirDeRuta, avanceQueDeclara } from "../ruta-guiada";

describe("cuándo arranca la ruta", () => {
  it("con las metas del saludo y con formas naturales", () => {
    for (const t of [
      "Quiero vender un producto nuevo",
      "No sé por dónde empezar",
      "Ayúdame a vender más de un producto que ya tengo",
      "quiero empezar a vender",
      "voy a lanzar un producto",
    ]) expect(detectarInicioDeRuta(t), t).toBe("producto-nuevo");
  });

  it("no arranca con pedidos normales", () => {
    for (const t of ["cuántos leads tengo", "creá el anuncio del curso", "cambiá el precio del bolso", "sí"]) {
      expect(detectarInicioDeRuta(t), t).toBeNull();
    }
  });

  it("se puede salir con lenguaje normal", () => {
    expect(pideSalirDeRuta("dejemos esto por ahora")).toBe(true);
    expect(pideSalirDeRuta("olvidalo")).toBe(true);
    expect(pideSalirDeRuta("sí, dale")).toBe(false);
  });
});

describe("lo que el modelo declara", () => {
  it("lee productoId/producto/angulo y quita el marcador del texto", () => {
    const r = avanceQueDeclara("Te recomiendo el corrector de postura.\n\n¿Arrancamos con ese?\n[[ruta: productoId=168; producto=Corrector de postura; angulo=Sin dolor = más ventas]]");
    expect(r.campos).toEqual({ productoid: "168", producto: "Corrector de postura", angulo: "Sin dolor = más ventas" });
    expect(r.fin).toBe(false);
    expect(r.textoLimpio).toBe("Te recomiendo el corrector de postura.\n\n¿Arrancamos con ese?");
  });

  it("entiende el cierre de la ruta", () => {
    const r = avanceQueDeclara("Listo. ¿Querés que te avise en 3 días?\n\n[[ruta: fin]]");
    expect(r.fin).toBe(true);
    expect(r.textoLimpio).not.toContain("[[");
  });

  it("sin marcador no toca nada", () => {
    const t = "Texto normal con [corchetes] simples.";
    expect(avanceQueDeclara(t)).toEqual({ campos: {}, fin: false, textoLimpio: t });
  });
});
