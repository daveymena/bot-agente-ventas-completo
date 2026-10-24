/**
 * ============================================================
 * APAGADO ORDENADO — cerrar WhatsApp antes de morir
 * ============================================================
 *
 * El problema que resuelve, y es el que más plata costó:
 *
 * Dos clientes que llegaron de anuncios PAGOS escribieron mientras el bot se
 * reiniciaba por un deploy. Sus mensajes no se guardaron en ningún lado y
 * nadie les contestó nunca. Se paga el clic, el cliente escribe, y del otro
 * lado no queda ni rastro de que escribió.
 *
 * ── Por qué pasaba ────────────────────────────────────────────────────────
 * En TODO `src/` no había un solo `process.on(...)`. Verificado el 2026-08-24.
 *
 * Cuando EasyPanel despliega, Docker manda SIGTERM al contenedor. Sin
 * manejador, Node se muere en el acto y el WebSocket de Baileys **nunca se
 * cierra**: queda a medio morir, sin FIN ni close frame.
 *
 * Para los servidores de WhatsApp ese teléfono sigue EN LÍNEA. Así que los
 * mensajes que llegan en esa ventana se entregan al socket muerto y se dan
 * por entregados. No se encolan, y por lo tanto no se reenvían al reconectar.
 * El mensaje no se perdió "en el aire": WhatsApp cree que ya te lo dio.
 *
 * ── Por qué syncFullHistory no era la solución ────────────────────────────
 * Se intentó `syncFullHistory: true` (commit 411ab91) para que Baileys
 * bajara lo que se perdió, y hubo que revertirlo (fa7b948) porque el resync
 * dejaba la sesión sin procesar eventos en vivo: el bot decía "connected" y
 * no contestaba a nadie. Peor el remedio.
 *
 * La causa nunca estuvo en la sincronización de historial, sino en cómo se
 * cerraba —o no se cerraba— la sesión.
 *
 * ── Qué hace esto ─────────────────────────────────────────────────────────
 * Cierra el socket de cada tenant con `stop(true)`: quita los listeners y
 * hace `sock.end()` CONSERVANDO las credenciales. Nada de `logout()`, que
 * invalidaría la sesión y obligaría a escanear el QR de nuevo.
 *
 * Con el cierre limpio, WhatsApp marca el dispositivo como desconectado y
 * ENCOLA lo que llegue. Al volver el bot, esos mensajes se entregan como
 * `messages.upsert` y el handler ya sabe procesarlos (acepta "notify" y
 * "append", con deduplicación por id de mensaje).
 *
 * ── Detalle que lo haría inútil ───────────────────────────────────────────
 * Docker da un plazo (10s por defecto) entre SIGTERM y SIGKILL. Si el cierre
 * tarda más, igual te matan a la mitad. Por eso hay un tope propio de 8s: es
 * preferible cerrar lo que se pueda y salir por decisión propia, a que te
 * maten en el peor momento.
 */
import { logger } from "./logger";

/** Que dos señales seguidas no disparen dos apagados. */
let yaApagando = false;

const TOPE_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 8000);

async function cerrarWhatsApp(): Promise<void> {
  const { getAgentOrchestrator } = await import("./services/agent-orchestrator");
  getAgentOrchestrator().stopProcessing();
  const { getMessageQueue } = await import("./message-queue");
  await getMessageQueue().flush().catch(err => logger.error({ err }, "[Apagado] Outbox pendiente"));
  // Import dinámico: si el módulo de WhatsApp falla al cargar, el apagado
  // igual tiene que seguir y salir. No se puede bloquear el cierre por esto.
  const { listWhatsAppInstances, disposeWhatsAppForTenant } = await import("./whatsapp-factory");

  const instancias = listWhatsAppInstances();
  if (instancias.length === 0) {
    logger.info("[Apagado] No hay sesiones de WhatsApp abiertas");
    return;
  }

  logger.info({ sesiones: instancias.length }, "[Apagado] Cerrando sesiones de WhatsApp");

  // En paralelo: son sockets independientes y el reloj corre.
  await Promise.all(
    instancias.map(async ({ tenantId }) => {
      try {
        await disposeWhatsAppForTenant(tenantId);
        logger.info({ tenantId }, "[Apagado] Sesión cerrada limpiamente");
      } catch (err) {
        logger.warn({ err, tenantId }, "[Apagado] No se pudo cerrar la sesión");
      }
    }),
  );
}

async function apagar(senal: string): Promise<void> {
  if (yaApagando) return;
  yaApagando = true;

  logger.info({ senal }, "[Apagado] Señal recibida — cerrando ordenadamente");

  // El tope corre contra el cierre, no en secuencia: salimos por las nuestras
  // antes de que Docker mande SIGKILL.
  const seAcaboElTiempo = new Promise<void>((resolve) =>
    setTimeout(() => {
      logger.warn({ topeMs: TOPE_MS }, "[Apagado] Se acabó el tiempo — se sale igual");
      resolve();
    }, TOPE_MS),
  );

  await Promise.race([cerrarWhatsApp().catch((err) => logger.warn({ err }, "[Apagado] Error al cerrar WhatsApp")), seAcaboElTiempo]);

  logger.info("[Apagado] Listo — saliendo");
  process.exit(0);
}

/**
 * Engancha el apagado ordenado. Llamar UNA vez al arrancar el servidor.
 */
export function instalarApagadoOrdenado(): void {
  // SIGTERM: el que manda Docker/EasyPanel al desplegar. Es EL caso.
  process.on("SIGTERM", () => void apagar("SIGTERM"));
  // SIGINT: Ctrl+C en desarrollo, para que se comporte igual.
  process.on("SIGINT", () => void apagar("SIGINT"));

  // Un error no atrapado tumbaba el proceso dejando el socket colgado, con la
  // misma consecuencia que el deploy: mensajes entregados al vacío. Se cierra
  // igual antes de salir.
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "[Apagado] Excepción no atrapada");
    void apagar("uncaughtException");
  });
  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "[Apagado] Promesa rechazada sin manejar");
  });

  logger.info({ topeMs: TOPE_MS }, "[Apagado] Cierre ordenado instalado");
}
