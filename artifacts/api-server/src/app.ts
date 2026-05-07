import express, { type Express } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { resolveTenant } from "./lib/tenantManager";
import { whatsapp } from "./lib/whatsapp";

// Auto-start WhatsApp bot on boot
whatsapp.start().catch(err => {
  logger.error({ err }, "[WhatsApp] Failed to auto-start bot on boot");
});

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

// Resolución de tenant multi-inquilino
app.use(resolveTenant());

app.use("/api", router);

// Servir frontend en producción
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.resolve(__dirname, "../../ventas-pro/dist");

app.use(express.static(frontendPath));

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(frontendPath, "index.html"));
});

export default app;
