import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.js"],
    // El esquema se construye UNA vez acá y cada archivo se lleva una copia.
    // Ver el comentario del archivo: crearlo por archivo costaba 5,95 s, y con
    // 81 archivos eso saturaba y ponía la suite roja sin defecto real.
    globalSetup: ["./vitest.globalSetup.js"],
    // ── Por qué se limita la concurrencia ────────────────────────────────
    //
    // Cada archivo de pruebas levanta su propia base SQLite y corre las
    // migraciones (ver vitest.setup.js: compartirla causaba que un worker
    // pisara los datos de otro). Eso es correcto pero cuesta, y con 57
    // archivos arrancando a la vez el hook de arranque se pasaba de los 10
    // segundos por defecto -- `Hook timed out in ensureDbReady`.
    //
    // O sea que el rojo dejó de ser corrupción y pasó a ser contención. Un
    // rojo intermitente por infraestructura es igual de dañino: enseña a
    // ignorar la suite, y en esta sesión ya hubo tres defectos reales que
    // pasaron porque una prueba en verde decía lo contrario.
    hookTimeout: 30_000,
    // 60 s: con la suite completa en paralelo, la primera conexión a PGlite de
    // cada archivo superaba los 20 s. Es contención, no un defecto (ver arriba).
    testTimeout: 60_000,
    poolOptions: { threads: { maxThreads: 6, minThreads: 1 } },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
