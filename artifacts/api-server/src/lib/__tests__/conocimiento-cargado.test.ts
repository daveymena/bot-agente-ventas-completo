import { describe, it, expect } from "vitest";
import { normalizarTexto, disparadoresDe, coincide } from "../conocimiento-cargado";
import { responderPreguntas, type PreguntaConocida } from "../conocimiento-producto";

/**
 * El dueño de un negocio no escribe expresiones regulares.
 *
 * La tabla de respuestas verificadas vivía escrita a mano en un `.ts` con tres
 * productos adentro: para agregar el cuarto había que programar y desplegar.
 * Un cliente nuevo del SaaS quedaba sin respuestas propias y el bot le decía
 * "déjame confirmarte ese dato exacto" a algo que el dueño sabe de memoria.
 *
 * Acá se prueba que lo cargado desde Atlas coteje bien y que le GANE a lo de
 * fábrica, sin romper al negocio que no configuró nada.
 */

/** Arma una entrada como la que devuelve la base, sin tocar la base. */
function cargada(id: number, disparadores: string, respuesta: string | null): PreguntaConocida {
  const disp = disparadoresDe(disparadores);
  return {
    id: `cargado:${id}`,
    patrones: { test: (t: string) => coincide(t, disp) } as unknown as RegExp,
    respuesta,
  };
}

describe("cotejo sin expresiones regulares", () => {
  it("encuentra el disparador aunque venga con tildes y signos", () => {
    const disp = disparadoresDe("que incluye, temario, modulos");
    expect(coincide("¿Qué INCLUYE el curso?", disp)).toBe(true);
    expect(coincide("me pasás el temario?", disp)).toBe(true);
    expect(coincide("cuántos módulos son", disp)).toBe(true);
  });

  it("no coincide con algo que no tiene nada que ver", () => {
    expect(coincide("hola buenas", disparadoresDe("que incluye, temario"))).toBe(false);
  });

  it("descarta disparadores de menos de 3 letras, que coincidirían con todo", () => {
    // Si "a" fuera válido, cualquier mensaje activaría esta respuesta.
    expect(disparadoresDe("a, de, que incluye")).toEqual(["que incluye"]);
  });

  it("normaliza igual el mensaje y el disparador", () => {
    expect(normalizarTexto("¿Cuánto DURA?")).toBe("cuanto dura");
  });
});

describe("lo que carga el dueño le gana a lo de fábrica", () => {
  it("responde con lo cargado en vez de la tabla escrita a mano", () => {
    // 124 es el curso de IA, que en la tabla de fábrica ya tiene `ia_incluye`.
    const r = responderPreguntas(124, "¿qué incluye?", 2, [
      cargada(7, "que incluye, temario", "Son 60 clases nuevas, actualizadas este mes."),
    ]);
    expect(r[0].id).toBe("cargado:7");
    expect(r[0].texto).toContain("60 clases");
  });

  it("un negocio que no cargó nada sigue funcionando como antes", () => {
    const r = responderPreguntas(124, "¿qué incluye?", 2, []);
    expect(r[0].id).toBe("ia_incluye");
  });

  it("sin respuesta cargada, dice que lo confirma en vez de inventar", () => {
    const r = responderPreguntas(null, "¿emiten factura electrónica?", 2, [
      cargada(9, "factura, facturacion", null),
    ]);
    expect(r[0].sinResponder).toBe(true);
    expect(r[0].texto).toMatch(/confirmar/i);
  });

  it("sirve para un producto que la tabla de fábrica no conoce", () => {
    // Producto 999: no existe en CATALOGO. Antes no tenía ninguna respuesta
    // propia; ahora responde lo que cargó su dueño.
    const r = responderPreguntas(999, "cuanto dura el curso?", 2, [
      cargada(11, "cuanto dura, duracion, horas", "Son 12 horas de video."),
    ]);
    expect(r[0].texto).toBe("Son 12 horas de video.");
  });
});
