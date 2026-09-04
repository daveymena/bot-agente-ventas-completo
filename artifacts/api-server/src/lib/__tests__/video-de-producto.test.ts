import { describe, it, expect } from "vitest";
import { videoDeProducto, leerMetadata, normalizarEnlaceDeVideo } from "../video-de-producto";

/**
 * El video de muestra es la carnada más fuerte del catálogo y no se estaba
 * usando. Medido contra producción el 2026-08-29: 84 productos activos, 84 con
 * imagen, **0** con video. El agente sabía mandarlo desde el 26/08 -- no había
 * por dónde cargarlo.
 *
 * Estas pruebas cubren las dos formas de romperlo que importan de verdad:
 *   1. leer el dato de un `metadata` que en la base es TEXT y en memoria objeto
 *   2. guardar un enlace que al cliente NO le abre
 */

describe("Leer el video que tiene cargado un producto", () => {
  it("lo encuentra venga el metadata como texto o como objeto", () => {
    // La columna es TEXT en el schema de Drizzle y JSONB en Postgres, así que
    // llegan las dos formas según por dónde entre la fila.
    expect(videoDeProducto('{"videoIntro":"https://x.com/v.mp4"}')).toBe("https://x.com/v.mp4");
    expect(videoDeProducto({ videoIntro: "https://x.com/v.mp4" })).toBe("https://x.com/v.mp4");
  });

  it("acepta el alias `videoUrl`, que es como quedaron las filas del panel", () => {
    expect(videoDeProducto({ videoUrl: "https://x.com/v.mp4" })).toBe("https://x.com/v.mp4");
  });

  it("un metadata roto no tumba la ficha: devuelve vacío", () => {
    // Antes cada lector hacía su propio try/catch. Uno solo que falle deja al
    // cliente sin ficha de producto por un JSON mal guardado.
    for (const malo of ["no soy json", "", null, undefined, "[1,2]", 42]) {
      expect(videoDeProducto(malo as any)).toBe("");
    }
    expect(leerMetadata("no soy json")).toEqual({});
  });

  it("sin video devuelve cadena vacía, no undefined", () => {
    // El cierre hace `if (!urlVideo)`; un undefined suelto se coló antes en
    // mensajes al cliente en otros puntos del sistema.
    expect(videoDeProducto({})).toBe("");
    expect(videoDeProducto({ videoIntro: "   " })).toBe("");
  });
});

describe("Qué enlace se le puede mandar a un cliente", () => {
  it("un archivo de Drive queda como reproductor, no como descarga", () => {
    // Este es EL caso. `uc?export=download` sirve para imágenes (así lo usa
    // set_product_image), pero con un video pesado Drive contesta la pantalla
    // de "no se pudo analizar en busca de virus". El cliente hace clic
    // esperando una clase y recibe una advertencia de seguridad.
    const r = normalizarEnlaceDeVideo("https://drive.google.com/file/d/1AbC-dEf/view?usp=sharing");
    expect(r.ok && r.url).toBe("https://drive.google.com/file/d/1AbC-dEf/view");

    const d = normalizarEnlaceDeVideo("https://drive.google.com/uc?export=download&id=1AbC-dEf");
    expect(d.ok && d.url).toBe("https://drive.google.com/file/d/1AbC-dEf/view");
  });

  it("una CARPETA de Drive se rechaza y se explica qué hacer", () => {
    // El admin tiene los cursos en carpetas y es lo primero que copia. Mandarle
    // una carpeta al cliente es mandarlo a buscar cuál de 40 archivos abrir.
    const r = normalizarEnlaceDeVideo("https://drive.google.com/drive/folders/1XyZ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/CARPETA/i);
  });

  it("YouTube, Vimeo y un mp4 directo pasan tal cual", () => {
    for (const u of [
      "https://youtu.be/abc123",
      "https://www.youtube.com/watch?v=abc123",
      "https://vimeo.com/123456",
      "https://cdn.minegocio.com/demo.mp4",
    ]) {
      const r = normalizarEnlaceDeVideo(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.url).toBe(u);
    }
  });

  it("http sin s se rechaza: WhatsApp no le arma vista previa", () => {
    const r = normalizarEnlaceDeVideo("http://minegocio.com/demo.mp4");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toMatch(/https/i);
  });

  it("lo que no es una URL se rechaza sin inventar nada", () => {
    for (const basura of ["", "   ", "el video del curso de piano", "drive.google.com/file/d/1"]) {
      expect(normalizarEnlaceDeVideo(basura).ok, basura).toBe(false);
    }
  });

  it("un host cualquiera se acepta: el admin puede tener el video donde quiera", () => {
    // Loom, Wistia, su propio servidor. No se adivina la lista de proveedores
    // buenos; lo que decide es la comprobación de alcance del tool.
    const r = normalizarEnlaceDeVideo("https://www.loom.com/share/9f8e7d");
    expect(r.ok).toBe(true);
    expect(r.ok && r.fuente).toBe("www.loom.com");
  });
});
