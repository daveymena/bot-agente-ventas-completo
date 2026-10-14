/**
 * VentasPro Stock — servidor.
 *
 *   pnpm --filter @workspace/stock dev      → API (3010) + Vite (5180)
 *   pnpm --filter @workspace/stock build    → dist/public (web) + dist/server (API)
 *   pnpm --filter @workspace/stock start    → sirve todo en STOCK_PORT
 */
import { config } from "./config";
import { initDb } from "./db/client";
import { createApp } from "./app";
import { ensureBaseData, seedDemoIfEmpty } from "./db/seed";

async function main() {
  await initDb();
  await ensureBaseData();
  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`\n  ${config.brand.name} · API en http://${config.host}:${config.port}  (${config.isProd ? "producción" : "desarrollo"})`);
    console.log(`  datos: ${config.dataDir}\n`);
    if (config.seedDemo) {
      // El catálogo de demostración se genera en segundo plano la primera vez (vídeos con ffmpeg pueden tardar ~1 min).
      seedDemoIfEmpty().then((did) => { if (did) console.log("[seed] catálogo de demostración listo"); }).catch((e) => console.error("[seed] error generando la demo:", e));
    }
  });
}

main().catch((e) => {
  console.error("[stock] no se pudo arrancar:", e);
  process.exit(1);
});
