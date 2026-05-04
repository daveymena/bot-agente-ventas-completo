import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import healthRouter from "./health";
import { logger } from "./lib/logger";
import { resolveTenant } from "./lib/tenantManager";
import { whatsapp } from "./lib/whatsapp";

// Auto-start WhatsApp bot on boot
whatsapp.start().catch(err => {
  logger.error({ err }, "[WhatsApp] Failed to auto-start bot on boot");
});

// Auto-start AI Processor (Orchestrator) on boot
import { getAgentOrchestrator } from "./lib/services/agent-orchestrator";
const orchestrator = getAgentOrchestrator();
orchestrator.configureTenant("1", { enabled: true, processingIntervalMs: 1500 });
logger.info("[AgentOrchestrator] AI processing auto-started for default tenant");

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
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoints (sin autenticación)
app.use("/api", healthRouter);

// Servir frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.resolve(__dirname, "../../ventas-pro/dist/public");

app.use(express.static(frontendPath));

// Resolución de tenant multi-inquilino - SOLO para rutas de API
app.use("/api", resolveTenant());

app.use("/api", router);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(frontendPath, "index.html"));
});

export default app;
