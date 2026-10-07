import { Router } from "express";
import { requirePlatformOwner } from "../middleware/requirePlatformOwner";
import { enlaceDeEntradaForge } from "../lib/landingforge-client";

/**
 * GET /api/landing-forge/entrar → redirige al panel de Landing Forge con la
 * sesión ya abierta (enlace firmado de 2 minutos). Solo el dueño de la
 * plataforma: las landings de Forge son las suyas, no las de los clientes del
 * SaaS. Es lo que abre el botón "Landing Studio" del menú.
 */
const router = Router();

router.get("/entrar", requirePlatformOwner(), (req, res) => {
  const siguiente = String(req.query.next || "/");
  res.redirect(302, enlaceDeEntradaForge(siguiente.startsWith("/") && !siguiente.startsWith("//") ? siguiente : "/"));
});

export default router;
