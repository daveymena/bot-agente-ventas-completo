// Setup de vitest para el api-server.
//
// ── Por qué existe esto ──────────────────────────────────────────────────
//
// `flujo-completo-venta.test.ts` fallaba de forma intermitente -- primero una
// de cada tres corridas, después dos seguidas -- y pasaba siempre al correrlo
// aislado. No era el test: era la base de pruebas.
//
// En modo SQLite (`USE_SQLITE=true`) la base es sql.js: carga el archivo
// ENTERO en memoria y al autoguardar lo REESCRIBE completo con
// `fs.writeFileSync`. Todos los workers de vitest apuntaban al mismo
// `./data/tecnovariedades.db`, así que el guardado de un worker pisaba lo que
// otro acababa de sembrar. El que perdía la carrera veía su producto
// desaparecer a mitad del test.
//
// La solución es darle a cada worker su propio archivo. `VITEST_WORKER_ID` ya
// lo distingue, y con eso los tests dejan de pisarse.
//
// ⚠️ Un fallo intermitente acá no es ruido que se pueda ignorar: esta suite es
// lo único que separa un cambio bueno de una promesa falsa saliendo a
// producción. Si vuelve a aparecer, es una carrera nueva, no "el test flaky".

import fs from "node:fs";
import path from "node:path";

const worker = process.env.VITEST_WORKER_ID || "1";

// Un worker no corre UN archivo de pruebas: corre varios, uno tras otro, en el
// mismo proceso. Por eso no alcanza con "una base por worker":
//
//   · el `if (!process.env.SQLITE_PATH)` de la primera versión hacía que solo
//     el PRIMER archivo del worker creara la ruta y borrara la base; el
//     segundo heredaba las filas que dejó el primero;
//   · y el autoguardado del primero podía escribir DESPUÉS de que el segundo
//     ya hubiera leído, pisándole los datos a mitad de camino.
//
// Con un contador que vive en `globalThis` (que sí persiste entre archivos del
// mismo worker) cada archivo se lleva su propia base. Nadie hereda ni pisa
// nada, y deja de haber una carrera que aparecía una de cada tres corridas.
globalThis.__baseDePruebas = (globalThis.__baseDePruebas || 0) + 1;

const archivo = path.resolve(
  process.cwd(),
  "data",
  ".test",
  `pruebas-w${worker}-${globalThis.__baseDePruebas}.db`,
);

// Y se borra antes de empezar: una base de pruebas que recuerda la corrida
// pasada no es una base de pruebas.
try {
  fs.rmSync(archivo, { force: true });
} catch {}

process.env.SQLITE_PATH = archivo;
