import { describe, it, expect } from "vitest";
import {
  agregarProductoVisto, agregarObjecion, guardarUbicacion,
  diasDesdeLaUltimaVez, tieneAlgoQueRecordar, PERFIL_VACIO,
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
