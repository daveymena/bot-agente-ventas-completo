import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { config, ensureDirs, packageRoot } from "./config";
import { attachUser } from "./lib/auth";
import { errorMiddleware } from "./lib/http";
import { publicRouter } from "./routes/public";
import { assetsRouter } from "./routes/assets";
import { authRouter } from "./routes/auth";
import { collectionsRouter } from "./routes/collections";
import { billingRouter, licensesRouter } from "./routes/billing";
import { contributorRouter } from "./routes/contributor";
import { adminRouter } from "./routes/admin";
import { aiRouter } from "./routes/ai";


export function createApp() {
  ensureDirs();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "stock", brand: config.brand.name, at: new Date().toISOString() }));

  app.use("/api", publicRouter);
  app.use("/api", assetsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/collections", collectionsRouter);
  app.use("/api/billing", billingRouter);
  app.use("/api/licenses", licensesRouter);
  app.use("/api/contributor", contributorRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/ai", aiRouter);

  // Derivados públicos (miniaturas / previsualizaciones con marca de agua). Inmutables por nombre.
  app.use("/media", express.static(config.publicDir, { maxAge: "30d", immutable: true, fallthrough: true, index: false }));

  app.use("/api", (_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

  // Interfaz compilada (producción). En desarrollo la sirve Vite con proxy a /api y /media.
  const clientDir = [path.join(packageRoot, "dist", "public"), path.resolve(process.cwd(), "dist", "public")].find((d) => fs.existsSync(path.join(d, "index.html")));
  if (clientDir) {
    app.use(express.static(clientDir, { maxAge: "1h", index: false }));
    app.get(/^(?!\/api|\/media).*/, (_req, res) => res.sendFile(path.join(clientDir, "index.html")));
  }

  app.use(errorMiddleware);
  return app;
}
