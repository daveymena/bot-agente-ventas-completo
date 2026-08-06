import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import { randomBytes } from "node:crypto";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./health";
import woocommerceRouter from "./routes/woocommerce";
import subscriptionWebhooksRouter from "./routes/subscription-webhooks";
import activationRouter from "./routes/activation";
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
import { eq } from "drizzle-orm";
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

    // AUTO-SEED DESHABILITADO temporalmente por schema mismatch
    // TODO: migrar schema de BD antes de habilitar
    return;

    /*
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
          model: "gpt-4o-mini",
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
      const possiblePaths = [
        path.resolve(process.cwd(), "products-full.json"),
        path.resolve(__dirname, "../../products-full.json"),
        path.resolve(__dirname, "../../../products-full.json"),
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
    (async () => {
      try {
        const allProducts = await db.select().from(products).limit(1);
        if (allProducts.length > 0) {
          const result = await imageUrlFixer.fixAllProductImages(1);
          if (result.fixed > 0) {
            console.log(
              `✅ ${result.fixed} product image URLs fixed (was ${result.withoutImages} without images)`
            );
          }
        }
      } catch (err) {
        console.warn("⚠️ Could not auto-fix product images on startup:", err);
      }
    })();
    */
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

// Upload de imagen (base64) para un producto
app.post("/api/upload-product-image/:productId", express.json({ limit: "10mb" }), async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ message: "productId inválido" });

    const { image } = req.body;
    if (!image || typeof image !== "string") return res.status(400).json({ message: "Campo 'image' requerido (base64 o URL)" });

    let buffer: Buffer;
    let ext = "jpg";

    if (image.startsWith("data:")) {
      const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) return res.status(400).json({ message: "Formato base64 inválido" });
      ext = matches[1] === "jpeg" ? "jpg" : matches[1];
      buffer = Buffer.from(matches[2], "base64");
    } else if (image.startsWith("http")) {
      const resp = await fetch(image, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) return res.status(502).json({ message: "No se pudo descargar la imagen" });
      const contentType = resp.headers.get("content-type") || "";
      if (contentType.includes("jpeg")) ext = "jpg";
      else if (contentType.includes("png")) ext = "png";
      else if (contentType.includes("webp")) ext = "webp";
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      return res.status(400).json({ message: "Formato no soportado. Envía data:image/... base64 o una URL http" });
    }

    const destDir = path.resolve(IMAGES_DIR, "products");
    mkdirSync(destDir, { recursive: true });
    const filename = `${productId}.${ext}`;
    writeFileSync(path.resolve(destDir, filename), buffer);

    const imageUrl = `/images/products/${filename}`;

    // Actualizar en BD
    try {
      await db.update(products).set({ imageUrl }).where(eq(products.id, productId));
    } catch {
      logger.warn({ productId }, "[UploadImage] No se pudo actualizar imageUrl en BD");
    }

    return res.json({ imageUrl, message: "Imagen guardada en volumen persistente ✓" });
  } catch (err) {
    next(err);
  }
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
  "/p", // Short URLs para productos
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
app.use("/api/webhooks/subscription", subscriptionWebhooksRouter);
app.use("/api/activation", activationRouter);
app.use("/api", router);

// Short URL redirect: /p/:productId → /tienda/:slug/producto/:productId
app.get("/p/:productId", async (req, res, next) => {
  try {
    const { db, products, tenants } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const productId = parseInt(req.params.productId, 10);
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
