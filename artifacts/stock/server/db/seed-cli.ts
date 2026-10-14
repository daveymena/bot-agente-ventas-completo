/**
 * CLI de datos de demostración (separada del módulo para que el bundle de
 * producción no la ejecute por accidente).
 *
 *   pnpm --filter @workspace/stock seed            → crea admin/base y, si el catálogo está vacío, la demo
 *   pnpm --filter @workspace/stock seed -- --reset → borra base de datos y medios y regenera todo
 */
import fs from "node:fs";
import { config } from "../config";
import { closeDb, initDb } from "./client";
import { ensureBaseData, runDemoSeed, seedDemoIfEmpty } from "./seed";

async function main() {
  const reset = process.argv.includes("--reset");
  if (reset) {
    console.log("[seed] borrando base de datos y medios…");
    for (const f of [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`]) fs.rmSync(f, { force: true });
    for (const d of [config.publicDir, config.originalsDir, config.tmpDir]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  }
  await initDb();
  await ensureBaseData();
  if (reset) {
    await runDemoSeed();
  } else {
    const did = await seedDemoIfEmpty();
    if (!did) console.log("[seed] el catálogo ya tiene recursos; usa --reset para regenerar la demo.");
  }
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
