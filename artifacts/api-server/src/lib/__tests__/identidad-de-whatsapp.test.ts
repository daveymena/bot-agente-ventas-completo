/**
 * LA IDENTIDAD DEL DISPOSITIVO CON EL QUE EL BOT SE CONECTA A WHATSAPP.
 *
 * El bug original: `browser: ["VentasPro", "Chrome", "1.0.0"]` en los dos
 * caminos de conexión. "VentasPro" no es un navegador y "1.0.0" es una versión
 * de 2008 — la firma exacta que delata a un cliente no oficial.
 *
 * Estos tests existen para que nadie vuelva a poner el nombre del producto en
 * ese campo creyendo que es personalización de marca.
 */
import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fingerprintDeDispositivo,
  pareceReal,
  PERFIL_DE_DISPOSITIVO,
} from "../identidad-de-whatsapp";

describe("el fingerprint parece el de un cliente real", () => {
  test("usa una plataforma que existe", () => {
    const [plataforma] = fingerprintDeDispositivo();
    expect(["Windows", "Mac OS", "Ubuntu", "Android", "iOS"]).toContain(plataforma);
  });

  test("la versión NO es de 2008", () => {
    const [, , version] = fingerprintDeDispositivo();
    const mayor = Number(version.split(".")[0]);
    expect(mayor).toBeGreaterThanOrEqual(50);
  });

  test("pasa su propia validación", () => {
    expect(pareceReal(fingerprintDeDispositivo())).toBe(true);
  });
});

describe("lo que NO puede volver a pasar", () => {
  test("rechaza el bug original: el nombre del producto como navegador", () => {
    // Este es exactamente el valor que estaba en el código.
    expect(pareceReal(["VentasPro", "Chrome", "1.0.0"])).toBe(false);
    expect(pareceReal(["Windows", "VentasPro", "131.0.0.0"])).toBe(false);
    expect(pareceReal(["Windows", "AtlasBot", "131.0.0.0"])).toBe(false);
  });

  test("rechaza una versión de navegador irreal", () => {
    expect(pareceReal(["Windows", "Chrome", "1.0.0"])).toBe(false);
    expect(pareceReal(["Windows", "Chrome", "0.9.1"])).toBe(false);
  });

  test("rechaza una plataforma inventada", () => {
    expect(pareceReal(["Servidor", "Chrome", "131.0.0.0"])).toBe(false);
    expect(pareceReal(["Linux", "Chrome", "131.0.0.0"])).toBe(false);
  });

  test("acepta los perfiles reales de Baileys", () => {
    expect(pareceReal(["Windows", "Chrome", "10.0.22631"])).toBe(true);
    expect(pareceReal(["Mac OS", "Chrome", "14.4.1"])).toBe(true);
    expect(pareceReal(["Ubuntu", "Chrome", "22.04.4"])).toBe(true);
  });
});

describe("el fingerprint es ESTABLE", () => {
  test("dos llamadas devuelven lo mismo", () => {
    // Un fingerprint que cambia entre reconexiones es peor que uno feo:
    // WhatsApp vería al mismo número reconectándose desde dispositivos
    // distintos, que es un patrón más sospechoso.
    expect(fingerprintDeDispositivo()).toEqual(fingerprintDeDispositivo());
  });

  test("devuelve una copia, no la constante (nadie la muta por accidente)", () => {
    const a = fingerprintDeDispositivo();
    a[0] = "Hackeado";
    expect(fingerprintDeDispositivo()[0]).not.toBe("Hackeado");
    expect(PERFIL_DE_DISPOSITIVO.navegador[0]).toBe("Windows");
  });
});

describe("ningún camino de conexión vuelve a hardcodear el navegador", () => {
  const RAIZ = join(__dirname, "..", "..");
  const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

  /**
   * Quita los comentarios antes de buscar.
   *
   * Sin esto el test se dispara con su propia documentación: los archivos
   * CITAN el valor viejo en un comentario para explicar el bug, y eso es
   * justamente lo que queremos que siga ahí.
   */
  const soloCodigo = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")   // /* ... */
      .replace(/(^|\s)\/\/[^\n]*/g, "$1"); // // ...

  test("whatsappManagerByTenant.ts usa el fingerprint", () => {
    const src = leer("lib/whatsappManagerByTenant.ts");
    expect(src).toContain("fingerprintDeDispositivo()");
    expect(soloCodigo(src)).not.toMatch(/browser:\s*\[\s*"VentasPro"/);
  });

  test("whatsapp.ts usa el fingerprint", () => {
    const src = leer("lib/whatsapp.ts");
    expect(src).toContain("fingerprintDeDispositivo()");
    expect(soloCodigo(src)).not.toMatch(/browser:\s*\[\s*"VentasPro"/);
  });

  test("ningún archivo del servidor manda el nombre del producto como navegador", () => {
    for (const f of ["lib/whatsapp.ts", "lib/whatsappManagerByTenant.ts"]) {
      expect(soloCodigo(leer(f)), `${f} tiene un fingerprint falso`).not.toContain(
        'browser: ["VentasPro"',
      );
    }
  });
});
