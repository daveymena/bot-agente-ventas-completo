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
import { randomUUID } from "node:crypto";

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
// ⚠️ El intento anterior fue un contador en `globalThis`, con el razonamiento
// de que "globalThis persiste entre archivos del mismo worker". NO persiste:
// vitest aísla los módulos Y los globales por archivo de prueba, así que el
// contador arrancaba en 1 SIEMPRE.
//
// El resultado, medido el 2026-08-29 mirando qué archivos se creaban de verdad:
//
//   31 bases para 65 archivos de prueba, y TODAS terminadas en "-1"
//
// O sea que la mitad de los archivos compartía base con otro, que es
// exactamente lo que este setup existe para impedir. Como cada archivo además
// borra su base al arrancar, uno que empieza le borraba la base a otro que
// estaba corriendo -- y el autoguardado del que terminaba le pisaba las filas
// al que recién empezaba. El síntoma: "el producto desaparece a mitad del
// test", una de cada diez o doce corridas.
//
// Un identificador único generado acá no depende de que nada persista: este
// archivo corre UNA vez por archivo de pruebas, así que un uuid por ejecución
// es único por definición.
const idUnico = randomUUID().slice(0, 8);

const archivo = path.resolve(
  process.cwd(),
  "data",
  ".test",
  `pruebas-w${worker}-${idUnico}.db`,
);

// Con el nombre ya único, borrar "la propia" es innecesario (no existe). Lo
// que sí hace falta es no dejar que `data/.test` crezca sin límite: se limpia
// lo que quedó de corridas anteriores, definido como más viejo que esta misma
// corrida. Se hace best-effort y con guarda de tiempo para que dos workers
// arrancando a la vez no se borren archivos entre ellos.
try {
  const dir = path.dirname(archivo);
  fs.mkdirSync(dir, { recursive: true });
  const haceUnaHora = Date.now() - 60 * 60 * 1000;
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith("pruebas-w")) continue;
    const p = path.join(dir, f);
    try {
      if (fs.statSync(p).mtimeMs < haceUnaHora) fs.rmSync(p, { force: true });
    } catch {}
  }
} catch {}

process.env.SQLITE_PATH = archivo;
