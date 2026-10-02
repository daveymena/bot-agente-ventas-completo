/**
 * GIFS DEL PRODUCTO — pruebas de los argumentos de ffmpeg
 * ======================================================
 *
 * El CI no tiene ffmpeg ni archivos de video, así que lo que se prueba es la
 * DECISIÓN: qué se le pide a ffmpeg. Un argumento mal armado no se ve hasta
 * que sale un clip deformado o vacío en producción, y eso se descubre tarde.
 */

import { describe, test, expect } from "vitest";
import {
  filtroCuadrado,
  tramosDe,
  argsWebpDesdeVideo,
  argsWebpDesdeFoto,
  leerMetadata,
  elegirFuentes,
  LADO_POR_DEFECTO,
  DURACION_CLIP,
} from "../gifs-de-producto";

const OPC = { inicio: 2, duracion: 3, lado: 600, fps: 15, calidad: 80 };

describe("filtroCuadrado", () => {
  test("cubre y recorta: nunca deforma la foto", () => {
    const f = filtroCuadrado(600);
    expect(f).toContain("scale=600:600");
    // Sin esto, una foto apaisada sale aplastada (el error clásico).
    expect(f).toContain("force_original_aspect_ratio=increase");
    expect(f).toContain("crop=600:600");
  });
});

describe("tramosDe", () => {
  test("reparte los tramos dentro de lo útil, sin pisar el arranque ni el final", () => {
    const arranques = tramosDe(20, 3, 3);
    expect(arranques.length).toBe(3);
    // Ni el primer medio segundo (suele estar negro) ni el final (el logo).
    expect(arranques.every((a) => a >= 1.5)).toBe(true);
    expect(arranques.every((a) => a + 3 <= 20 - 1.5)).toBe(true);
    // Y en orden creciente.
    expect([...arranques].sort((x, y) => x - y)).toEqual(arranques);
  });

  test("un video más corto que un tramo devuelve un solo arranque en 0", () => {
    expect(tramosDe(2, 3, DURACION_CLIP)).toEqual([0]);
  });

  test("un video apenas más largo que un tramo devuelve uno solo, con margen", () => {
    const r = tramosDe(5, 3, 3);
    expect(r.length).toBe(1);
    expect(r[0]).toBeGreaterThan(0);
    expect(r[0] + 3).toBeLessThanOrEqual(5);
  });
});

describe("argsWebpDesdeVideo", () => {
  test("recorta el tramo antes de leer y sale WebP animado cuadrado", () => {
    const args = argsWebpDesdeVideo("/tmp/in.mp4", "/tmp/out.webp", OPC);
    const linea = args.join(" ");

    // El seek va ANTES de -i (rápido): si fuera después, decodifica todo.
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"));
    expect(linea).toContain("-t 3");
    expect(linea).toContain("force_original_aspect_ratio=increase");
    expect(linea).toContain("-c:v libwebp");
    // -loop 0 = animado infinito. Sin esto queda un cuadro fijo.
    expect(linea).toContain("-loop 0");
    // Sin audio: un GIF/WebP no lleva pista de sonido.
    expect(linea).toContain("-an");
    expect(args[args.length - 1]).toBe("/tmp/out.webp");
  });
});

describe("argsWebpDesdeFoto", () => {
  test("anima la foto quieta con zoom y sale al lado pedido", () => {
    const args = argsWebpDesdeFoto("/tmp/foto.jpg", "/tmp/out.webp", OPC);
    const linea = args.join(" ");

    // -loop 1: la imagen se repite para poder animarla.
    expect(linea).toContain("-loop 1");
    expect(linea).toContain("zoompan=");
    expect(linea).toContain("s=600x600");
    expect(linea).toContain("-c:v libwebp");
    expect(args[args.length - 1]).toBe("/tmp/out.webp");
  });

  test("el zoom nunca pasa del tope (marea si se acerca demasiado)", () => {
    const linea = argsWebpDesdeFoto("/tmp/foto.jpg", "/tmp/out.webp", OPC).join(" ");
    const tope = Number(/min\(zoom\+[\d.]+,([\d.]+)\)/.exec(linea)?.[1]);
    expect(tope).toBeGreaterThan(1);
    expect(tope).toBeLessThanOrEqual(1.2);
  });
});

describe("valores por defecto", () => {
  test("el cuadrado es 600 y el tramo de 3 s, como pide el plan", () => {
    expect(LADO_POR_DEFECTO).toBe(600);
    expect(DURACION_CLIP).toBe(3);
  });
});

describe("leerMetadata", () => {
  test("acepta el objeto (Postgres/jsonb) y el texto (SQLite)", () => {
    expect(leerMetadata({ videoAnuncio: { archivo: "/x.mp4" } })).toEqual({ videoAnuncio: { archivo: "/x.mp4" } });
    expect(leerMetadata('{"videoAnuncio":{"archivo":"/x.mp4"}}')).toEqual({ videoAnuncio: { archivo: "/x.mp4" } });
  });

  test("con basura no tira: devuelve vacío", () => {
    expect(leerMetadata(null)).toEqual({});
    expect(leerMetadata("no es json")).toEqual({});
    expect(leerMetadata(42)).toEqual({});
  });
});

describe("elegirFuentes", () => {
  test("con video, usa el video y NO mezcla fotos", () => {
    const f = elegirFuentes({ videoAnuncio: { archivo: "/tmp/v.mp4" } }, ["https://x/a.jpg", "https://x/b.jpg"]);
    expect(f.video).toBe("/tmp/v.mp4");
    // Mezclar dos orígenes daría una página con dos estéticas distintas.
    expect(f.fotos).toEqual([]);
  });

  test("sin video, anima hasta 4 fotos", () => {
    const fotos = ["a.jpg", "b.jpg", "c.jpg", "d.jpg", "e.jpg"];
    const f = elegirFuentes({}, fotos);
    expect(f.video).toBeNull();
    expect(f.fotos).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  test("sin ningún activo devuelve vacío (no inventa una fuente)", () => {
    expect(elegirFuentes({}, [])).toEqual({ video: null, fotos: [] });
    // Un archivo vacío o con espacios no es un video.
    expect(elegirFuentes({ videoAnuncio: { archivo: "   " } }, []).video).toBeNull();
  });
});
