import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Ninguna expresion regular puede llevar un caracter de control invisible.
 *
 * El 2026-09-01 aparecio esto en `whatsapp.ts`, ya commiteado:
 *
 *   /torta|pastel|postre|panader|pan<0x08>|galleta|reposter/
 *
 * Donde debia ir `\b` (limite de palabra) habia un caracter de RETROCESO real.
 * La expresion compila igual y esa alternativa no casa nunca: la regla estaba
 * muerta y no habia forma de notarlo leyendo el codigo, porque el caracter no
 * se ve.
 *
 * Pasa cuando un `\b` se escribe a traves de una herramienta que interpreta el
 * escape antes de guardar. Es un error facil de cometer y imposible de ver, asi
 * que se revisa en cada corrida en vez de confiar en la vista.
 */

const RAIZ = path.resolve(__dirname, "..", "..");
const SALTAR = new Set(["node_modules", "dist", "build", ".next", "coverage", "__tests__"]);

/** Caracteres de control que nunca deberian aparecer en el fuente. */
const PROHIBIDOS: Array<{ codigo: number; nombre: string; enVezDe: string }> = [
  { codigo: 0x08, nombre: "retroceso", enVezDe: "\\b" },
  { codigo: 0x0c, nombre: "avance de pagina", enVezDe: "\\f" },
  { codigo: 0x0b, nombre: "tabulacion vertical", enVezDe: "\\v" },
  { codigo: 0x00, nombre: "nulo", enVezDe: "\\0" },
];

function archivosFuente(dir: string, acc: string[] = []): string[] {
  let entradas: fs.Dirent[];
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entradas) {
    if (SALTAR.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivosFuente(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

describe("El codigo fuente no lleva caracteres de control invisibles", () => {
  it("ningun archivo tiene un caracter de control donde deberia ir un escape", () => {
    const hallazgos: string[] = [];

    for (const archivo of archivosFuente(RAIZ)) {
      let contenido: string;
      try { contenido = fs.readFileSync(archivo, "utf8"); } catch { continue; }

      for (const { codigo, nombre, enVezDe } of PROHIBIDOS) {
        const car = String.fromCharCode(codigo);
        if (!contenido.includes(car)) continue;
        contenido.split("\n").forEach((linea, i) => {
          if (!linea.includes(car)) return;
          const visible = linea.trim().slice(0, 100).split(car).join(`<${nombre.toUpperCase()}>`);
          hallazgos.push(
            `${path.relative(RAIZ, archivo)}:${i + 1} lleva un caracter de ${nombre} ` +
            `(deberia ser "${enVezDe}"):\n      ${visible}`,
          );
        });
      }
    }

    expect(hallazgos, `\n${hallazgos.join("\n")}\n`).toEqual([]);
  });
});
