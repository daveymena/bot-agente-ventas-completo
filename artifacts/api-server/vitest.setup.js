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

if (!process.env.SQLITE_PATH) {
  const archivo = path.resolve(
    process.cwd(),
    "data",
    ".test",
    `pruebas-w${worker}.db`,
  );
  // Y se BORRA antes de empezar. Darle un archivo propio a cada worker quitó
  // el pisoteo entre workers, pero el archivo sobrevivía a la corrida: la
  // siguiente arrancaba con las filas que dejó la anterior y los conteos
  // volvían a fallar. Una base de pruebas que recuerda la corrida pasada no
  // es una base de pruebas.
  try {
    fs.rmSync(archivo, { force: true });
  } catch {}
  process.env.SQLITE_PATH = archivo;
}
