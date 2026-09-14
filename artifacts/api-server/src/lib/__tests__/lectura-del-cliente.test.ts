import { describe, it, expect } from "vitest";
import { normalizar, type Entendimiento } from "../entender-al-cliente";
import {
  pideEntregable,
  preguntaPorVariosProductos,
  nombraOtraCosa,
  preguntaSobreElFoco,
  nombraAlgoConcretoSegunLectura,
  productoNombradoVerificado,
  pedidosLeidos,
} from "../lectura-del-cliente";
import { seccionQueCorresponde } from "../ficha-parcial";

/**
 * El modelo lee; las listas respaldan. Estas pruebas fijan las dos mitades:
 *
 *   1. lo que el modelo devuelve entra VERIFICADO (`normalizar`): un id que
 *      no existe se cae, "nombró X" y "es sobre el foco" no pueden ser verdad
 *      a la vez, "pide algo que no hay" no vale si nombró algo que sí hay;
 *   2. con lectura confiable manda el modelo; sin ella (null, o confianza
 *      baja) decide la lista, exactamente como antes de este cambio.
 *
 * Los mensajes son los del chat real del dueño (12/13-09-2026).
 */

const CATALOGO = [
  { id: 93, name: "CURSO DE PIANO COMPLETO" },
  { id: 118, name: "EXCEL DESDE CERO" },
  { id: 101, name: "CURSO DE CONTABILIDAD" },
  { id: 124, name: "PACK PROGRAMACIÓN" },
];
const IDS = new Set(CATALOGO.map((p) => p.id));
const NOMBRES = CATALOGO.map((p) => p.name);

function lectura(extra: Partial<Entendimiento> & { intencion?: any }, foco: number | null = 93): Entendimiento {
  const r = normalizar({ intencion: "details_query", confianza: 0.9, ...extra }, IDS, foco);
  if (!r) throw new Error("lectura inválida en la prueba");
  return r;
}

describe("normalizar: la lectura del producto entra verificada", () => {
  it("varios ids reales pasan; los inventados y los repetidos no", () => {
    const r = lectura({ productosNombrados: [93, 101, 555, 93, "118"] });
    expect(r.productosNombrados).toEqual([93, 101, 118]);
  });

  it("si nombró exactamente uno, ese es el productoId aunque el campo diga otro", () => {
    const r = lectura({ productoId: 93, productosNombrados: [118] });
    expect(r.productoId).toBe(118);
  });

  it("nombró otro producto → no puede ser 'sobre el foco'", () => {
    const r = lectura({ sobreElFoco: true, productosNombrados: [118] }, 93);
    expect(r.sobreElFoco).toBe(false);
  });

  it("nombró el foco mismo → sí es sobre el foco", () => {
    const r = lectura({ sobreElFoco: true, productosNombrados: [93] }, 93);
    expect(r.sobreElFoco).toBe(true);
  });

  it("nombró algo que SÍ existe → no está pidiendo algo que no hay", () => {
    const r = lectura({ pideAlgoQueNoHay: true, productosNombrados: [118] });
    expect(r.pideAlgoQueNoHay).toBe(false);
  });

  it("los pedidos solo aceptan los valores conocidos", () => {
    const r = lectura({ pide: ["precio", "descuento", "video", "precio", 42] });
    expect(r.pide).toEqual(["precio", "video"]);
  });

  it("sin los campos nuevos (modelo viejo), todo queda apagado y nada revienta", () => {
    const r = lectura({});
    expect(r.productosNombrados).toEqual([]);
    expect(r.sobreElFoco).toBe(false);
    expect(r.pideAlgoQueNoHay).toBe(false);
    expect(r.pide).toEqual([]);
  });
});

describe("sin lectura confiable, decide la lista como siempre", () => {
  const dudoso = lectura({ productosNombrados: [93, 118], pide: ["video"], confianza: 0.3 });

  it("null y confianza baja son lo mismo: la lista", () => {
    expect(pideEntregable(null, "y en cuánto me queda?")).toBe(false);
    expect(pideEntregable(dudoso, "y en cuánto me queda?")).toBe(false);
    expect(preguntaPorVariosProductos(dudoso, "hola", NOMBRES)).toBe(false);
    expect(nombraOtraCosa(dudoso, true, 93)).toBe(true);
    expect(nombraOtraCosa(null, false, 93)).toBe(false);
    expect(preguntaSobreElFoco(dudoso, false)).toBe(false);
    expect(nombraAlgoConcretoSegunLectura(null, true)).toBe(true);
    expect(pedidosLeidos(dudoso)).toEqual([]);
  });

  it("la lista sigue reconociendo lo que ya reconocía", () => {
    expect(pideEntregable(null, "cuánto vale el curso?")).toBe(true);
    expect(preguntaPorVariosProductos(null, "piano y contabilidad juntos cuánto sería en total?", NOMBRES)).toBe(true);
  });
});

describe("con lectura confiable, el modelo cierra los huecos de la lista", () => {
  it("'y en cuánto me queda?' no está en ninguna regex de precio; el modelo lo lee", () => {
    const en = lectura({ pide: ["precio"] });
    expect(pideEntregable(en, "y en cuánto me queda?")).toBe(true);
  });

  it("y ese precio llega a la sección de la ficha", () => {
    expect(seccionQueCorresponde({ mensaje: "y en cuánto me queda?", pide: ["precio"] })).toBe("precio");
    expect(seccionQueCorresponde({ mensaje: "y cómo son las clases, se puede ver algo?", pide: ["video"] })).toBe("video");
    // Precio + cómo pagar → la sección de pago, que ya incluye el precio.
    expect(seccionQueCorresponde({ mensaje: "cuánto es y cómo te pago", pide: ["precio", "pago"] })).toBe("pago");
  });

  it("la sección respeta lo que YA se le mandó, igual que con la regex", () => {
    expect(seccionQueCorresponde({ mensaje: "quiero ver cómo son las clases", pide: ["video"], videoYaEnviado: true, fichaYaEnviada: true, yaVioContenido: true })).toBe("ninguna");
  });

  it("tres productos nombrados = pregunta por varios, diga las palabras que diga", () => {
    const en = lectura({ productosNombrados: [93, 101, 118] });
    expect(preguntaPorVariosProductos(en, "si me llevo los de música, números y hojas de cálculo?", NOMBRES)).toBe(true);
  });

  it("'¿y eso me sirve si no sé nada de programación?' con el piano en foco es sobre el piano", () => {
    // La lista ve "programacion" como palabra específica → "nombra otra cosa".
    const en = lectura({ sobreElFoco: true, productosNombrados: [] }, 93);
    expect(nombraOtraCosa(en, true, 93)).toBe(false);
    expect(preguntaSobreElFoco(en, false)).toBe(true);
  });

  it("'¿tienes curso de soldadura?' es algo que no hay, aunque la lista dude", () => {
    const en = lectura({ pideAlgoQueNoHay: true, productosNombrados: [] }, 93);
    expect(nombraOtraCosa(en, false, 93)).toBe(true);
    expect(nombraAlgoConcretoSegunLectura(en, false)).toBe(true);
  });

  it("nombrar OTRO producto del catálogo no es 'no lo tengo': es cambio de producto", () => {
    const en = lectura({ productosNombrados: [118] }, 93);
    expect(nombraOtraCosa(en, true, 93)).toBe(false);
  });

  it("'¿qué venden?' pide el catálogo, no nombra nada concreto", () => {
    const en = lectura({ pide: ["catalogo"], productosNombrados: [] }, null);
    expect(nombraAlgoConcretoSegunLectura(en, true)).toBe(false);
  });
});

describe("el producto nombrado se verifica contra el texto", () => {
  it("nombró Excel y 'excel' está en el mensaje → pasa", () => {
    const en = lectura({ productosNombrados: [118] }, 93);
    expect(productoNombradoVerificado(en, "cuánto vale el curso de Excel?", CATALOGO)?.id).toBe(118);
  });

  it("el id equivocado no pasa, porque el nombre equivocado no está en el mensaje", () => {
    // El caso medido: el modelo escribió 101 (contabilidad) para un mensaje de Excel.
    const en = lectura({ productosNombrados: [101] }, 93);
    expect(productoNombradoVerificado(en, "cuánto vale el curso de Excel?", CATALOGO)).toBe(null);
  });

  it("'curso' a secas no verifica nada: es palabra genérica del catálogo", () => {
    const en = lectura({ productosNombrados: [101] }, 93);
    expect(productoNombradoVerificado(en, "ese curso cuánto vale?", CATALOGO)).toBe(null);
  });

  it("con varios nombrados no elige uno: eso es 'pregunta por varios'", () => {
    const en = lectura({ productosNombrados: [93, 118] }, null);
    expect(productoNombradoVerificado(en, "piano y excel", CATALOGO)).toBe(null);
  });
});
