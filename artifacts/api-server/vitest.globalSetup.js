// Crea el esquema de pruebas UNA sola vez, no una por archivo.
//
// ── El problema, medido ──────────────────────────────────────────────────
//
// Un archivo con SEIS funciones puras --sin base, sin red-- tardaba 5,95 s:
//
//   Duration 10.13s (transform 1.68s, setup 190ms, collect 274ms,
//                    tests 5.95s, prepare 965ms)
//
// Esos 6 segundos son `ensureDbReady()` creando las ~30 tablas desde cero en
// el `beforeAll`. Con 81 archivos son unos 8 minutos de puro montaje, y con
// seis corriendo en paralelo la contención hacía que el hook se pasara de los
// 30 s: "Hook timed out in ensureDbReady". De ahí venían los rojos
// intermitentes -- 28 archivos en una corrida, 15 en la siguiente, y todos
// pasando al correrlos aislados.
//
// O sea: el rojo no era corrupción de datos (eso se arregló el 2026-08-29 con
// una base por archivo) ni un defecto del código. Era el costo de repetir 81
// veces un trabajo idéntico.
//
// ── La solución ──────────────────────────────────────────────────────────
//
// El esquema es el MISMO para todos los archivos. Se construye una vez acá y
// queda como plantilla; después cada archivo se lleva una copia, que es un
// `copyFileSync` de milisegundos en vez de treinta `CREATE TABLE`.
//
// Cada archivo sigue teniendo su base propia, que es lo que impide que se
// pisen entre ellos. Lo único que cambia es cómo se fabrica.
import fs from "node:fs";
import path from "node:path";

/** Dónde queda la plantilla. `vitest.setup.js` la busca acá. */
export const PLANTILLA = path.resolve(process.cwd(), "data", ".test", "_plantilla.db");

export async function setup() {
  fs.mkdirSync(path.dirname(PLANTILLA), { recursive: true });

  // Si quedó una plantilla de una corrida anterior se rehace igual: el esquema
  // cambia con las migraciones, y una plantilla vieja daría fallos raros --
  // "no such column" en vez de un error claro.
  fs.rmSync(PLANTILLA, { force: true });

  process.env.USE_SQLITE = "true";
  process.env.SQLITE_PATH = PLANTILLA;

  const { ensureDbReady } = await import("@workspace/db");
  await ensureDbReady();

  if (!fs.existsSync(PLANTILLA)) {
    // Sin plantilla no se rompe nada: cada archivo vuelve a crear su esquema
    // como antes, solo que lento. Es una optimización, no una dependencia.
    console.warn("[vitest] No se pudo crear la plantilla de base; cada archivo creará la suya.");
  }
}
