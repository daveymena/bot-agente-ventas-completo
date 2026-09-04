import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * ============================================================
 * ATLAS TIENE QUE ENTENDER QUE LE DIJERON QUE SÍ
 * ============================================================
 *
 * El admin lo pidió así: "que confirme, no sólo con un sí — si dice dale, sí
 * confirmado, entienda, y no sólo sí".
 *
 * Medido el 2026-09-01 sobre 41 formas reales de aprobar: el patrón anterior
 * reconocía 23. Las 18 que faltaban eran combinaciones ("dale confirmado",
 * "listo dale", "ok dale") o frases de dos palabras ("está bien", "de una",
 * "hágale", "súbelo", "ya está").
 *
 * Que no reconozca una aprobación no es un detalle: el plan pendiente se borra
 * sin ejecutar y Atlas vuelve a proponer EXACTAMENTE lo mismo. Ya pasó -- el
 * admin confirmó tres veces seguidas con una "S" sola y nunca pasó nada (ver
 * el comentario en architect-store.ts).
 *
 * Se lee el patrón DEL ARCHIVO en vez de importar el módulo porque
 * `architect-store` abre la conexión a la base al cargarse, y esta prueba no
 * necesita base para nada.
 */

function patronDeAprobacion(): RegExp {
  const ruta = path.resolve(__dirname, "..", "architect-store.ts");
  const linea = fs.readFileSync(ruta, "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("if (/^"));
  if (!linea) throw new Error("No se encontró el patrón de aprobación en architect-store.ts");
  return new Function(
    "return " + linea.trim().replace(/^if \(/, "").replace(/\.test\(t\)\) \{$/, ""),
  )() as RegExp;
}

/** La misma normalización que hace isApproval antes de probar el patrón. */
function normalizar(texto: string): string {
  return String(texto).trim().toLowerCase()
    .replace(/,/g, " ")
    .replace(/[!.¡¿?]+$/g, "")
    .trim()
    .replace(/^(entonces|bueno|pues|vale|ya)[,\s]+/i, "")
    .trim();
}

const aprueba = (t: string) => patronDeAprobacion().test(normalizar(t));

describe("Las formas en que el admin dice que sí", () => {
  const FORMAS = [
    // la palabra sola
    "si", "sí", "s", "dale", "ok", "listo", "va", "eso", "sale", "perfecto",
    "correcto", "apruebo", "aprobado", "confirmo", "confirmado", "adelante",
    "hazlo", "procede", "hágale", "publica", "publicalo", "súbelo", "subelo",
    // combinando dos
    "si confirmado", "sí, confirmado", "dale confirmado", "confirmado dale",
    "listo dale", "ok dale", "sí dale", "sí señor", "dale que sí", "dale pues",
    "dale nomas", "publícalo ya",
    // frases
    "de una", "está bien", "esta bien", "así está bien", "me gusta", "ya está",
  ];

  it("las reconoce todas", () => {
    const faltan = FORMAS.filter((f) => !aprueba(f));
    expect(faltan, `no reconoce: ${faltan.join(", ")}`).toEqual([]);
  });
});

describe("Lo que NO es una aprobación", () => {
  const NO = [
    "no", "cancela", "espera", "mejor otro", "no me gusta", "cámbialo",
    "cambia el texto",
    // Un "sí" con una condición pegada NO aprueba: el admin quiere otra cosa.
    "sí pero cambia el título",
    "sí pero antes muéstrame el presupuesto",
    // "está" con un adjetivo detrás es una opinión, no un visto bueno.
    "está caro", "está mal", "esta muy caro",
    // Preguntas y charla.
    "¿cuánto cuesta?", "hola",
  ];

  it("no confunde ninguna con un sí", () => {
    const falsos = NO.filter((f) => aprueba(f));
    expect(falsos, `las toma por aprobación: ${falsos.join(", ")}`).toEqual([]);
  });
});
