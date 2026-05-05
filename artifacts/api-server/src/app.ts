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
import { logger } from "./lib/logger";
import { resolveTenant } from "./lib/tenantManager";
import { validateSaasPlan, validateUsageLimits } from "./middleware/saasValidation";
import { validateFeatureLimits, validateMessageLimit } from "./middleware/featureLimits";
import { whatsapp } from "./lib/whatsapp";
import { getAllTemplates } from "./lib/agent-templates";
import { agents } from "@workspace/db";
import { eq } from "drizzle-orm";

// Auto-start WhatsApp bot on boot
whatsapp.start().catch(err => {
  logger.error({ err }, "[WhatsApp] Failed to auto-start bot on boot");
});

// Auto-start AI Processor (Orchestrator) on boot
import { getAgentOrchestrator } from "./lib/services/agent-orchestrator";
const orchestrator = getAgentOrchestrator();
orchestrator.configureTenant("1", { enabled: true, processingIntervalMs: 1500 });
logger.info("[AgentOrchestrator] AI processing auto-started for default tenant");

// Auto-seed agents if they don't exist
(async () => {
  try {
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
    console.error("❌ Error creando agentes:", error);
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
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://0.0.0.0:5173"],
    credentials: true, // ¡CRÍTICO! Esto permite que las cookies de sesión se guarden y envíen
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
  console.log(`[COOKIES] Headers: ${JSON.stringify(req.headers.cookie)}`);
  next();
});

// Health check endpoints (sin autenticación)
app.use("/api", healthRouter);

// Pricing endpoints (sin autenticación para GET, con autenticación para POST)
app.use("/api/pricing", pricingRouter);

// Servir frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// En producción (Docker), usar path absoluto desde /app
// En desarrollo, usar path relativo
const frontendPath = process.env.NODE_ENV === "production"
  ? path.resolve("/app/artifacts/ventas-pro/dist/public")
  : path.resolve(__dirname, "../../ventas-pro/dist/public");

console.log(`[Frontend] NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`[Frontend] __dirname: ${__dirname}`);
console.log(`[Frontend] Serving static files from: ${frontendPath}`);

// Verificar que el directorio existe
if (existsSync(frontendPath)) {
  console.log(`[Frontend] ✅ Directory exists`);
  const files = readdirSync(frontendPath);
  console.log(`[Frontend] Files in directory: ${files.join(", ")}`);
} else {
  console.error(`[Frontend] ❌ Directory does NOT exist: ${frontendPath}`);
}

app.use(express.static(frontendPath));

// Rutas públicas que no requieren validación de SaaS
const publicRoutes = [
  "/health",
  "/ready",
  "/pricing",
  "/auth/register",
  "/auth/login",
  "/auth/logout",
  "/auth/me", // ¡IMPORTANTE! Permitir verificación de sesión sin validación SaaS
  "/whatsapp/test-ia", // Endpoint de prueba para testing
];

const isPublicRoute = (path: string) => publicRoutes.some(route => path.startsWith(route));

// Middleware para resolver tenant SOLO en rutas protegidas
const resolveTenantMiddleware = (req: Request, res: Response, next: NextFunction) => {
  console.log(`[resolveTenant] Path: ${req.path}, Cookies: ${JSON.stringify(req.cookies)}`);
  
  if (isPublicRoute(req.path)) {
    return next();
  }
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

app.use("/api", router);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  console.log(`[Frontend] Serving index.html for path: ${req.path}`);
  const indexPath = path.join(frontendPath, "index.html");
  if (existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    console.error(`[Frontend] ❌ index.html not found at: ${indexPath}`);
    res.status(404).send("Frontend not found");
  }
});

export default app;
