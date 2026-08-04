import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { errorHandler } from "../lib/error-handler";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import agentsRouter from "./agents";
import conversationsRouter from "./conversations";
import leadsRouter from "./leads";
import productsRouter from "./products";
import categoriesRouter from "./categories";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import brandingRouter from "./branding";
import codeAgentRouter from "./code-agent";
import aiCatalogRouter from "./ai-catalog";
import webhooksRouter from "./webhooks";
import syncRouter from "./sync";
import paymentRedirectRouter from "./paymentRedirect";
import tenantsRouter from "./tenants";
import usageRouter from "./usage";
import analyticsRouter from "./analytics";
import paymentsRouter from "./payments";
import paymentCredentialsRouter from "./payment-credentials";
import emailCredentialsRouter from "./email-credentials";
import cleanRouter from "./clean";
import authRouter from "./auth";
import storeRouter from "./store";
import publicRouter from "./public";
import facebookRouter from "./facebook";
import facebookCredentialsRouter from "./facebook-credentials";
import personalityProfilesRouter from "./personality-profiles";
import architectMemoryRouter from "./architect-memory";
import responseAnalyticsRouter from "./response-analytics";
import architectToolsRouter from "./architect-tools";
import architectRouter from "./architect";
import pricingRouter from "./pricing";
import tenantConfigRouter from "./tenant-config";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/agents", agentsRouter);
router.use("/conversations", conversationsRouter);
router.use("/leads", leadsRouter);
router.use("/products", productsRouter);
router.use("/categories", categoriesRouter);
router.use("/dashboard", dashboardRouter);
router.use("/settings", settingsRouter);
router.use("/branding", brandingRouter);
router.use("/code-agent", codeAgentRouter);
router.use("/ai", aiCatalogRouter);
router.use("/webhooks", webhooksRouter);
router.use("/sync", syncRouter);
router.use("/p", paymentRedirectRouter);
router.use("/tenants", tenantsRouter);
router.use("/usage", usageRouter);
router.use("/analytics", analyticsRouter);
router.use("/payments", paymentCredentialsRouter);
router.use("/email-config", emailCredentialsRouter);
router.use("/payments", paymentsRouter);
router.use("/clean", cleanRouter);
router.use("/auth", authRouter);
router.use("/store", storeRouter);
router.use("/public", publicRouter);
router.use("/facebook", facebookRouter);
// Credenciales por tenant: debe montarse explícitamente; el router general de
// Facebook no contiene /credentials y antes el frontend recibía 404.
router.use("/facebook", facebookCredentialsRouter);
router.use("/personality-profiles", personalityProfilesRouter);
router.use("/architect-memory", architectMemoryRouter);
router.use("/response-analytics", responseAnalyticsRouter);
router.use("/architect-tools", architectToolsRouter);
router.use("/architect", architectRouter);
// Antes montado directamente en app.ts ANTES de resolveTenantMiddleware
// (línea ~276, con el comentario "sin autenticación para GET, con
// autenticación para POST" -- pero al montarse tan temprano, NINGUNA ruta
// de este router pasaba nunca por resolveTenantMiddleware, ni siquiera
// POST /pricing/upgrade). Acá, dentro de la cadena protegida normal,
// isPublicRoute() en app.ts sigue dejando pasar sin sesión los GET
// públicos (listado de planes), pero /upgrade y /current/info sí reciben
// req.tenant real.
router.use("/pricing", pricingRouter);
router.use("/tenant-config", tenantConfigRouter);

// Usar el manejador de errores centralizado
router.use(errorHandler);

export default router;
