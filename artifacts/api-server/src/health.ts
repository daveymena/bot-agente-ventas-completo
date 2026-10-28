import { Router } from "express";
import { logger } from "./lib/logger";
import { tieneClaveFija } from "./lib/credentials-vault";

const router = Router();

// Health check endpoint. Se registra en /health y /healthz (alias) para
// tolerar ambas convenciones de sonda de salud (Docker/Easypanel/K8s).
//
// ── Este endpoint mentía ──────────────────────────────────────────────────
//
// Devolvía `status: "ok"` CABLEADO A MANO, sin verificar nada real. Decía que
// todo estaba bien con la base entera caída, y cualquier monitor externo le
// creía.
//
// No es teórico: el 2026-09-04 Landing Studio no ejecutaba NADA --la tabla no
// existía y `landingPages` valía `undefined`-- y este endpoint decía "ok", el
// deploy salía en verde y el bundle cargaba. El único síntoma era que no
// funcionaba.
const healthHandler = async (req: any, res: any) => {
  try {
    // Estado de WhatsApp en el health, sin exponer el número.
    //
    // Un mensaje de un cliente quedó sin responder y desde afuera no había
    // NINGUNA forma de saber si el bot estaba conectado: el estado detallado
    // vive detrás de sesión, así que para diagnosticar "por qué no contesta"
    // había que entrar al panel. Un dato booleano no filtra nada y convierte
    // ese diagnóstico en una sola consulta -- también para una sonda externa
    // que avise cuando el bot se cae, que es cuando se pierden ventas.
    let whatsapp: { conectado: boolean; estado: string } | null = null;
    try {
      const { peekWhatsAppForTenant } = require("./lib/whatsapp-factory");
      const s = peekWhatsAppForTenant(1)?.getStatus?.();
      whatsapp = { conectado: s?.state === "connected", estado: String(s?.state || "desconocido") };
    } catch {
      /* si no se puede leer, se omite; el estado se refleja abajo en `problemas` */
    }

    // Estado de la cola de mensajes. Son conteos, no contenido: no filtra
    // nada de ningún cliente. Sin esto, "el bot no contestó" es imposible de
    // diagnosticar desde afuera -- no se sabe si el mensaje llegó a la cola,
    // si está esperando, o si falló los reintentos y se descartó.
    let cola: any = null;
    let ultimoError: any = null;
    try {
      const { getMessageQueue } = require("./lib/message-queue");
      cola = getMessageQueue()?.getStats?.() || null;
      const { AgentOrchestrator } = require("./lib/services/agent-orchestrator");
      ultimoError = AgentOrchestrator?.ultimoError || null;
    } catch {
      /* el health nunca puede fallar por esto */
    }

    // ── ¿Contesta la base? ────────────────────────────────────────────────
    // Sin esto no se puede distinguir "el servicio funciona" de "el proceso
    // de Node sigue vivo", que son cosas muy distintas.
    let dbOk = false;
    let dbError: string | null = null;
    try {
      const { pool, db } = require("@workspace/db");
      if (pool && typeof pool.query === "function") {
        await pool.query("SELECT 1");
        dbOk = true;
      } else if (db && typeof db.get === "function") {
        // Con USE_SQLITE `pool` es null (lib/db/src/index.ts) y el único
        // handle es el drizzle de sql.js. Sin esta rama el demo de EasyPanel
        // se reportaba "degradado · base-de-datos" con la base perfecta.
        const { sql } = require("drizzle-orm");
        await db.get(sql`select 1`);
        dbOk = true;
      }
    } catch (e: any) {
      dbError = String(e?.message || e);
    }

    // ── ¿Y están las tablas? ──────────────────────────────────────────────
    //
    // Que la base conteste NO alcanza: en el caso de Landing Studio la base
    // andaba perfecto, lo que faltaba era la tabla. `autoMigrate` se traga los
    // errores a propósito --una migración caída no puede dejar sin servicio a
    // los clientes-- así que este es el único lugar donde ese fallo se ve.
    //
    // Las tablas se derivan del propio SQL de autoMigrate, no de una lista
    // paralela: una lista a mano se desactualiza el día que alguien agrega una
    // tabla y se olvida de actualizarla, y ahí el chequeo deja de cubrir justo
    // lo nuevo -- que es lo que más probabilidades tiene de estar roto.
    let base: any = { ok: dbOk, ...(dbError ? { error: dbError } : {}) };
    let faltanTablas = false;
    let migracionesFallaron = false;
    if (dbOk) {
      try {
        const { tablasFaltantes, ultimasMigraciones, TABLAS_ESPERADAS } = await import("./lib/autoMigrate");
        const faltan = await tablasFaltantes();
        // `null` significa "no se pudo preguntar", que NO es lo mismo que "no
        // falta ninguna". Colapsar los dos casos en un booleano es exactamente
        // cómo se construye un health que miente.
        faltanTablas = faltan !== null && faltan.length > 0;
        migracionesFallaron = ultimasMigraciones.fallos.length > 0;
        base = {
          ...base,
          tablasEsperadas: TABLAS_ESPERADAS.length,
          ...(faltan === null ? { tablas: "no se pudo verificar" } : {}),
          ...(faltanTablas ? { tablasQueFaltan: faltan } : {}),
          ...(ultimasMigraciones.cuando ? { migraciones: ultimasMigraciones.cuando } : {}),
          ...(migracionesFallaron ? { migracionesFallidas: ultimasMigraciones.fallos } : {}),
        };
      } catch (e: any) {
        base = { ...base, tablas: "no se pudo verificar", error: String(e?.message || e) };
      }
    }

    // ── QUÉ BUILD ESTÁ CORRIENDO ──────────────────────────────────────────
    //
    // El 2026-08-31 se perdieron horas por no poder responder esta pregunta.
    // Se arregló un fallo, se subió, el bot siguió contestando "problemas
    // técnicos", y no había forma de saber si el arreglo estaba arriba o no:
    // `uptime` solo dice cuándo arrancó el proceso, y un reinicio cualquiera
    // --una caída, un ajuste de entorno-- lo pone a cero igual que un
    // despliegue. Sin distinguirlos, "ya se desplegó" es una suposición.
    //
    // La fecha del archivo compilado sí lo distingue: dentro del contenedor es
    // el momento en que se armó la imagen. Si no cambia entre dos consultas,
    // el código es el mismo por más que el proceso se haya reiniciado.
    let build: string | null = null;
    try {
      build = require("node:fs").statSync(__filename).mtime.toISOString();
    } catch {
      /* el health nunca puede fallar por esto */
    }

    // ── ¿El bot puede VER? ───────────────────────────────────
    //
    // Esta es la falla mas cara de diagnosticar del sistema, porque no se ve
    // desde ningun lado: `VISION_MODELS` apunto durante semanas en produccion
    // a proveedores sin clave, `describirImagen` devolvia null en TODAS las
    // imagenes, y el sintoma que llegaba al admin era otro completamente --un
    // cliente pagaba, mandaba el comprobante, y el bot le contestaba "recibi
    // tu comprobante" sin haber visto nada--.
    //
    // Va aca, y no solo en el log, porque el log hay que ir a buscarlo dentro
    // del contenedor y esto se tiene que poder preguntar desde afuera.
    //
    // Solo el conteo, no los nombres de los proveedores: el endpoint es
    // publico y para saber si el bot esta ciego alcanza con un numero.
    // Se publican los DOS numeros, no solo el bueno. Con solo `modelos` el
    // 2026-09-06 se leyo "4 modelos con clave" en un bot cuyos 3 modelos de
    // vision configurados apuntaban a OpenRouter y NVIDIA sin que ninguna de
    // esas dos claves existiera en EasyPanel (verificado por dos endpoints
    // distintos y a nivel proyecto). Un contador que solo cuenta aciertos no
    // se puede auditar: si `sinClave` es 0 cuando deberia ser 3, el que esta
    // roto es el contador, y eso ahora se ve desde afuera.
    let vision: { ok: boolean; modelos: number; sinClave: number } | null = null;
    try {
      const { visionDisponible } = require("./lib/media-entrante");
      const v = visionDisponible();
      vision = {
        ok: !!v?.hay,
        modelos: (v?.conClave || []).length,
        sinClave: (v?.sinClave || []).length,
      };
    } catch {
      /* el health nunca puede fallar por esto */
    }

    const problemas: string[] = [];
    if (!dbOk) problemas.push("base-de-datos");
    if (faltanTablas) problemas.push("faltan-tablas");
    if (migracionesFallaron) problemas.push("migraciones-fallidas");
    if (whatsapp && !whatsapp.conectado) problemas.push("whatsapp");
    // Ciego no es "roto", pero tampoco es "ok": sin vision no hay verificacion
    // de comprobantes, que es el paso donde se decide entregar un producto.
    if (vision && !vision.ok) problemas.push("sin-vision");
    // ── LA CLAVE DEL BAUL ──────────────────────────────────────────────────
    //
    // Sin `CREDENTIALS_ENCRYPTION_KEY` fija, cada reinicio genera una clave
    // aleatoria y TODO lo encriptado antes queda ilegible: el dueño conecta
    // Facebook, funciona, y al siguiente despliegue "se desconecta solo".
    //
    // No tira ningun error -- `decryptSecret` devuelve cadena vacia y el
    // sistema lo lee como "nunca configuro nada". La unica pista era un aviso
    // en el log de arranque, que nadie mira. Costo una tarde entera de
    // diagnostico el 2026-09-07.
    const claveFija = tieneClaveFija();
    if (!claveFija) problemas.push("sin-clave-de-credenciales");

    // ── Por qué SIEMPRE 200, incluso degradado ────────────────────────────
    //
    // ⚠️ Esto no es un descuido, es la parte más importante del archivo.
    //
    // El Dockerfile (línea 87) usa ESTE endpoint como sonda de vida:
    //
    //     HEALTHCHECK --interval=30s --retries=3
    //       CMD curl -f http://localhost:${PORT}/api/health || exit 1
    //
    // `curl -f` falla con cualquier 5xx. Tres fallos seguidos --90 segundos--
    // y Docker marca el contenedor como unhealthy y lo REINICIA.
    //
    // O sea que devolver 503 cuando la base parpadea no avisa de un problema:
    // lo multiplica. Cada reinicio corta la sesión de WhatsApp, y cortar la
    // sesión es como se perdían mensajes en silencio (ver lib/apagado-ordenado
    // y el comentario del propio Dockerfile, que documenta que esto YA PASÓ:
    // "el check fallaba siempre, Easypanel lo reiniciaba cada ~40s, cortando
    // la sesión de WhatsApp repetidamente").
    //
    // Así que el código HTTP responde lo que la sonda pregunta --"¿el proceso
    // vive?"-- y el CONTENIDO dice toda la verdad. Para cortar tráfico según
    // el estado real está /ready, que es la sonda que corresponde y ahí sí
    // devuelve 503.
    res.status(200).json({
      status: problemas.length === 0 ? "ok" : "degradado",
      role: process.env.VENTASPRO_PROCESS_ROLE || "combined",
      credenciales: {
        claveFija,
        // ⚠️ NUNCA la clave, solo si existe.
        nota: claveFija
          ? undefined
          : "Sin CREDENTIALS_ENCRYPTION_KEY: los tokens guardados (Facebook, GitHub, correo) dejan de servir en cada reinicio.",
      },
      ...(problemas.length ? { problemas } : {}),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      ...(build ? { build } : {}),
      base,
      ...(whatsapp ? { whatsapp } : {}),
      ...(vision ? { vision } : {}),
      ...(cola ? { cola } : {}),
      ...(ultimoError ? { ultimoError } : {}),
    });
  } catch (error) {
    // Acá sí corresponde 5xx: significa que el handler mismo se cayó, o sea
    // que el proceso está roto de verdad y reiniciarlo es la respuesta.
    logger.error({ error }, "Health check failed");
    res.status(503).json({ status: "error" });
  }
};

router.get("/health", healthHandler);
router.get("/healthz", healthHandler);

/**
 * Ready check: ¿este proceso puede atender tráfico?
 *
 * Antes respondía "ready" siempre, sin comprobar nada -- el comentario
 * original decía "aquí puedes agregar verificaciones de dependencias" y nunca
 * se implementó.
 *
 * Acá el 503 SÍ corresponde, y es la diferencia con /health: readiness existe
 * justo para sacar de rotación a una instancia que no puede servir, sin
 * matarla. Liveness responde "¿sigue vivo?"; readiness, "¿sirve ahora?".
 */
router.get("/ready", async (req, res) => {
  try {
    const { pool, db } = require("@workspace/db");
    let dbOk = false;
    if (pool && typeof pool.query === "function") {
      await pool.query("SELECT 1");
      dbOk = true;
    } else if (db && typeof db.get === "function") {
      const { sql } = require("drizzle-orm");
      await db.get(sql`select 1`);
      dbOk = true;
    }

    if (!dbOk) {
      return res.status(503).json({
        status: "not_ready",
        reason: "database",
        timestamp: new Date().toISOString(),
      });
    }

    // En PostgreSQL las migraciones deben haber terminado antes de declarar
    // lista la instancia. Esto evita enviar tráfico a una app cuyo código ya
    // usa columnas/tablas que todavía no existen en la base.
    if (pool) {
      const { ultimasMigraciones, tablasFaltantes } = await import("./lib/autoMigrate");
      const role = process.env.VENTASPRO_PROCESS_ROLE || "combined";
      if (role !== "worker" && !ultimasMigraciones.cuando) {
        return res.status(503).json({ status: "not_ready", reason: "migrations_pending" });
      }
      if (role !== "worker" && ultimasMigraciones.fallos.length) {
        return res.status(503).json({
          status: "not_ready",
          reason: "migrations_failed",
          failedMigrations: ultimasMigraciones.fallos.length,
        });
      }
      const faltan = await tablasFaltantes();
      if (faltan === null || faltan.length) {
        return res.status(503).json({
          status: "not_ready",
          reason: faltan === null ? "schema_check_failed" : "missing_tables",
          ...(faltan?.length ? { missingTables: faltan } : {}),
        });
      }
    }

    // En producción el receptor de WhatsApp solo debe aceptar tráfico si la
    // cola está conectada a PostgreSQL y sus escrituras persistentes funcionan.
    if (process.env.NODE_ENV === "production") {
      const { getMessageQueue } = await import("./lib/message-queue");
      const cola = getMessageQueue().getStats();
      if (cola.persistence !== "postgres" || !cola.persistenceHealthy) {
        return res.status(503).json({ status: "not_ready", reason: "whatsapp_queue" });
      }
    }

    return res.status(200).json({
      status: "ready",
      role: process.env.VENTASPRO_PROCESS_ROLE || "combined",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error }, "Ready check failed");
    return res.status(503).json({ status: "not_ready", reason: "exception" });
  }
});

export default router;
