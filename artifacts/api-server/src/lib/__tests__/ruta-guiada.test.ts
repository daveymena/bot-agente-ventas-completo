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

import { detectarNivel, productoNombrado, sinMecanicaInterna, METAS_DE_INICIO } from "../ruta-guiada";

/**
 * Lo que falló en la sesión del dueño del 14-09-2026, turno por turno:
 * cuatro "¿Arrancamos con ese?" en el paso 1, la cocina de Atlas contada al
 * admin, y el mismo trato para principiante y experto.
 */
const CATALOGO = [
  { id: 172, name: "FAJA HOT TRIMMER" },
  { id: 175, name: "Faja Miss Belt Cintura Delgada" },
  { id: 168, name: "Corrector De Postura Espalda Unisex" },
  { id: 160, name: "Afilador De Cuchillos Tijera Acero Mango" },
  { id: 123, name: "Curso de Piano Completo: De Cero a Nivel Avanzado" },
];

describe("nombrar el producto es elegirlo", () => {
  it("'FAJA HOT TRIMMER' tal cual lo escribió el dueño", () => {
    expect(productoNombrado("FAJA HOT TRIMMER", CATALOGO)?.id).toBe(172);
    expect(productoNombrado("dale con la hot trimmer", CATALOGO)?.id).toBe(172);
  });

  it("'faja' sola no elige entre dos fajas", () => {
    expect(productoNombrado("quiero vender una faja", CATALOGO)).toBeNull();
  });

  it("'yo te digo cuál' / 'quiero hacerlo con otro producto' no nombran nada", () => {
    expect(productoNombrado("Yo te digo cual", CATALOGO)).toBeNull();
    expect(productoNombrado("Quiero hacerlo con otro producto", CATALOGO)).toBeNull();
    expect(productoNombrado("Q propones", CATALOGO)).toBeNull();
  });

  it("nombres largos con la mitad de las palabras propias", () => {
    expect(productoNombrado("el corrector de postura", CATALOGO)?.id).toBe(168);
    expect(productoNombrado("el afilador de cuchillos", CATALOGO)?.id).toBe(160);
    expect(productoNombrado("el curso de piano", CATALOGO)?.id).toBe(123);
  });
});

describe("principiante o experto", () => {
  it("lo dice con todas las letras", () => {
    expect(detectarNivel("Ya sé pautar, quiero vender un producto nuevo: solo ejecutá")).toBe("experto");
    expect(detectarNivel("soy nuevo en esto, nunca he pautado")).toBe("principiante");
    expect(detectarNivel("No sé por dónde empezar")).toBeNull();
  });

  it("o habla como quien ya pautó", () => {
    expect(detectarNivel("dejá el CPM y subí el presupuesto diario a 30k")).toBe("experto");
    expect(detectarNivel("hacé un conjunto de anuncios con lookalike")).toBe("experto");
  });

  it("si dice que no sabe, gana eso aunque use una palabra técnica", () => {
    expect(detectarNivel("no sé nada de esto, qué es el copy?")).toBe("principiante");
  });

  it("la pantalla de inicio ofrece el atajo del experto", () => {
    expect(METAS_DE_INICIO.some((m) => m.id === "experto" && detectarNivel(m.mensaje) === "experto")).toBe(true);
  });
});

describe("la cocina de Atlas no le llega al admin", () => {
  it("quita los párrafos que hablan de herramientas, sesiones y tiempo", () => {
    const texto = [
      "Los que pelean por cintura delgada hoy: 3 anuncios activos de Anturio.",
      "🖼️ Con las imágenes no te puedo ayudar todavía: la búsqueda me pidió iniciar sesión. No te las describo de memoria ni te las invento.",
      "A $45.000 la Hot Trimmer entra más barata que la competencia.",
      "📋 No me alcanzó el tiempo del turno para todo.",
      "¿Arrancamos con ese?",
    ].join("\n\n");
    const limpio = sinMecanicaInterna(texto);
    expect(limpio).not.toMatch(/iniciar sesión|invento|tiempo del turno/);
    expect(limpio).toMatch(/Anturio/);
    expect(limpio).toMatch(/45\.000/);
    expect(limpio).toMatch(/¿Arrancamos con ese\?$/);
  });

  it("si todo el texto era cocina, no devuelve vacío", () => {
    expect(sinMecanicaInterna("No me alcanzó el tiempo del turno.")).toBe("No me alcanzó el tiempo del turno.");
  });
});
