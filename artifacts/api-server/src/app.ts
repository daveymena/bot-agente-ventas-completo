import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readdirSync } from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./health";
import pricingRouter from "./routes/pricing";
import woocommerceRouter from "./routes/woocommerce";
import subscriptionWebhooksRouter from "./routes/subscription-webhooks";
import activationRouter from "./routes/activation";
import { logger } from "./lib/logger";
import { resolveTenant } from "./lib/tenantManager";
import { validateSaasPlan, validateUsageLimits } from "./middleware/saasValidation";
import { validateFeatureLimits, validateMessageLimit } from "./middleware/featureLimits";
import { whatsapp } from "./lib/whatsapp";
import { getAllTemplates } from "./lib/agent-templates";
import { db, agents, tenants, settings } from "@workspace/db";
import { ensureDbReady } from "@workspace/db";
import { eq } from "drizzle-orm";

// Auto-start WhatsApp bot on boot
whatsapp.start().catch(err => {
  logger.error({ err }, "[WhatsApp] Failed to auto-start bot on boot");
});

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

    // Auto-seed tenant (admin user) if not exists
    const existingTenants = await db.select().from(tenants).limit(1);
    if (existingTenants.length === 0) {
      console.log("👤 Creando tenant por defecto...");
      const crypto = await import("crypto");
      const passwordHash = crypto.createHash("sha256").update("6715320D").digest("hex");
      await db.insert(tenants).values({
        name: "Davey Mena",
        email: "daveymena16@gmail.com",
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
      console.log("✅ Tenant creado: daveymena16@gmail.com / 6715320D");
    }

    // Auto-seed settings if not exists
    const existingSettings = await db.select().from(settings).limit(1);
    if (existingSettings.length === 0) {
      await db.insert(settings).values({
        businessName: "TecnoVariedades",
        businessDescription: "Tienda virtual de productos digitales y servicios tecnológicos",
        timezone: "America/Bogota",
        aiProvider: "nvidia_nim_bridge",
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
  } catch (error) {
    console.error("❌ Error en auto-seed:", error);
  }
})();

const app: Express = express();

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

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
    exposedHeaders: ["Set-Cookie"],
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware de debugging para cookies
app.use((req, res, next) => {
  console.log(`[COOKIES] Path: ${req.path}`);
  console.log(`[COOKIES] All cookies: ${JSON.stringify(req.cookies)}`);
  console.log(`[COOKIES] tenant_id: ${req.cookies?.tenant_id}`);
  console.log(`[COOKIES] Headers Cookie: ${req.headers.cookie}`);
  
  // Agregar header para debugging
  res.setHeader('X-Debug-Cookies', JSON.stringify(req.cookies));
  
  next();
});

// Health check endpoints (sin autenticación)
app.use("/api", healthRouter);

// Pricing endpoints (sin autenticación para GET, con autenticación para POST)
app.use("/api/pricing", pricingRouter);

// Servir frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Función para encontrar el path correcto del frontend
function findFrontendPath(): string {
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

  throw new Error("❌ No se pudo encontrar el directorio del frontend compilado");
}

const frontendPath = findFrontendPath();

// Servir archivos estáticos con configuración optimizada
app.use(express.static(frontendPath, {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true,
  lastModified: true,
  index: false, // No servir index.html automáticamente, lo haremos manualmente
}));

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
  "/auth/request-password-reset",
  "/auth/verify-reset-code",
  "/auth/reset-password",
  "/whatsapp/connect",
  "/whatsapp/status",
  "/whatsapp/test-ia",
  "/whatsapp/session-info",
  "/webhooks/subscription",
  "/activation",
  "/public", // Endpoints públicos (productos de tienda)
  "/store", // Endpoints públicos de tienda (catalogo, layout)
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
  
  // Todas las demás rutas de pricing requieren autenticación
  return publicRoutes.some(route => path.startsWith(route));
};

// Middleware para resolver tenant SOLO en rutas protegidas
const resolveTenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const isPublic = isPublicRoute(req.path);
  console.log(`[resolveTenant] Path: ${req.path}, IsPublic: ${isPublic}, Cookies: ${JSON.stringify(req.cookies)}`);
  
  if (isPublic) {
    console.log(`[resolveTenant] Ruta pública, saltando resolución de tenant`);
    return next();
  }
  
  console.log(`[resolveTenant] Ruta protegida, resolviendo tenant...`);
  resolveTenant()(req, res, next);
};

// Middleware para validar SaaS SOLO en rutas protegidas
const validateSaasMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Permitir rutas públicas sin validación
  if (isPublicRoute(req.path)) {
    console.log(`[validateSaaS] Ruta pública permitida: ${req.path}`);
    return next();
  }
  
  const tenant = (req as any).tenant;
  if (!tenant) {
    console.log(`[validateSaaS] No tenant found for path: ${req.path}`);
    return res.status(401).json({ error: "No tenant found" });
  }
  
  const plan = tenant.plan;
  console.log(`[validateSaaS] Validating plan: "${plan}" for tenant ${tenant.id}`);
  
  validateSaasPlan()(req, res, next);
};

// Middleware para validar límites SOLO en rutas protegidas
const validateLimitsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isPublicRoute(req.path)) {
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

app.use("/api/woocommerce", woocommerceRouter);
app.use("/api/webhooks/subscription", subscriptionWebhooksRouter);
app.use("/api/activation", activationRouter);
app.use("/api", router);

app.use((req, res, next) => {
  // Solo manejar rutas que NO son API
  if (req.path.startsWith("/api")) {
    return next();
  }
  
  console.log(`[Frontend] Serving index.html for path: ${req.path}`);
  const indexPath = path.join(frontendPath, "index.html");
  
  if (existsSync(indexPath)) {
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
