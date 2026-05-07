import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import healthRouter from "./health";
import whatsappRouter from "./whatsapp";
import agentsRouter from "./agents";
import conversationsRouter from "./conversations";
import leadsRouter from "./leads";
import productsRouter from "./products";
import categoriesRouter from "./categories";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import codeAgentRouter from "./code-agent";
import webhooksRouter from "./webhooks";
import syncRouter from "./sync";
import paymentRedirectRouter from "./paymentRedirect";
import tenantsRouter from "./tenants";
import usageRouter from "./usage";
import analyticsRouter from "./analytics";
import paymentsRouter from "./payments";
import cleanRouter from "./clean";
import authRouter from "./auth";
import subscriptionsRouter from "./subscriptions";
import woocommerceRouter from "./woocommerce";
import nichesRouter from "./niches";

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
router.use("/code-agent", codeAgentRouter);
router.use("/webhooks", webhooksRouter);
router.use("/sync", syncRouter);
router.use("/p", paymentRedirectRouter);
router.use("/tenants", tenantsRouter);
router.use("/usage", usageRouter);
router.use("/analytics", analyticsRouter);
router.use("/payments", paymentsRouter);
router.use("/clean", cleanRouter);
router.use("/auth", authRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/woocommerce", woocommerceRouter);
router.use("/niches", nichesRouter);

router.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    req.log?.warn({ err }, "Zod validation failed");
    return res.status(400).json({ message: "Datos inválidos", issues: err.issues });
  }
  req.log?.error({ err }, "Unhandled API error");
  const message = err instanceof Error ? err.message : "Error inesperado";
  return res.status(500).json({ message });
});

export default router;
