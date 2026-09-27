import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { puntuarCoincidencias, type Producto } from "../herramientas";

const raw = JSON.parse(readFileSync(resolve(process.cwd(), "../../products-full.json"), "utf8"));
const catalogo: Producto[] = raw.map((p: any) => ({
  id: Number(p.id),
  name: String(p.name),
  description: p.description || null,
  price: Number(p.price) || null,
  currency: p.currency || "COP",
  kind: p.kind || "digital",
  categoria: p.category || null,
  opciones: Array.isArray(p.features) ? p.features : [],
  disponible: true,
}));

function sinAcentos(t: string) {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Un typo humano reproducible: quita una letra interior de la palabra más distintiva. */
function conTypo(nombre: string): string | null {
  const palabras = sinAcentos(nombre.toLowerCase()).match(/[a-zñ0-9]+/g) || [];
  const palabra = [...palabras].filter((p) => p.length >= 7).sort((a, b) => b.length - a.length)[0];
  if (!palabra) return null;
  const i = Math.floor(palabra.length / 2);
  return sinAcentos(nombre.toLowerCase()).replace(palabra, palabra.slice(0, i) + palabra.slice(i + 1));
}

describe(`búsqueda sobre todo el catálogo local (${catalogo.length} productos)`, () => {
  for (const producto of catalogo) {
    it(`encuentra por nombre exacto #${producto.id} ${producto.name}`, () => {
      const resultados = puntuarCoincidencias(producto.name, catalogo, 5);
      expect(resultados[0]?.p.id, `Resultados: ${resultados.map((r) => r.p.name).join(" | ")}`).toBe(producto.id);
    });

    const typo = conTypo(producto.name);
    if (typo) {
      it(`tolera un error escrito en #${producto.id}: ${typo}`, () => {
        const resultados = puntuarCoincidencias(typo, catalogo, 5);
        expect(resultados.some((r) => r.p.id === producto.id), `Resultados: ${resultados.map((r) => r.p.name).join(" | ")}`).toBe(true);
      });
    }
  }
});
