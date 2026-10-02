/**
 * REFERENCIAS DE MERCADO — pruebas del bucle multi-idioma
 * ======================================================
 *
 * El buscador y el traductor son inyectables, así que esto prueba el
 * COMPORTAMIENTO REAL sin Chromium ni red: el orden de las búsquedas, qué se
 * mezcla, qué se descarta y —lo más importante— que un fallo no se convierta
 * en una referencia inventada.
 */

import { describe, test, expect } from "vitest";
import {
  claveDeAnuncio,
  unirReferencias,
  buscarReferenciasDeMercado,
  type ReferenciaDeMercado,
  type ResultadoBusqueda,
} from "../referencias-de-mercado";

const ref = (texto: string, idioma = "es", consulta = "corrector de postura"): ReferenciaDeMercado => ({
  texto,
  pais: "CO",
  idioma,
  consulta,
});

describe("claveDeAnuncio", () => {
  test("normaliza mayúsculas, tildes y signos", () => {
    expect(claveDeAnuncio("¡¿Corrector  de POSTURA?!")).toBe("corrector de postura");
  });

  test("un texto vacío o de signos da clave vacía", () => {
    expect(claveDeAnuncio("")).toBe("");
    expect(claveDeAnuncio("   ...   ")).toBe("");
  });
});

describe("unirReferencias", () => {
  test("no repite el mismo anuncio aunque venga en dos búsquedas", () => {
    const r = unirReferencias([[ref("Corrector de postura sin dolor")], [ref("corrector de POSTURA sin dolor", "en")]]);
    expect(r.length).toBe(1);
  });

  test("ordena primero el que MÁS se repite (señal de que el mercado lo sostiene)", () => {
    const r = unirReferencias([
      [ref("Anuncio repetido"), ref("Anuncio de una sola vez")],
      [ref("anuncio repetido", "en")],
      [ref("ANUNCIO REPETIDO", "en")],
    ]);
    expect(r[0].texto).toBe("Anuncio repetido");
  });

  test("descarta los vacíos y respeta el tope", () => {
    const r = unirReferencias([[ref(""), ref("   "), ref("uno"), ref("dos")]], 1);
    expect(r.length).toBe(1);
    expect(r[0].texto).toBe("uno");
  });
});

describe("buscarReferenciasDeMercado", () => {
  test("busca el idioma del negocio y el traducido, y une los dos", async () => {
    const consultas: string[] = [];
    const buscar = async (c: string): Promise<ResultadoBusqueda> => {
      consultas.push(c);
      return { ok: true, anuncios: c === "posture corrector" ? ["Ad in English"] : ["Anuncio en español"] };
    };

    const r = await buscarReferenciasDeMercado(
      { consulta: "corrector de postura" },
      { buscar, traducir: async () => "posture corrector" },
    );

    expect(consultas).toEqual(["corrector de postura", "posture corrector"]);
    expect(r.ok).toBe(true);
    expect(r.referencias.length).toBe(2);
    expect(r.intentos.map((i) => i.idioma)).toEqual(["es", "en"]);
    expect(r.referencias[0].pais).toBe("CO");
  });

  test("si el traductor devuelve lo mismo, NO gasta la segunda búsqueda", async () => {
    const consultas: string[] = [];
    const buscar = async (c: string): Promise<ResultadoBusqueda> => {
      consultas.push(c);
      return { ok: true, anuncios: ["x"] };
    };

    await buscarReferenciasDeMercado(
      { consulta: "corrector de postura" },
      { buscar, traducir: async () => "  Correctór de Postúra " },
    );

    expect(consultas).toEqual(["corrector de postura"]);
  });

  test("si el traductor falla, se sigue con el idioma del negocio", async () => {
    const buscar = async (): Promise<ResultadoBusqueda> => ({ ok: true, anuncios: ["solo español"] });
    const r = await buscarReferenciasDeMercado(
      { consulta: "corrector" },
      { buscar, traducir: async () => { throw new Error("sin cuota"); } },
    );

    expect(r.ok).toBe(true);
    expect(r.referencias.length).toBe(1);
    expect(r.intentos.length).toBe(1);
  });

  test("una búsqueda fallida se registra y NO se convierte en referencia", async () => {
    const buscar = async (c: string): Promise<ResultadoBusqueda> =>
      c === "posture corrector"
        ? { ok: false, anuncios: [], error: "la Biblioteca pidió login" }
        : { ok: true, anuncios: ["bueno"] };

    const r = await buscarReferenciasDeMercado(
      { consulta: "corrector" },
      { buscar, traducir: async () => "posture corrector" },
    );

    expect(r.ok).toBe(true);
    expect(r.referencias.length).toBe(1);
    const fallido = r.intentos.find((i) => i.idioma === "en")!;
    expect(fallido.ok).toBe(false);
    expect(fallido.error).toMatch(/login/);
  });

  test("si TODAS fallan, ok:false y cero referencias (nada inventado)", async () => {
    const buscar = async (): Promise<ResultadoBusqueda> => ({ ok: false, anuncios: [], error: "sin respuesta" });
    const r = await buscarReferenciasDeMercado({ consulta: "corrector" }, { buscar });

    expect(r.ok).toBe(false);
    expect(r.referencias).toEqual([]);
    expect(r.error).toMatch(/inventado/);
  });

  test("sin consulta no llama a nada", async () => {
    let llamadas = 0;
    const buscar = async (): Promise<ResultadoBusqueda> => {
      llamadas++;
      return { ok: true, anuncios: [] };
    };
    const r = await buscarReferenciasDeMercado({ consulta: "  " }, { buscar });

    expect(r.ok).toBe(false);
    expect(llamadas).toBe(0);
  });

  test("sin traductor solo busca el idioma del negocio", async () => {
    const consultas: string[] = [];
    const buscar = async (c: string): Promise<ResultadoBusqueda> => {
      consultas.push(c);
      return { ok: true, anuncios: ["a"] };
    };
    await buscarReferenciasDeMercado({ consulta: "corrector" }, { buscar });

    expect(consultas).toEqual(["corrector"]);
  });

  test("un anuncio que rompe el buscador no tumba los demás", async () => {
    const buscar = async (c: string): Promise<ResultadoBusqueda> => {
      if (c === "posture corrector") throw new Error("se cayó el navegador");
      return { ok: true, anuncios: ["bueno"] };
    };
    const r = await buscarReferenciasDeMercado(
      { consulta: "corrector" },
      { buscar, traducir: async () => "posture corrector" },
    );

    expect(r.ok).toBe(true);
    expect(r.referencias.length).toBe(1);
    expect(r.intentos.find((i) => i.idioma === "en")!.error).toMatch(/navegador/);
  });
});
