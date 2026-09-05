import { describe, it, expect } from "vitest";
import { variantesDeTelefono,
  agregarProductoVisto, agregarObjecion, guardarUbicacion,
  diasDesdeLaUltimaVez, tieneAlgoQueRecordar, PERFIL_VACIO,
  vioLaFichaHacePoco,
} from "../customer-profile";

/**
 * Medido en producción el 2026-08-23, conversación 1: el mismo cliente pidió
 * el curso de piano el 16, el 17, y el 23 a las 02:34, 02:46 y 03:22. Recibió
 * la ficha las cinco veces como si fuera la primera, porque `sentProductIds`
 * vive en la conversación y en un chat nuevo arranca vacío.
 */

const T1 = "2026-08-16T21:47:00.000Z";
const T2 = "2026-08-23T03:22:00.000Z";

describe("productos que ya vio, aunque haya sido en otra conversación", () => {
  it("recuerda la ficha enviada", () => {
    const p = agregarProductoVisto(PERFIL_VACIO, { id: 123, nombre: "Curso de Piano" }, T1);
    expect(p.productosVistos).toEqual([{ id: 123, nombre: "Curso de Piano", fecha: T1 }]);
  });

  it("no duplica el mismo producto: refresca la fecha", () => {
    let p = agregarProductoVisto(PERFIL_VACIO, { id: 123, nombre: "Curso de Piano" }, T1);
    p = agregarProductoVisto(p, { id: 123, nombre: "Curso de Piano" }, T2);
    expect(p.productosVistos).toHaveLength(1);
    expect(p.productosVistos![0]!.fecha).toBe(T2);
  });

  it("el más reciente queda primero", () => {
    let p = agregarProductoVisto(PERFIL_VACIO, { id: 1, nombre: "Piano" }, T1);
    p = agregarProductoVisto(p, { id: 2, nombre: "Perros" }, T2);
    expect(p.productosVistos!.map((x) => x.id)).toEqual([2, 1]);
  });

  it("no crece para siempre: el prompt ya se recorta por tamaño", () => {
    let p = PERFIL_VACIO;
    for (let i = 1; i <= 20; i++) p = agregarProductoVisto(p, { id: i, nombre: `P${i}` }, T1);
    expect(p.productosVistos!.length).toBeLessThanOrEqual(8);
    expect(p.productosVistos![0]!.id).toBe(20);
  });
});

describe("objeciones que ya puso", () => {
  it("las guarda", () => {
    expect(agregarObjecion(PERFIL_VACIO, "price", T1).objeciones)
      .toEqual([{ tipo: "price", fecha: T1 }]);
  });

  it('ignora "none": no es una objeción', () => {
    expect(agregarObjecion(PERFIL_VACIO, "none", T1).objeciones).toBeUndefined();
    expect(agregarObjecion(PERFIL_VACIO, "", T1).objeciones).toBeUndefined();
  });

  /** Decir DOS veces que está caro es información distinta a decirlo una vez. */
  it("no deduplica por tipo, a propósito", () => {
    let p = agregarObjecion(PERFIL_VACIO, "price", T1);
    p = agregarObjecion(p, "price", T2);
    expect(p.objeciones).toHaveLength(2);
  });
});

describe("ubicación para el envío", () => {
  it("guarda ciudad y departamento", () => {
    const p = guardarUbicacion(PERFIL_VACIO, { ciudad: "Medellín", departamento: "Antioquia" });
    expect(p.ciudad).toBe("Medellín");
    expect(p.departamento).toBe("Antioquia");
  });

  it("nunca pisa un dato bueno con uno vacío", () => {
    const previo = { ciudad: "Medellín", departamento: "Antioquia" };
    const p = guardarUbicacion(previo, { ciudad: "", departamento: "   " });
    expect(p.ciudad).toBe("Medellín");
    expect(p.departamento).toBe("Antioquia");
  });
});

describe("cuánto hace que no escribe", () => {
  const ahora = new Date("2026-08-23T12:00:00.000Z");

  it("cuenta los días", () => {
    expect(diasDesdeLaUltimaVez({ ultimaInteraccion: "2026-08-16T12:00:00.000Z" }, ahora)).toBe(7);
  });

  it("es null si nunca escribió o el dato está roto", () => {
    expect(diasDesdeLaUltimaVez(PERFIL_VACIO, ahora)).toBeNull();
    expect(diasDesdeLaUltimaVez({ ultimaInteraccion: "no es fecha" }, ahora)).toBeNull();
  });
});

describe("solo se le cuenta al agente si hay algo real que decir", () => {
  it("un perfil vacío no aporta nada al turno", () => {
    expect(tieneAlgoQueRecordar(PERFIL_VACIO)).toBe(false);
    expect(tieneAlgoQueRecordar(null)).toBe(false);
    // Solo la marca de tiempo tampoco sirve: no hay nada que contarle.
    expect(tieneAlgoQueRecordar({ ultimaInteraccion: T1, actualizado: T1 })).toBe(false);
  });

  it("con un producto visto, sí", () => {
    expect(tieneAlgoQueRecordar(agregarProductoVisto(PERFIL_VACIO, { id: 1, nombre: "X" }, T1))).toBe(true);
  });

  it("con una objeción, sí", () => {
    expect(tieneAlgoQueRecordar(agregarObjecion(PERFIL_VACIO, "price", T1))).toBe(true);
  });
});

/**
 * El mismo cliente, dos conversaciones, media memoria en cada una.
 *
 * `conversations` se busca por `contactPhone` en cuatro lugares y cada uno
 * traía el número como le llegaba: Baileys lo entrega en dígitos
 * (573042748687), pero por la API y por el panel entra como lo escribió una
 * persona (+57 304 274 8687). Como la comparación era exacta, el mismo cliente
 * terminaba con DOS filas.
 *
 * Visto desde afuera es esto: el cliente vuelve a escribir y el bot arranca de
 * cero, sin acordarse de nada. No perdió la memoria — está leyendo la otra fila.
 */
describe("el mismo teléfono escrito de varias formas es el mismo cliente", () => {
  it("compara las dos formas, no una", () => {
    const v = variantesDeTelefono("+57 304 274 8687");
    expect(v).toContain("573042748687");
    expect(v).toContain("+57 304 274 8687");
  });

  it("un número ya limpio no genera una variante de más", () => {
    expect(variantesDeTelefono("573042748687")).toEqual(["573042748687"]);
  });

  it("se buscan las dos porque en la base YA hay filas de las dos formas", () => {
    // Normalizar solo al escribir arregla lo que viene y deja huérfano lo que
    // ya está guardado: justo las conversaciones con historial.
    expect(variantesDeTelefono("+573042748687")).toHaveLength(2);
  });

  it("un identificador que no es un teléfono sobrevive igual", () => {
    // La ruta de diagnóstico usa "test-ia" como contacto. Normalizar a dígitos
    // lo dejaría vacío y buscaría por cadena vacía.
    expect(variantesDeTelefono("test-ia")).toEqual(["test-ia"]);
    expect(variantesDeTelefono("")).toEqual([]);
    expect(variantesDeTelefono(null)).toEqual([]);
  });
});

/**
 * ============================================================
 * LA FICHA QUE VOLVIA A SALIR EN CADA CHAT NUEVO
 * ============================================================
 *
 * El caso de la cabecera de este archivo: el mismo cliente pidio el curso de
 * piano el 16, el 17 y tres veces el 23, y recibio cinco fichas identicas.
 */
describe("vioLaFichaHacePoco", () => {
  const hoy = new Date("2026-09-05T12:00:00.000Z");
  const perfilCon = (id: number, fecha: string) => ({
    productosVistos: [{ id, nombre: "Curso de Piano", fecha }],
  });

  it("la vio ayer: no se la repite", () => {
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-09-04T12:00:00.000Z"), 7, hoy)).toBe(true);
  });

  it("la vio hace un mes: se la vuelve a presentar", () => {
    // A esa altura no es repetir, es retomar. Es lo correcto.
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-08-05T12:00:00.000Z"), 7, hoy)).toBe(false);
  });

  it("justo en el limite de los 7 dias todavia cuenta", () => {
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-08-29T12:00:00.000Z"), 7, hoy)).toBe(true);
  });

  it("otro producto no cuenta", () => {
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-09-04T12:00:00.000Z"), 99, hoy)).toBe(false);
  });

  it("nada rompe cuando no hay datos", () => {
    expect(vioLaFichaHacePoco(null, 7, hoy)).toBe(false);
    expect(vioLaFichaHacePoco({}, 7, hoy)).toBe(false);
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-09-04T12:00:00.000Z"), null, hoy)).toBe(false);
  });

  it("una fecha ilegible NO deja al cliente sin la ficha", () => {
    // Ante la duda, se manda: quedarse sin informacion es peor que repetirla.
    expect(vioLaFichaHacePoco(perfilCon(7, "no-es-fecha"), 7, hoy)).toBe(false);
    expect(vioLaFichaHacePoco({ productosVistos: [{ id: 7, nombre: "x", fecha: "" }] } as any, 7, hoy)).toBe(false);
  });

  it("una fecha futura (relojes desfasados) cuenta como reciente", () => {
    expect(vioLaFichaHacePoco(perfilCon(7, "2026-09-06T12:00:00.000Z"), 7, hoy)).toBe(true);
  });
});
