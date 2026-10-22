/**
 * Arranque del worker de Meta como servicio propio.
 *
 * EasyPanel: misma imagen que la API, con el comando
 *   node dist/meta-worker.mjs   (o: tsx src/lib/meta/arranque-worker.ts)
 * y META_ROLE=worker. No abre puertos HTTP.
 */
import { pool } from "@workspace/db";
import { migrarCola } from "./cola";
import { sqlDesdePool } from "./sql-pool";
import { iniciarWorker } from "./worker";
import { crearClienteGraph } from "./graph";
import { META_API_VERSION } from "../meta-api-version";

if (!pool) {
  console.error("[meta-worker] sin base de datos (DATABASE_URL). No arranca.");
  process.exit(1);
}

const sql = sqlDesdePool(pool as unknown as Parameters<typeof sqlDesdePool>[0]);
const graph = crearClienteGraph({ version: META_API_VERSION });

// Los manejadores concretos se registran aquí a medida que se migran las
// llamadas directas a Meta. Por ahora solo existe la sonda de conectividad.
const manejadores = {
  sonda: async () => {
    /* sin efecto: verifica que la cola y el worker arrancan */
  },
};

const log = (mensaje: string, datos?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), mensaje, ...datos }));

(async () => {
  await migrarCola(sql);
  log("meta-worker listo", { version: META_API_VERSION, graphBase: typeof graph.get });
  const control = iniciarWorker({ sql, manejadores, registrar: log });

  const apagar = () => { log("apagando meta-worker"); control.detener(); };
  process.on("SIGTERM", apagar);
  process.on("SIGINT", apagar);
  await control.terminado;
  process.exit(0);
})().catch((e) => {
  console.error("[meta-worker] fallo fatal", e);
  process.exit(1);
});
