import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import pinoHttp from "pino-http";
import router from "./routes";
import { landingPublicaRouter } from "./routes/landing-publica";
import healthRouter from "./health";
import woocommerceRouter from "./routes/woocommerce";
import dropiRouter from "./routes/dropi";
import telegramRouter from "./routes/telegram";
import subscriptionWebhooksRouter from "./routes/subscription-webhooks";
import activationRouter from "./routes/activation";
import aiCatalogRouter from "./routes/ai-catalog";
import { logger } from "./lib/logger";
import { securityShield } from "./lib/security-shield";
import { imageUrlFixer } from "./lib/image-url-fixer";
import { resolveTenant } from "./lib/tenantManager";
import { validateSaasPlan, validateUsageLimits } from "./middleware/saasValidation";
import { validateFeatureLimits, validateMessageLimit } from "./middleware/featureLimits";
import { getWhatsAppForTenant } from "./lib/whatsapp-factory";
import { tenantManager } from "./lib/tenantManager";
import { getAllTemplates } from "./lib/agent-templates";
import { db, agents, tenants, settings, products, productCategories } from "@workspace/db";
import { ensureDbReady } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getImageStoreDir } from "./lib/image-store";

// Auto-start WhatsApp bot on boot (multi-tenant: una instancia por tenant)
(async () => {
  try {
    // getDefaultTenant() devuelve un objeto placeholder hardcodeado (sin
    // credenciales de pago/Facebook reales) -- se busca el tenant 1 real en
    // la BD para que la instancia auto-iniciada tenga su brandName/agentPrompt
    // reales desde el arranque, no el placeholder.
    const realTenant = await tenantManager.getTenantById(1);
    const defaultTenant = realTenant ?? tenantManager.getDefaultTenant();

    // Si no hay tenant resuelto (BD vacía o schema viejo), no intentar
    // arrancar WhatsApp -- antes esto lanzaba un TypeError inesperado
    // ("Cannot read properties of undefined (reading 'id')") que rompía el
    // arranque del servidor en loop.
    if (!defaultTenant?.id) {
      logger.warn("[WhatsApp] No hay tenant disponible, omitiendo auto-start del bot");
      return;
    }

    const mgr = getWhatsAppForTenant(defaultTenant.id, defaultTenant);
    await mgr.start();
    logger.info({ tenantId: defaultTenant.id }, "[WhatsApp] Instancia auto-iniciada");
  } catch (err) {
    logger.error({ err }, "[WhatsApp] Failed to auto-start bot on boot");
  }
})();

// Monitor periódico de instancias multi-tenant (limpieza cada 5 min)
import { startWhatsAppMonitor } from "./lib/whatsapp-monitor";
startWhatsAppMonitor(5 * 60 * 1000);

// Auto-start del agente de crecimiento de Facebook Ads (asistido: solo
// sugiere por WhatsApp, nunca ejecuta sin aprobación -- ver ad-growth-agent.ts)
import { startAdGrowthAgent } from "./lib/ad-growth-agent";
startAdGrowthAgent();

// El reloj del sistema: lo que hay que hacer A UNA HORA determinada.
//
// `setInterval` sirve para "cada 30 minutos" pero no para "el martes a las
// 19:00", y además cada despliegue lo reinicia -- por eso el guardián de gasto
// llegó a marcar "0 revisiones" en su historial. Acá la hora vive en la base,
// así que un reinicio no pierde nada: ver lib/programador.ts.
//
// Los manejadores se registran solos cuando el agente que los usa se activa;
// un trabajo cuyo tipo todavía no registró nadie queda PENDIENTE y corre en la
// vuelta siguiente, nunca se marca "hecho" en falso.
import { iniciarProgramador } from "./lib/programador";
import { registrarOrganico } from "./lib/agente-organico";
import { registrarAgencia } from "./lib/agencia-ritmo";
import { registrarGuardia } from "./lib/agente-horario";
import { registrarAgendaDeAtlas } from "./lib/atlas-agenda";
registrarOrganico();
// El equipo de marketing tambien necesita reloj: sin esto, sus catorce
// especialistas solo trabajan cuando el admin abre el chat y pregunta.
registrarAgencia();
// Cierra el loop de aprobaciones: al aprobar una tarea del equipo, se ejecuta
// de verdad contra Meta (ver lib/marketing-team/task-executor.ts).
import("./lib/marketing-team/task-executor").then((m) => m.iniciarEjecutorDeTareas()).catch(() => undefined);
// Tokens de Dropify por producto: se auditan y reparan solos (ver lib/dropify-auditoria.ts).
import("./lib/dropify-auditoria").then((m) => m.iniciarAuditoriaDropify()).catch(() => undefined);
import("./lib/telegram-atlas").then((m) => m.iniciarAtlasEnTelegramParaTodos()).catch(() => undefined);
// Productos importados (Dropi/Woo) sin categoría real → se enlazan solos (ver lib/categorias.ts).
import("./lib/categorias").then((m) => m.iniciarVinculoDeCategorias()).catch(() => undefined);
// Atlas arrastraba "Dropi rechaza el token del panel" de sesiones viejas (ver lib/dropi-memoria.ts).
import("./lib/dropi-memoria").then((m) => m.iniciarCorreccionDeMemoriaDropi()).catch(() => undefined);
registrarGuardia();
// Las acciones que el admin deja programadas desde Atlas (ver lib/atlas-agenda.ts).
registrarAgendaDeAtlas();
iniciarProgramador();

// Reporte diario del equipo de marketing. Los 13 agentes existian pero no
// corria ninguno solo: habia que ir a despertarlos entrando a la pagina. Un
// equipo que hay que despertar no hace seguimiento. Solo MIRA y avisa por
// WhatsApp; no cambia nada, y si no hay novedades no escribe.
import { startMarketingDailyReport } from "./lib/marketing-team/daily-report";
startMarketingDailyReport();

// Auto-mejora curada de agentes: aprende de errores en segundo plano. Apagado
// por defecto (AUTOREFLEXION_ENABLED=true lo prende). Aplica cambios aditivos
// al prompt con version y rollback (ver lib/auto-reflexion.ts).
import { registrarAutoReflexion } from "./lib/auto-reflexion";
registrarAutoReflexion();

// Auto-start del scheduler de remarketing: procesa en tandas chicas las
// campañas de email/WhatsApp que Atlas encoló (nunca manda nada por su
// cuenta -- solo drena lo que el admin ya confirmó, ver remarketing.ts).
import { remarketingScheduler } from "./lib/remarketing-scheduler";
remarketingScheduler.start();

// Auto-start AI Processor (Orchestrator) on boot
import { getAgentOrchestrator } from "./lib/services/agent-orchestrator";
import { getMessageHandler } from "./lib/services/message-handler";

const orchestrator = getAgentOrchestrator();
orchestrator.configureTenant("1", { enabled: true, processingIntervalMs: 500 });
logger.info("[AgentOrchestrator] AI processing auto-started for default tenant");

// Configure MessageHandler for receiving incoming WhatsApp messages
const messageHandler = getMessageHandler();
messageHandler.configureTenant("1", { enabled: true });
logger.info("[MessageHandler] Message receiver configured for default tenant");

// Auto-seed initial data if empty DB
(async () => {
  try {
    await ensureDbReady();

    // Auto-seed tenant (admin user) if not exists.
    // Email/password vienen de ADMIN_EMAIL/ADMIN_PASSWORD -- nunca hardcodeados
    // aquí: un valor fijo en el código es la misma cuenta admin conocida en
    // CUALQUIER despliegue fresco de este repo. Fallback solo para no romper
    // instalaciones locales sin .env; en producción hay que setear ambas vars.
    let existingTenants = [];
    try {
      existingTenants = await db.select().from(tenants).limit(1);
    } catch (e: any) {
      // Si falla por schema mismatch (columnas faltantes), ignorar auto-seed
      if (e.message?.includes("does not exist") || e.code === "42703") {
        console.warn("[AutoSeed] Schema mismatch detectado, omitiendo auto-seed");
        return;
      }
      throw e;
    }
    if (existingTenants.length === 0) {
      const crypto = await import("crypto");
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString("hex");
      if (!process.env.ADMIN_PASSWORD) {
        console.warn(`⚠️ ADMIN_PASSWORD no seteada -- se generó una temporal, cámbiala tras el primer login: ${adminPassword}`);
      }
      console.log("👤 Creando tenant por defecto...");
      const bcrypt = await import("bcryptjs");
      const passwordHash = await bcrypt.default.hash(adminPassword, 10);
      await db.insert(tenants).values({
        name: "Admin",
        email: adminEmail,
        passwordHash,
        slug: "sofia-premium",
        brandName: "TecnoVariedades",
        status: "active",
        plan: "premium",
        agentName: "Sofía",
        agentPersonality: "professional",
        emailVerified: true,
        settings: { timezone: "America/Bogota", language: "es", currency: "COP", autoRespond: true },
      });
      console.log(`✅ Tenant creado: ${adminEmail}`);
    }

    // Auto-seed settings if not exists
    const existingSettings = await db.select().from(settings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(settings).values({
        businessName: "TecnoVariedades",
        businessDescription: "Tienda virtual de productos digitales y servicios tecnológicos",
        timezone: "America/Bogota",
        aiProvider: "opencode",
      });
      console.log("✅ Settings por defecto creados");
    }

    // Auto-seed agents if they don't exist
    const existingAgents = await db.select().from(agents).limit(1);
    if (existingAgents.length === 0) {
      console.log("🤖 No hay agentes, creando desde templates...");
      const templates = getAllTemplates();
      for (const template of templates) {
        await db.insert(agents).values({
          tenantId: 1,
          name: template.name,
          role: template.role,
          tone: template.tone,
          language: "es",
          model: "gpt-5.6-luna",
          systemPrompt: template.systemPrompt,
          stages: template.stages,
          isActive: template.name === "Sofía",
        });
        console.log(`✅ ${template.avatar} ${template.name} creado`);
      }
      console.log("🎉 Agentes creados exitosamente");
    }

    // Auto-seed products from JSON if they don't exist
    const existingProducts = await db.select().from(products).limit(1);
    if (existingProducts.length === 0) {
      console.log("📦 No hay productos, sembrando desde products-full.json...");
      // El archivo vive en la raíz del monorepo, no en cwd (que varía según
      // cómo se lance el proceso) — probar varias rutas cubre local y Docker.
      // `__dirname` se declara MÁS ABAJO (línea ~356). Leerlo acá lanzaba
      // ReferenceError por zona muerta temporal. No se notaba porque este
      // bloque solo corre cuando el catálogo está VACÍO: o sea que reventaba
      // exactamente en la instalación de un cliente nuevo, que es el peor
      // momento para fallar. Se resuelve local, sin depender del orden.
      const aqui = path.dirname(fileURLToPath(import.meta.url));
      const possiblePaths = [
        path.resolve(process.cwd(), "products-full.json"),
        path.resolve(aqui, "../../products-full.json"),
        path.resolve(aqui, "../../../products-full.json"),
        "/app/products-full.json",
      ];
      const jsonPath = possiblePaths.find(p => existsSync(p));
      if (jsonPath) {
        const rawData = readFileSync(jsonPath, "utf-8");
        const productsData = JSON.parse(rawData);
        let catId = 1;
        const existingCats = await db.select().from(productCategories).limit(1);
        if (existingCats.length === 0) {
          await db.insert(productCategories).values({ tenantId: 1, name: "General" });
          console.log("✅ Categoría General creada");
        } else {
          catId = existingCats[0].id;
        }
        let count = 0;
        for (const p of productsData) {
          try {
            await db.insert(products).values({
              // Conservar el id original para que la imagen (/images/products/{id}.jpg)
              // coincida con el producto correcto y no se crucen.
              ...(p.id ? { id: p.id } : {}),
              tenantId: 1,
              name: p.name,
              description: p.description || `Acceso completo a ${p.name}. Contenido actualizable, soporte técnico y descargas ilimitadas.`,
              price: p.price.toString(),
              currency: p.currency || "COP",
              categoryId: catId,
              category: p.category || "General",
              kind: p.kind || "digital",
              imageUrl: p.image_url,
              features: p.features || ["Acceso permanente", "Contenido actualizable", "Soporte técnico", "Descargas ilimitadas"],
              deliveryLink: p.deliveryLink || p.drive_url || "",
              isActive: true,
              metadata: JSON.stringify({ drive_folder_id: p.drive_folder_id }),
            });
            count++;
          } catch {}
        }
        console.log(`✅ ${count} productos insertados desde JSON`);
      } else {
        console.log(`⚠️ products-full.json no encontrado en ${jsonPath}`);
      }
    }

    // Auto-fix product image URLs (convert to /images/products/{id}.jpg format)
    // AND download missing physical product images from metadata
    (async () => {
      try {
        const allProducts = await db.select().from(products).limit(1);
        if (allProducts.length > 0) {
          // Sin argumento: todos los negocios. Con el 1 escrito a mano, en un
          // SaaS solo se atendía al primero.
          const result = await imageUrlFixer.fixAllProductImages();
          if (result.fixed > 0) {
            console.log(
              `✅ ${result.fixed} product image URLs fixed (was ${result.withoutImages} without images)`
            );
          }
          // ── Las fotos rotas, de TODOS los negocios ──────────────────────
          //
          // Acá decía `downloadPhysicalImages(1)`, con el 1 escrito a mano. En
          // un SaaS eso significa que solo se reparan las imágenes del primer
          // negocio: los productos de Dropi de cualquier otro cliente quedan
          // rotos para siempre, y nadie se entera porque el arranque igual
          // dice que todo salió bien.
          //
          // Sin argumento, va por todos.
          const downloadResult = await imageUrlFixer.downloadPhysicalImages();
          if (downloadResult.downloaded > 0 || downloadResult.limpiados > 0) {
            console.log(
              `✅ Fotos de productos físicos: ${downloadResult.downloaded} recuperadas, ` +
              `${downloadResult.limpiados} enlaces muertos limpiados, ${downloadResult.failed} sin arreglar`
            );
          }
        }
      } catch (err) {
        console.warn("⚠️ Could not auto-fix product images on startup:", err);
      }
})();
   } catch (error) {
    console.error("❌ Error en auto-seed:", error);
  }
})();

const app: Express = express();

// Trust proxy for reverse proxies (EasyPanel, Nginx, etc.)
// Necesario para que req.ip, req.secure, req.protocol funcionen correctamente detrás de proxies
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
  : ["http://localhost:5173", "http://127.0.0.1:5173", "http://0.0.0.0:5173", "http://localhost:3002"];

// En producción, también permitir el origen dinámico de EasyPanel
if (process.env.NODE_ENV === "production" && process.env.APP_URL) {
  corsOrigins.push(process.env.APP_URL);
}

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  }),
);
// La cookie de sesión (tenant_id) DEBE ir firmada — sin esto, cualquiera
// puede forjar `tenant_id=<numero>` y autenticarse como cualquier tenant
// (incluyendo el superusuario) sin contraseña. Ver COOKIE_SECRET en .env.
//
// Si no está configurado NO tumbamos el arranque (eso dejaría producción
// caída si el secreto falta en Easypanel). En su lugar generamos uno
// aleatorio en memoria y avisamos fuerte: la protección contra falsificación
// se mantiene (nadie puede adivinar un secreto aleatorio), pero las sesiones
// no sobreviven a un reinicio hasta que se configure COOKIE_SECRET fijo.
let cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  cookieSecret = randomBytes(32).toString("hex");
  const where = process.env.NODE_ENV === "production" ? "PRODUCCIÓN" : "desarrollo";
  logger.warn(
    `[Security] COOKIE_SECRET no configurado en ${where} — usando un secreto aleatorio temporal. ` +
    "Las sesiones se invalidarán en cada reinicio. Configura COOKIE_SECRET (fijo) en las " +
    "variables de entorno para una sesión estable."
  );
}
// El bucle local de Telegram→Atlas firma su propia cookie con este secreto.
process.env.COOKIE_SECRET = cookieSecret;
app.use(cookieParser(cookieSecret));
// Capturar el cuerpo crudo para poder verificar la firma de webhooks de Facebook (X-Hub-Signature-256)
// limit 12mb: las imágenes se suben como data URL base64 (≈+33% sobre el original),
// el default de 100kb rechazaba cualquier foto real con 413.
app.use(express.json({
  limit: "12mb",
  verify: (req: any, _res, buf) => {
    if (buf && buf.length) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));


// (Middleware de debug de cookies eliminado - usaba console.log en cada request)


// Health check endpoints (sin autenticación)
app.use("/api", healthRouter);


// Servir frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para encontrar el path correcto del frontend
function findFrontendPath(): string | null {
  const candidates = [
    // Producción (Docker)
    path.resolve("/app/artifacts/ventas-pro/dist/public"),
    // Desarrollo
    path.resolve(__dirname, "../../ventas-pro/dist/public"),
    // Alternativa desde cwd
    path.resolve(process.cwd(), "artifacts/ventas-pro/dist/public"),
  ];

  console.log(`[Frontend] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[Frontend] __dirname: ${__dirname}`);
  console.log(`[Frontend] process.cwd(): ${process.cwd()}`);
  console.log(`[Frontend] Buscando frontend en paths candidatos...`);

  for (const candidate of candidates) {
    console.log(`[Frontend] Probando: ${candidate}`);
    if (existsSync(candidate)) {
      const indexPath = path.join(candidate, "index.html");
      if (existsSync(indexPath)) {
        console.log(`[Frontend] ✅ Frontend encontrado en: ${candidate}`);
        const files = readdirSync(candidate);
        console.log(`[Frontend] Archivos: ${files.join(", ")}`);
        return candidate;
      } else {
        console.log(`[Frontend] ⚠️ Directorio existe pero falta index.html`);
      }
    } else {
      console.log(`[Frontend] ❌ No existe: ${candidate}`);
    }
  }

  // No lanzar excepción: esto se ejecuta a nivel de módulo (top-level), así
  // que un throw aquí tumbaba TODO el servidor (API, WhatsApp, Facebook,
  // pagos) solo porque el dashboard de React no estaba compilado. El bot y
  // la API no dependen del frontend — deben poder correr sin él.
  console.warn("[Frontend] ⚠️ No se encontró el frontend compilado — la API y el bot seguirán funcionando, pero el dashboard no se servirá hasta compilarlo (pnpm run build).");
  return null;
}

const frontendPath = findFrontendPath();

// Rutas de imágenes persistentes — se sirven desde el volumen de datos antes que desde git.
// IMAGE_STORE_DIR debe apuntar al path REAL donde Easypanel montó el volumen
// (revisar el mount configurado en el servicio, no asumir /app/data).
// Se calcula con getImageStoreDir() (mismo módulo que escribe las imágenes en
// disco) para que servir y guardar SIEMPRE usen la misma ruta, aunque
// IMAGE_STORE_DIR no esté seteada.
const IMAGES_DIR = getImageStoreDir();
mkdirSync(IMAGES_DIR, { recursive: true });

// ── El video del producto, servido por la app ────────────────────────────
//
// Pedido del admin: "descargalo y alojalo en la app". El enlace de Terabox
// funciona pero le pide al cliente instalar la app o registrarse, y poner una
// barrera de registro justo cuando esta decidiendo comprar es perder la venta.
//
// `sendFile` responde peticiones de rango solo, asi que el cliente puede
// adelantar el video sin bajarlo entero.
//
// ⚠️ Esto NO reproduce dentro del chat de WhatsApp: para eso el video tiene
// que ir como archivo adjunto y pesar menos de 16 MB. Lo que da es una URL
// propia que abre el video sin apps ni cuentas de por medio.
app.get("/videos/products/:filename", (req, res) => {
  const filename = req.params.filename;
  if (path.basename(filename) !== filename || !/^\d+\.(?:mp4|webm|mov|m4v)$/i.test(filename)) {
    return res.status(404).end();
  }
  const filePath = path.resolve(IMAGES_DIR, "videos", filename);
  if (!existsSync(filePath)) return res.status(404).json({ message: "Video no disponible" });
  return res.sendFile(filePath);
});

// Videos de anuncio generados por el motor propio (lib/video-anuncio.ts).
app.get("/videos/anuncios/:filename", (req, res) => {
  const filename = req.params.filename;
  if (path.basename(filename) !== filename || !/^\d+-\d+\.mp4$/i.test(filename)) return res.status(404).end();
  const filePath = path.resolve(IMAGES_DIR, "videos", "anuncios", filename);
  if (!existsSync(filePath)) return res.status(404).json({ message: "Video no disponible" });
  return res.sendFile(filePath);
});

// Servir imágenes de productos desde el volumen persistente primero
app.get("/images/products/:filename", (req, res, next) => {
  const filename = req.params.filename;
  // Never let a public image URL escape the product image directory.
  if (path.basename(filename) !== filename || !/^\d+\.(?:jpe?g|png|webp)$/i.test(filename)) {
    return res.status(404).end();
  }
  const filePath = path.resolve(IMAGES_DIR, "products", filename);
  if (existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  // Fallback al archivo estático del repositorio
  const staticPath = frontendPath ? path.resolve(frontendPath, "images/products", filename) : "";
  if (staticPath && existsSync(staticPath)) {
    return res.sendFile(staticPath);
  }
  // Legacy catalog rows can reference an image that was removed from the
  // volume. Return a neutral placeholder instead of a noisy 404 and broken
  // cards; the product can still be edited to attach a real image later.
  res.type("svg").send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#e2e8f0"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><text x="400" y="235" text-anchor="middle" font-family="Arial,sans-serif" font-size="28" fill="#475569">Imagen no disponible</text></svg>`,
  );
});


// Función para encontrar el path de la tienda pública
function findTiendaPath(): string | null {
  const candidates = [
    path.resolve("/app/packages/tienda/dist"),
    path.resolve(__dirname, "../../../packages/tienda/dist"),
    path.resolve(process.cwd(), "packages/tienda/dist"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const indexPath = path.join(candidate, "index.html");
      if (existsSync(indexPath)) {
        console.log(`[Tienda] ✅ Tienda encontrada en: ${candidate}`);
        return candidate;
      }
    }
  }
  console.log(`[Tienda] ⚠️ Tienda no encontrada`);
  return null;
}

const tiendaPath = findTiendaPath();

// Servir imágenes subidas/generadas también en /uploads/ (además de
// /images/products/ de arriba) — algunas herramientas del Architect y el
// resto del código todavía referencian esta ruta genérica sobre IMAGES_DIR.
app.use("/uploads", express.static(IMAGES_DIR, {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  etag: true,
  lastModified: true,
}));

// Servir archivos de la tienda pública en /tienda/
if (tiendaPath) {
  app.use("/tienda", express.static(tiendaPath, {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    etag: true,
    lastModified: true,
    index: false,
  }));
}

// Servir archivos estáticos del frontend admin con configuración optimizada
if (frontendPath) {
  app.use(express.static(frontendPath, {
    maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
    etag: true,
    lastModified: true,
    index: false, // No servir index.html automáticamente, lo haremos manualmente
  }));
}

// Rutas públicas que no requieren validación de SaaS
const publicRoutes = [
  "/health",
  "/ready",
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/auth/me",
  "/auth/send-verification-code",
  "/auth/verify-email",
  "/auth/verify-email-auto",
  "/auth/check-email",
  "/auth/request-password-reset",
  "/auth/verify-reset-code",
  "/auth/reset-password",
  // Estas rutas estaban acá y NO deberían -- controlan/leen la sesión de
  // WhatsApp (resetearla, pedir un pairing code, desconectar, ver el path del
  // authDir en el servidor). Al ser públicas, tenantIdFromReq() en
  // routes/whatsapp.ts caía siempre a 1 (req.tenant nunca se seteaba) y
  // cualquiera en internet, sin sesión, podía resetear/secuestrar la sesión
  // de WhatsApp del tenant por defecto. Ahora requieren sesión real, lo que
  // además es indispensable para que cada tenant controle SU propia sesión
  // en vez de que todo colapse siempre al tenant 1.
  "/webhooks/subscription",
  "/webhooks/paypal",
  "/webhooks/mercadopago",
  "/activation",
  "/public", // Endpoints públicos (productos de tienda)
  "/store", // Endpoints públicos de tienda (catalogo, layout)
  "/facebook/lead-ads/webhook", // Facebook Lead Ads webhook
  "/facebook/messenger/webhook", // Facebook Messenger webhook
  "/facebook/marketplace/webhook", // Facebook Marketplace webhook
  "/facebook/comments/webhook", // Facebook Comments webhook
  "/whatsapp-cloud/webhook", // WhatsApp Cloud API webhook (mensajes entrantes)
  "/p", // Short URLs para productos
  // Puente MCP que llama el contenedor OpenCode (cerebro de Atlas), no un
  // navegador con sesión -- tiene su PROPIA autenticación (token de turno
  // HMAC firmado, ver opencode-turn-token.ts), igual que los webhooks de
  // arriba. Sin esto, resolveTenant() exigiría una cookie de sesión que
  // OpenCode nunca va a tener.
  "/internal/mcp",
  // Formulario de la landing pública (/l/:slug): pedido, cupón, evento y
  // transportadoras. Lo usa el VISITANTE del anuncio, sin sesión; cada ruta
  // resuelve el negocio por el slug de la landing publicada. Faltaba en esta
  // lista y el pedido le daba 401 a todo cliente real (30-09-2026): solo
  // funcionaba al probarlo con la sesión del dueño abierta.
  "/landing-publica",
  // "/landing-studio" ya NO es pública (29-09-2026): sin sesión, cualquiera
  // podía reescribir la landing de cualquier negocio (/design, /chat con otro
  // landingId) y gastar los proveedores de IA del negocio 1. El panel la
  // llama desde el mismo dominio, con la cookie de sesión.
];

const isPublicRoute = (path: string) => {
  // Rutas de pricing públicas (solo GET)
  if (path === "/pricing" && !path.includes("/upgrade") && !path.includes("/subscription")) {
    return true;
  }
  
  // Permitir GET /api/pricing/:plan (detalles de un plan específico)
  if (path.match(/^\/pricing\/[^\/]+$/) && !path.includes("/upgrade") && !path.includes("/subscription")) {
    return true;
  }
  
  // "/store" es público (catálogo/layout que ve el cliente), pero "/store/admin/*"
  // NO debe serlo -- son las rutas que EDITAN la tienda de un tenant. Estaban
  // cubiertas por el mismo prefijo público "/store" y el propio router de
  // store.ts tenía el chequeo de auth como un TODO sin implementar: cualquiera,
  // sin sesión, podía hacer PUT /api/store/admin/:slug/layout sobre la tienda
  // de CUALQUIER tenant. Se excluye acá para que resolveTenant() corra y
  // store.ts pueda validar que el tenant logueado sea el dueño de esa tienda.
  if (path === "/store/admin" || path.startsWith("/store/admin/")) {
    return false;
  }

  // POST /public/fb-connect guarda el token/página de Facebook DENTRO del
  // tenant -- si queda cubierto por el "/public" público de arriba, cualquiera
  // en internet puede mandar {tenantId, userToken} sin sesión y secuestrar la
  // conexión de Facebook de OTRO negocio (o la del dueño de la plataforma,
  // ya que tenantId caía a 1 por defecto). Se excluye para que resolveTenant()
  // corra y el handler use el tenant de la sesión real, no el que manda el cliente.
  if (path === "/public/fb-connect") {
    return false;
  }

  // Comparación por SEGMENTOS, no por prefijo de texto.
  //
  // Con startsWith, la entrada "/p" (URLs cortas de producto) hacía pública a
  // "/products" —y también a "/payments" y "/pricing"—, así que resolveTenant
  // no corría, req.tenant quedaba vacío y el dashboard recibía 401 al entrar a
  // Productos: parecía que se cerraba la sesión sola. El mismo error dejaba
  // "/store" cubriendo "/storefront", etc.
  //
  // Una ruta es pública solo si coincide exacta o es un ancestro real
  // ("/p" cubre "/p/123" pero nunca "/products").
  return publicRoutes.some(route => path === route || path.startsWith(route + "/"));
};

// Middleware para resolver tenant SOLO en rutas protegidas
const resolveTenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const isPublic = isPublicRoute(req.path);
  if (isPublic) {
    return next();
  }
  resolveTenant()(req, res, next);
};

// Middleware para validar SaaS SOLO en rutas protegidas
const validateSaasMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Permitir rutas públicas sin validación
  if (isPublicRoute(req.path)) {
    return next();
  }

  // Rutas de autenticación (como check-email) deben pasar sin validación SaaS
  if (req.path.includes("/auth") || req.path.includes("/login") || req.path.includes("/register")) {
    return next();
  }

  // /pricing (incluye POST /pricing/upgrade) NUNCA debe bloquearse acá: es
  // justo la ruta que un tenant con trial vencido o plan inválido necesita
  // para pagar y arreglarlo. Antes este middleware corría igual que para
  // cualquier otra ruta protegida, así que "Trial expired -- action:
  // upgrade_plan" (línea de abajo) le devolvía 403 al cliente EN LA MISMA
  // ruta que el propio error le decía que usara para solucionarlo -- un
  // candado sin salida. resolveTenantMiddleware sigue corriendo antes que
  // esto, así que /pricing/upgrade igual recibe req.tenant real.
  if (req.path.includes("/pricing")) {
    return next();
  }

  const tenant = (req as any).tenant;
  if (!tenant) {
    logger.warn({ path: req.path }, `[validateSaaS] No tenant found`);
    return res.status(401).json({ error: "No tenant found" });
  }
  
  validateSaasPlan()(req, res, next);
};

// Middleware para validar límites SOLO en rutas protegidas
const validateLimitsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isPublicRoute(req.path)) {
    return next();
  }

  // Rutas de autenticación deben pasar sin validación de límites
  if (req.path.includes("/auth") || req.path.includes("/login") || req.path.includes("/register")) {
    return next();
  }

  // Mismo motivo que en validateSaasMiddleware: pagar/actualizar el plan no
  // puede quedar bloqueado por haber superado los límites del plan actual.
  if (req.path.includes("/pricing")) {
    return next();
  }

  validateUsageLimits()(req, res, next);
};

// Aplicar middlewares en orden correcto
app.use("/api", resolveTenantMiddleware);
app.use("/api", validateSaasMiddleware);
app.use("/api", validateLimitsMiddleware);

// ── Reseteo de pruebas y backups de emergencia ─────────────────────────────
// Protegido por sesión (resolveTenantMiddleware ya resolvió req.tenant). Borra
// SOLO los datos de prueba del tenant logueado: conversaciones, leads, pagos,
// memoria de Atlas, anuncios y tareas de marketing. Conserva productos,
// agentes, tienda, sesión de WhatsApp y suscripción. Hace backup antes de
// borrar, así que es reversible.
app.post("/api/admin/reset-pruebas", async (req, res, next) => {
  try {
    const tenantId = Number((req as any).tenant?.id);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return res.status(401).json({ error: "No autenticado" });
    const { resetearPruebas } = await import("./lib/reset-pruebas");
    const resultado = await resetearPruebas(tenantId);
    if (!resultado.ok) return res.status(500).json({ error: resultado.error || "No se pudo resetear" });
    return res.json({ ok: true, backup: resultado.backup, borrados: resultado.borrados });
  } catch (e) {
    return next(e);
  }
});

app.get("/api/admin/backups", async (req, res, next) => {
  try {
    const tenantId = Number((req as any).tenant?.id);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return res.status(401).json({ error: "No autenticado" });
    const { listarBackups } = await import("./lib/reset-pruebas");
    return res.json({ ok: true, backups: listarBackups() });
  } catch (e) {
    return next(e);
  }
});

app.post("/api/admin/restaurar", async (req, res, next) => {
  try {
    const tenantId = Number((req as any).tenant?.id);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return res.status(401).json({ error: "No autenticado" });
    const { restaurarDesdeBackup } = await import("./lib/reset-pruebas");
    const ruta = String((req.body as any)?.ruta || "");
    if (!ruta) return res.status(400).json({ error: "Falta 'ruta' del backup a restaurar" });
    const resultado = await restaurarDesdeBackup(ruta);
    if (!resultado.ok) return res.status(500).json({ error: resultado.error || "No se pudo restaurar" });
    return res.json({ ok: true, reinicioRequerido: resultado.reinicioRequerido });
  } catch (e) {
    return next(e);
  }
});

// Upload de imagen para un producto. Esta ruta debe quedar detrás de tenant
// auth y ownership: antes era pública, aceptaba SSRF y podía cambiar la imagen
// de un producto de otro negocio si se conocía su id.
app.post("/api/upload-product-image/:productId", express.json({ limit: "10mb" }), async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    const tenantId = Number((req as any).tenant?.id);
    if (!Number.isInteger(productId) || productId <= 0) return res.status(400).json({ message: "productId inválido" });
    if (!Number.isInteger(tenantId) || tenantId <= 0) return res.status(401).json({ message: "No autenticado" });

    const [owned] = await db.select({ id: products.id }).from(products).where(and(
      eq(products.id, productId),
      eq(products.tenantId, tenantId),
    )).limit(1);
    if (!owned) return res.status(404).json({ message: "Producto no encontrado" });

    const { image } = req.body;
    if (!image || typeof image !== "string") return res.status(400).json({ message: "Campo 'image' requerido" });

    const maxBytes = 8 * 1024 * 1024;
    let buffer: Buffer;
    if (image.startsWith("data:")) {
      const matches = image.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i);
      if (!matches) return res.status(400).json({ message: "Solo se aceptan imágenes JPEG, PNG o WebP" });
      buffer = Buffer.from(matches[2], "base64");
    } else {
      let remote: URL;
      try { remote = new URL(image); } catch { return res.status(400).json({ message: "URL inválida" }); }
      if (remote.protocol !== "https:") return res.status(400).json({ message: "La URL debe usar HTTPS" });
      const addresses = isIP(remote.hostname) ? [remote.hostname] : (await lookup(remote.hostname, { all: true })).map((x) => x.address);
      const privada = addresses.some((address) => {
        const normalized = address.toLowerCase();
        return normalized === "::1" || normalized.startsWith("127.") || normalized.startsWith("10.") || normalized.startsWith("192.168.") || normalized.startsWith("169.254.") || normalized.startsWith("172.") && Number(normalized.split(".")[1]) >= 16 && Number(normalized.split(".")[1]) <= 31 || normalized.startsWith("fc") || normalized.startsWith("fd");
      });
      if (privada) return res.status(400).json({ message: "La URL apunta a una red privada" });
      const resp = await fetch(remote, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
      if (resp.status >= 300 && resp.status < 400) return res.status(400).json({ message: "No se permiten redirecciones de imágenes" });
      if (!resp.ok) return res.status(502).json({ message: "No se pudo descargar la imagen" });
      const declared = Number(resp.headers.get("content-length") || 0);
      if (declared > maxBytes) return res.status(413).json({ message: "La imagen es demasiado grande" });
      const reader = resp.body?.getReader();
      if (!reader) return res.status(502).json({ message: "Respuesta de imagen inválida" });
      const chunks: Buffer[] = [];
      let total = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > maxBytes) { await reader.cancel(); return res.status(413).json({ message: "La imagen es demasiado grande" }); }
        chunks.push(Buffer.from(part.value));
      }
      buffer = Buffer.concat(chunks);
    }
    if (buffer.length === 0 || buffer.length > maxBytes) return res.status(413).json({ message: "Imagen inválida o demasiado grande" });

    const esJpeg = buffer[0] === 0xff && buffer[1] === 0xd8;
    const esPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const esWebp = buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
    if (!esJpeg && !esPng && !esWebp) return res.status(400).json({ message: "El contenido no es una imagen JPEG, PNG o WebP válida" });
    const ext = esJpeg ? "jpg" : esPng ? "png" : "webp";

    const destDir = path.resolve(IMAGES_DIR, "products");
    mkdirSync(destDir, { recursive: true });
    const filename = `${productId}.${ext}`;
    writeFileSync(path.resolve(destDir, filename), buffer, { mode: 0o640 });
    const imageUrl = `/images/products/${filename}`;
    await db.update(products).set({ imageUrl }).where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));
    return res.json({ imageUrl, message: "Imagen guardada en volumen persistente ✓" });
  } catch (err) {
    next(err);
  }
});

// Validar límites de características específicas
app.use("/api/products", (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  validateFeatureLimits("products")(req, res, next);
});

app.use("/api/agents", (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  validateFeatureLimits("agents")(req, res, next);
});

app.use("/api/conversations", (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  validateFeatureLimits("conversations")(req, res, next);
});

// Validar límites de mensajes
app.use("/api/messages", (req, res, next) => {
  if (isPublicRoute(req.path)) {
    return next();
  }
  validateMessageLimit()(req, res, next);
});

// Middleware de seguridad - Blindaje de información sensible
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  // Bloquear acceso a paths peligrosos
  if (securityShield.blockDevelopmentPaths(req.path)) {
    return res.status(403).json({
      error: "Acceso denegado",
    });
  }

  // Interceptar response para sanitizar headers
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    const sanitizedHeaders = securityShield.sanitizeResponseHeaders(
      Object.fromEntries(Object.entries(res.getHeaders() as Record<string, any>))
    );
    Object.keys(sanitizedHeaders).forEach(key => {
      res.setHeader(key, sanitizedHeaders[key]);
    });
    return originalJson(body);
  };

  next();
});

// Bloquear acceso a archivos sensibles (.env, .git, terraform, AWS, etc.)
app.use((req: Request, res: Response, next: NextFunction) => {
  const blockedPatterns = [
    /^\/\.env/,
    /^\/\.git/,
    /^\/\.aws/,
    /^\/\.secrets/,
    /^\/secrets\./,
    /^\/terraform\./,
    /^\/config\/secrets/,
    /^\/config\/master\.key/,
    /^\/wp-config\.php/,
    /^\/application\.(properties|yml|yaml)$/,
    /^\/appsettings\.(json|Development\.json|Production\.json)$/,
    /^\/root\//,
    /^\/home\//,
    /docker-compose/,
  ];

  if (blockedPatterns.some(pattern => pattern.test(req.path))) {
    logger.warn({ path: req.path }, "🚨 Intento de acceso a archivo sensible bloqueado");
    return res.status(403).json({ error: "Acceso denegado" });
  }

  next();
});

app.use("/api/woocommerce", woocommerceRouter);
app.use("/api/dropi", dropiRouter);
app.use("/api/telegram", telegramRouter);
app.use("/api/webhooks/subscription", subscriptionWebhooksRouter);
app.use("/api/activation", activationRouter);
// El catálogo de IA por proveedor (claves, modelos disponibles, prueba de
// conexión) existía completo en routes/ai-catalog.ts pero NUNCA se montó: cada
// una de sus rutas devolvía 404. Por eso en el panel "los modelos de algunos
// proveedores no aparecen" -- no es que falten en la lista, es que la ruta que
// los trae no existía. Un archivo de rutas sin montar es código muerto que
// parece funcionalidad.
app.use("/api/ai", aiCatalogRouter);
app.use("/api", router);

// Short URL redirect: /p/:productId → /tienda/:slug/producto/:productId
// Landing pública (/l/:slug) y su formulario de pedido: sin sesión, con el
// dominio de la app. Va ANTES del /api con middlewares de tenant y del SPA.
app.use(landingPublicaRouter);

app.get("/p/:productId", async (req, res, next) => {
  try {
    const { db, products, tenants, paymentLinks } = await import("@workspace/db");
    const { eq, sql: sqlRaw } = await import("drizzle-orm");
    const codigo = String(req.params.productId || "");

    // Los ENLACES DE PAGO también viven en /p/, con un código alfanumérico
    // (ver URLShortener en payments.ts: `${baseUrl}/p/${shortCode}`). Esta
    // ruta solo resolvía ids NUMÉRICOS de producto y devolvía 404 para todo lo
    // demás, así que TODOS los enlaces de pago acortados estaban rotos: el
    // cliente recibía por WhatsApp "Tarjeta / PSE: .../p/nvZ22t", hacía clic y
    // le salía "no encontrado". Es el último paso antes de pagar -- ahí se
    // pierde la venta entera.
    if (!/^\d+$/.test(codigo)) {
      const [enlace] = await db
        .select()
        .from(paymentLinks)
        .where(eq(paymentLinks.shortCode, codigo))
        .limit(1);
      if (!enlace?.originalUrl) return res.status(404).send("Enlace no encontrado o vencido");
      // Se cuenta el clic para saber cuántos llegan hasta la pasarela; que
      // falle el conteo NUNCA puede impedir el pago.
      db.update(paymentLinks)
        .set({ clicks: sqlRaw`${paymentLinks.clicks} + 1` })
        .where(eq(paymentLinks.id, enlace.id))
        .catch(() => {});
      // 302 y no 301: un enlace de pago puede regenerarse, y un 301 queda
      // cacheado en el navegador del cliente apuntando a un checkout viejo.
      return res.redirect(302, enlace.originalUrl);
    }

    const productId = parseInt(codigo, 10);
    if (isNaN(productId)) return res.status(404).send("Producto no válido");
    const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!p) return res.status(404).send("Producto no encontrado");
    const [t] = await db.select().from(tenants).where(eq(tenants.id, p.tenantId)).limit(1);
    const slug = t?.slug || "sofia-premium";
    const appUrl = process.env.APP_URL || "";
    const base = appUrl.replace(/\/+$/, "");
    return res.redirect(301, `${base}/tienda/${slug}/producto/${productId}`);
  } catch (e) {
    return next(e);
  }
});

// SPA fallback para la tienda pública en /tienda/* y sus dos rutas de
// administración propias, que su router (packages/tienda) define SIN el
// prefijo /tienda -- BrowserRouter ahí no tiene basename, así que /editor y
// /admin están pensadas para pegarle directo a la raíz del dominio (ej.
// ventasproia.com/editor), no a ventasproia.com/tienda/editor.
//
// Antes esta condición SOLO reconocía /tienda/*, así que /editor y /admin
// caían al fallback general de más abajo, que sirve el index.html de
// ventas-pro (la app de administración) -- un SPA completamente distinto
// que no tiene ninguna ruta "/editor" en SU router, así que no renderizaba
// nada: la página quedaba en blanco, sin ningún error visible.
//
// EXACTO, no por prefijo: ventas-pro SÍ tiene rutas reales bajo /admin/*
// (/admin/store, /admin/tenants) -- matchear por prefijo redirigiría esas
// páginas reales al SPA equivocado. La tienda solo navega a "/admin" a
// secas (nunca a una subruta), así que el match exacto no le falta nada.
/**
 * Inyecta el título y las etiquetas Open Graph del producto en el HTML de la
 * tienda, para las URLs que apuntan a un producto concreto.
 *
 * Por qué hace falta: la tienda es un SPA. WhatsApp, Facebook e Instagram NO
 * ejecutan JavaScript cuando arman la vista previa de un enlace -- leen el
 * HTML tal como sale del servidor. Ese HTML es el mismo para todas las rutas,
 * así que hasta ahora TODO enlace compartido mostraba el título de la
 * plantilla ("ProStore | Solución E-commerce Profesional") y ninguna imagen.
 *
 * Reportado por el admin (2026-08-16) y verificado: cero etiquetas og:* en
 * /tienda/<slug>/producto/<id> y en /p/<id>. Importa el doble acá porque los
 * anuncios pagos llevan a esas URLs y el agente de WhatsApp las manda en cada
 * conversación: el cliente ve un enlace sin foto ni nombre y desconfía.
 *
 * Devuelve null si la ruta no es de producto (para no pagar una consulta a la
 * base en cada carga de la tienda), o una promesa del HTML ya modificado.
 */
/**
 * Título y metadatos de la PORTADA de una tienda (/tienda/:slug).
 *
 * La plantilla trae un título fijo -- "ProStore | Solución E-commerce
 * Profesional" -- que se veía en la pestaña de todas las tiendas. Para un
 * cliente que llega desde un anuncio de "VentasPro" y aterriza en una página
 * que dice "TecnoVariedades" con la pestaña en "ProStore", son tres marcas
 * distintas en la misma pantalla: se lee como estafa antes del primer mensaje.
 * Acá se pone el nombre REAL de esa tienda.
 */
function metaDeTienda(rutaUrl: string): Promise<string | null> | null {
  const m = rutaUrl.match(/^\/tienda\/([^/]+)\/?$/);
  if (!m || !tiendaPath) return null;
  const slug = m[1]!;

  return (async () => {
    try {
      const { db, stores } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [tienda] = await db.select().from(stores).where(eq(stores.slug, slug)).limit(1);
      if (!tienda) return null;

      const indexPath = path.join(tiendaPath!, "index.html");
      let html = readFileSync(indexPath, "utf8");
      const esc = (s: string) =>
        String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const appUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
      const nombre = String(tienda.name || "Tienda");
      const desc = `Cursos y productos digitales de ${nombre}. Acceso inmediato después de la compra.`;

      // ── Icono de la pestaña: el del NEGOCIO, no el de VentasPro ────────
      // La tienda es la marca del cliente. Si cargó logo, ese es el icono;
      // si no, se genera uno con su color y su inicial. Antes no había
      // ningún icono (index.html no enlazaba favicon) y la pestaña salía con
      // el globo gris del navegador.
      const { iconoDeTienda } = await import("./lib/icono-de-tienda");
      const { tenants } = await import("@workspace/db");
      const [negocio] = await db.select({ brandLogo: tenants.brandLogo, brandColors: tenants.brandColors }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
      const icono = iconoDeTienda({ nombre, logo: (negocio as any)?.brandLogo || null, color: (negocio as any)?.brandColors?.primary || null, appUrl });
      html = html.replace(/<link rel="icon"[^>]*>\s*/i, "").replace(/<meta name="theme-color"[^>]*>\s*/i, "");

      const tags = [
        `<title>${esc(nombre)}</title>`,
        `<link rel="icon" href="${esc(icono.href)}"${icono.tipo ? ` type="${icono.tipo}"` : ""}>`,
        `<link rel="apple-touch-icon" href="${esc(icono.href)}">`,
        `<meta name="theme-color" content="${esc(icono.color)}">`,
        `<meta name="description" content="${esc(desc)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${esc(nombre)}">`,
        `<meta property="og:title" content="${esc(nombre)}">`,
        `<meta property="og:description" content="${esc(desc)}">`,
        `<meta property="og:url" content="${esc(`${appUrl}${rutaUrl}`)}">`,
      ].join("\n    ");

      html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n    ${tags}`);
      return html;
    } catch (e: any) {
      logger.warn({ err: e?.message, slug }, "[Tienda] No se pudieron armar los metadatos de la portada");
      return null;
    }
  })();
}

function metaDeProducto(rutaUrl: string): Promise<string | null> | null {
  const m = rutaUrl.match(/^\/tienda\/[^/]+\/producto\/(\d+)\/?$/) || rutaUrl.match(/^\/p\/(\d+)\/?$/);
  if (!m) return null;
  const productId = Number(m[1]);
  if (!Number.isFinite(productId)) return null;

  return (async () => {
    try {
      const { db, products } = await import("@workspace/db");
      const { eq } = await import("drizzle-orm");
      const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
      if (!p || !tiendaPath) return null;

      const indexPath = path.join(tiendaPath, "index.html");
      let html = readFileSync(indexPath, "utf8");

      const appUrl = (process.env.APP_URL || "https://ventasproia.com").replace(/\/+$/, "");
      const abs = (u: string) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `${appUrl}/${String(u).replace(/^\/+/, "")}`);

      const esc = (s: string) =>
        String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

      const nombre = String(p.name || "Producto");
      const precio = p.price ? `$${Number(p.price).toLocaleString("es-CO")} ${p.currency || "COP"}` : "";
      // La primera línea de la descripción es el resumen del curso; el resto
      // son los beneficios, que no aportan a una vista previa.
      const resumen = String(p.description || "").split(/\r?\n/)[0].replace(/^[^\p{L}\p{N}]+/u, "").trim();
      const titulo = precio ? `${nombre} — ${precio}` : nombre;
      const descripcion = (resumen || nombre).slice(0, 200);
      const imagen = abs(String(p.imageUrl || ""));
      const url = `${appUrl}${rutaUrl}`;

      // Misma regla que la portada: el icono de la pestaña es el del negocio.
      const { tenants } = await import("@workspace/db");
      const [negocio] = await db.select({ name: tenants.name, brandName: tenants.brandName, brandLogo: tenants.brandLogo, brandColors: tenants.brandColors }).from(tenants).where(eq(tenants.id, Number((p as any).tenantId))).limit(1);
      const { iconoDeTienda } = await import("./lib/icono-de-tienda");
      const icono = iconoDeTienda({ nombre: String((negocio as any)?.brandName || (negocio as any)?.name || "Tienda"), logo: (negocio as any)?.brandLogo || null, color: (negocio as any)?.brandColors?.primary || null, appUrl });
      html = html.replace(/<link rel="icon"[^>]*>\s*/i, "").replace(/<meta name="theme-color"[^>]*>\s*/i, "");

      const tags = [
        `<title>${esc(titulo)}</title>`,
        `<link rel="icon" href="${esc(icono.href)}"${icono.tipo ? ` type="${icono.tipo}"` : ""}>`,
        `<meta name="theme-color" content="${esc(icono.color)}">`,
        `<meta name="description" content="${esc(descripcion)}">`,
        `<meta property="og:type" content="product">`,
        `<meta property="og:title" content="${esc(titulo)}">`,
        `<meta property="og:description" content="${esc(descripcion)}">`,
        `<meta property="og:url" content="${esc(url)}">`,
        imagen ? `<meta property="og:image" content="${esc(imagen)}">` : "",
        imagen ? `<meta property="og:image:width" content="1200">` : "",
        imagen ? `<meta property="og:image:height" content="630">` : "",
        `<meta name="twitter:card" content="${imagen ? "summary_large_image" : "summary"}">`,
        `<meta name="twitter:title" content="${esc(titulo)}">`,
        `<meta name="twitter:description" content="${esc(descripcion)}">`,
        imagen ? `<meta name="twitter:image" content="${esc(imagen)}">` : "",
      ].filter(Boolean).join("\n    ");

      // Se reemplaza el <title> de la plantilla en vez de sumar otro: dos
      // títulos dejan que el rastreador elija, y suele quedarse con el
      // primero -- el genérico.
      html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
      html = html.replace(/<head([^>]*)>/i, `<head$1>\n    ${tags}`);
      return html;
    } catch (e: any) {
      logger.warn({ err: e?.message, productId }, "[Tienda] No se pudieron armar los metadatos del producto");
      return null;
    }
  })();
}

const TIENDA_OWN_ROUTES = new Set(["/editor", "/admin"]);
app.use((req, res, next) => {
  const isPublicStorePath =
    req.path === "/tienda" ||
    req.path.startsWith("/tienda/") ||
    TIENDA_OWN_ROUTES.has(req.path);
  if (isPublicStorePath && tiendaPath) {
    const indexPath = path.join(tiendaPath, "index.html");
    if (existsSync(indexPath)) {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      // Metadatos por producto: sin esto, compartir el enlace de un producto
      // no muestra NADA (ver metaDeProducto). Se resuelve antes de responder.
      const meta = metaDeProducto(req.path) || metaDeTienda(req.path);
      if (meta) {
        return meta
          .then((html) => (html ? res.send(html) : res.sendFile(indexPath)))
          .catch(() => res.sendFile(indexPath));
      }
      return res.sendFile(indexPath);
    }
  }
  // Never fall through to the admin SPA. A missing public-store build must be
  // visible as an operational error, not as a dashboard rendered at /tienda.
  if (isPublicStorePath) {
    return res.status(503).send("La tienda pública no está disponible temporalmente.");
  }
  next();
});

// Extensiones de archivos estáticos. Si express.static no los encontró, NO
// deben caer en el fallback de la SPA: devolver index.html con 200 hace que
// una imagen faltante "cargue bien" y el navegador muestre un roto sin causa
// visible — y peor, el bot llegaba a mandar ese HTML por WhatsApp creyendo
// que era la foto del producto. Un 404 dice la verdad.
const ASSET_EXT = /\.(jpe?g|png|gif|webp|avif|svg|ico|bmp|mp4|webm|mp3|wav|pdf|zip|css|js|mjs|map|woff2?|ttf|eot|json|txt|xml)$/i;

app.use((req, res, next) => {
  // Solo manejar rutas que NO son API
  if (req.path.startsWith("/api")) {
    return next();
  }

  if (ASSET_EXT.test(req.path)) {
    return res.status(404).json({ error: "Not found", path: req.path });
  }

  console.log(`[Frontend] Serving index.html for path: ${req.path}`);
  const indexPath = frontendPath ? path.join(frontendPath, "index.html") : null;

  if (indexPath && existsSync(indexPath)) {
    // Configurar headers para SPA
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(indexPath);
  } else {
    console.error(`[Frontend] ❌ index.html not found at: ${indexPath}`);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - Frontend no disponible</title>
          <style>
            body { font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto; }
            h1 { color: #dc2626; }
            pre { background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>❌ Frontend no disponible</h1>
          <p>El frontend no se pudo cargar. Información de debug:</p>
          <pre>
Frontend Path: ${frontendPath}
Index Path: ${indexPath}
Exists: ${existsSync(indexPath)}
NODE_ENV: ${process.env.NODE_ENV}
__dirname: ${__dirname}
process.cwd(): ${process.cwd()}
          </pre>
          <p>Por favor, verifica que el frontend se haya compilado correctamente.</p>
        </body>
      </html>
    `);
  }
});

export default app;
