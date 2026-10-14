// Cargar .env ANTES que cualquier otro import — app.ts y sus dependencias
// leen process.env en el momento en que se importan (CORS origins, secretos
// de cookie, config de proveedores IA, etc.). Sin esto, ningún script de
// arranque local (nodemon, tsx directo, run.ps1) cargaba el .env — quedaban
// todas las claves (IA, Facebook, WhatsApp) vacías y el bot "no funcionaba".
// Se resuelve relativo a este archivo (no a process.cwd()) para que
// funcione igual corriendo desde src/ (tsx) o desde dist/ (bundle de
// esbuild), sin importar desde qué directorio se lanzó el proceso.
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { instalarApagadoOrdenado } from "./lib/apagado-ordenado";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

// IMPORTANTE: import() dinámico, no estático. Un `import app from "./app"`
// estático se resuelve y ejecuta ANTES que el loadDotenv() de arriba (los
// imports estáticos de un módulo se instancian antes de que corra el cuerpo
// del propio módulo) — app.ts leería process.env vacío. El import dinámico
// sí respeta el orden de ejecución real, así que corre después de cargar
// el .env.
async function start() {
  const { default: app } = await import("./app");
  const { logger } = await import("./lib/logger");
  const { runAutoMigrations } = await import("./lib/autoMigrate");
  const { ensureDbReady } = await import("@workspace/db");

  const rawPort = process.env["PORT"];

  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  const port = Number(rawPort);

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }

  // Wait for database to be ready before accepting connections
  logger.info("[DB] Esperando inicialización de base de datos...");
  try {
    await ensureDbReady();
    logger.info("[DB] Base de datos lista");
  } catch (err) {
    logger.error({ err }, "[DB] Error en ensureDbReady, continuando de todas formas");
  }

  // Non-blocking database migrations (fires in background)
  runAutoMigrations().catch(() => {});

  // Claves de IA guardadas desde la pantalla de Configuración: se vuelcan al
  // entorno para que los proveedores las usen igual que las del .env.
  try {
    const { cargarClavesEnEntorno } = await import("./lib/ai-keys");
    await cargarClavesEnEntorno();
  } catch (err) {
    logger.warn({ err }, "[AIKeys] no se pudieron cargar las claves guardadas");
  }

  // ── La plataforma siempre tiene que tener un dueño ─────────────────────
  // Si NO existe ningún administrador, se promueve al tenant dueño del deploy
  // (PLATFORM_TENANT_ID, por defecto 1). Sin esto, una instalación nueva queda
  // sin nadie que pueda administrar clientes: el backend ya permitía crear al
  // primer admin, pero la única pantalla que lo ofrecía exigía ser admin --
  // el huevo y la gallina, verificado en vivo el 2026-08-19.
  //
  // Solo corre cuando el conteo de admins es CERO, así que no puede quitarle
  // ni darle permisos a nadie una vez que la plataforma tiene su dueño.
  try {
    const { db, tenants } = await import("@workspace/db");
    const { eq, sql } = await import("drizzle-orm");
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(tenants)
      .where(eq(tenants.isAdmin, true));
    if (Number(n) === 0) {
      const dueno = Number(process.env.PLATFORM_TENANT_ID || 1);
      await db.update(tenants).set({ isAdmin: true }).where(eq(tenants.id, dueno));
      logger.warn({ tenantId: dueno }, "[Bootstrap] No había ningún administrador: se promovió al dueño de la plataforma");
    }
  } catch (err) {
    // Nunca impedir que el servidor arranque por esto.
    logger.warn({ err }, "[Bootstrap] no se pudo verificar si existe un administrador");
  }

  const servidorHttp = app.listen(port, "0.0.0.0", (err: any) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port, host: "0.0.0.0", authDir: process.env.WA_AUTH_DIR || "data/.baileys-auth" }, "Server listening — WhatsApp auth persistente");

    // Revisión periódica de disponibilidad en Dropi (cada DROPI_REVISION_HORAS,
    // 6 por defecto; 0 la apaga). Dropify no sincroniza stock: si el
    // proveedor archiva un producto, nadie se entera hasta que un cliente lo
    // pide (#323). Ver lib/dropi-disponibilidad.ts.
    import("./lib/dropi-disponibilidad").then(({ programarRevisionDeDropi }) => {
      programarRevisionDeDropi(async () => {
        const { db, tenants } = await import("@workspace/db");
        const filas = await db.select({ id: tenants.id }).from(tenants);
        return filas.map((t: any) => Number(t.id));
      });
    }).catch((err) => logger.warn({ err }, "[Dropi] No se pudo programar la revisión de disponibilidad"));

    // Cerrar el socket de WhatsApp ANTES de morir. Sin esto, un deploy mata
    // el proceso con la sesión a medio cerrar y WhatsApp entrega los mensajes
    // de esa ventana a un socket muerto: no se encolan y no se reenvían.
    // Le costó al negocio dos clientes que venían de anuncios pagos.
    instalarApagadoOrdenado();
  });

  // ── Canal en vivo (WebSocket) ──────────────────────────────────────────
  // Se engancha al MISMO http.Server que atiende la API: una sola puerta de
  // entrada y una sola regla de autenticación (la cookie firmada del panel).
  // Emite a Atlas y a los agentes lo que pasa al instante, sin polling.
  try {
    const { arrancarPuenteEnVivo } = await import("./lib/eventos");
    const { montarEventosEnVivo } = await import("./routes/eventos");
    arrancarPuenteEnVivo();
    montarEventosEnVivo(servidorHttp as any);
  } catch (err: any) {
    // Un canal en vivo caído no puede impedir que el vendedor atienda.
    logger.warn({ err: err?.message }, "[Eventos] no se pudo montar el canal en vivo");
  }
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
