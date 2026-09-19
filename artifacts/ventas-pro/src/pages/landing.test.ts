import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * La portada (/) muestra escenas GENERADAS a partir de las capturas reales
 * (scripts/generar-imagenes-portada.mjs), no las capturas crudas. Esto
 * protege dos cosas que ya salieron mal: imágenes referenciadas que no
 * existen (la página quedaba con huecos) y capturas que no venden o exponen
 * datos (facebook.jpg trae IDs de píxel/página; panel.jpg muestra $0).
 */
const raiz = resolve(__dirname, "../..");
const fuente = readFileSync(resolve(raiz, "src/pages/landing.tsx"), "utf8");

describe("portada: imágenes", () => {
  const generadas = Array.from(new Set(fuente.match(/\/screens\/gen\/[a-z-]+\.webp/g) || []));

  it("usa escenas generadas, no capturas crudas", () => {
    expect(generadas.length).toBeGreaterThanOrEqual(5);
    expect(fuente).not.toMatch(/\/screens\/[a-z-]+\.jpg/);
  });

  it("cada escena referenciada existe en public/", () => {
    for (const ruta of generadas) {
      expect(existsSync(resolve(raiz, "public", ruta.slice(1))), `falta ${ruta}: correr scripts/generar-imagenes-portada.mjs`).toBe(true);
    }
  });

  it("ninguna escena se repite en la página", () => {
    const todas = fuente.match(/\/screens\/gen\/[a-z-]+\.webp/g) || [];
    expect(todas.length).toBe(generadas.length);
  });

  it("no expone la pantalla de configuración de Facebook ni el panel vacío", () => {
    const script = readFileSync(resolve(raiz, "scripts/generar-imagenes-portada.mjs"), "utf8");
    expect(script).not.toMatch(/src:\s*"facebook\.jpg"/);
    expect(script).not.toMatch(/src:\s*"panel\.jpg"/);
  });
});
