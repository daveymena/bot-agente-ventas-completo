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
import { crearManejadorInsights, migrarMetricas, programarSincronizacionDiaria } from "./metricas";
import { cuentasConectadas, tokenDeNegocio } from "./conexion";
import { META_API_VERSION } from "../meta-api-version";

if (!pool) {
  console.error("[meta-worker] sin base de datos (DATABASE_URL). No arranca.");
  process.exit(1);
}

const sql = sqlDesdePool(pool as unknown as Parameters<typeof sqlDesdePool>[0]);
const graph = crearClienteGraph({ version: META_API_VERSION });

const log = (mensaje: string, datos?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), mensaje, ...datos }));

const manejadores = {
  sonda: async () => {
    /* sin efecto: verifica que la cola y el worker arrancan */
  },
  sincronizar_insights: crearManejadorInsights({ sql, graph, tokenDe: tokenDeNegocio }),
};

const INTERVALO_PROGRAMADOR_MS = 10 * 60_000;

/** Programa la sincronización del día. Idempotente: llamarlo varias veces no duplica. */
async function programarHoy(): Promise<void> {
  const fecha = new Date().toISOString().slice(0, 10);
  const cuentas = await cuentasConectadas();
  const r = await programarSincronizacionDiaria(sql, cuentas, fecha);
  if (r.encolados) log("insights programados", { fecha, ...r });
}

(async () => {
  await migrarCola(sql);
  await migrarMetricas(sql);
  log("meta-worker listo", { version: META_API_VERSION });

  await programarHoy().catch((e) => log("programador error", { mensaje: (e as Error).message }));
  const reloj = setInterval(() => {
    programarHoy().catch((e) => log("programador error", { mensaje: (e as Error).message }));
  }, INTERVALO_PROGRAMADOR_MS);
  reloj.unref?.();

  const control = iniciarWorker({
    sql,
    manejadores,
    registrar: log,
    alTokenInvalido: async (trabajo, error) => {
      // El negocio tiene que reconectar su cuenta de Meta. Queda registrado;
      // el aviso al dueño se conecta cuando exista el canal de notificaciones.
      log("token_meta_invalido", { tenantId: trabajo.tenantId, cuenta: trabajo.cuenta, codigo: error.codigo });
    },
  });
  const apagar = () => { log("apagando meta-worker"); clearInterval(reloj); control.detener(); };
  process.on("SIGTERM", apagar);
  process.on("SIGINT", apagar);
  await control.terminado;
  process.exit(0);
})().catch((e) => {
  console.error("[meta-worker] fallo fatal", e);
  process.exit(1);
});
