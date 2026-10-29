/**
 * Ruta API para generar landings profesionales via LandingForge.
 *
 * GET  /api/landingforge/status  — verificar conexión con LandingForge
 * POST /api/landingforge/generate — generar landing para un producto
 * GET  /api/landingforge/list     — listar landings existentes
 */

import { Router } from "express";
import { getOrCreateLanding, generateMagicLanding, listLandings } from "../lib/landingforge-client";

const router = Router();

/** Verificar estado de LandingForge y proveedores de IA */
router.get("/status", async (_req, res) => {
  try {
    const BASE = process.env.LANDINGFORGE_URL || "http://localhost:3000";
    const r = await fetch(`${BASE}/api/generate`);
    const data = await r.json();
    res.json({ ok: true, landingforge: data, url: BASE });
  } catch (e) {
    res.status(502).json({ ok: false, error: (e as Error).message });
  }
});

/** Generar landing profesional para un producto */
router.post("/generate", async (req, res) => {
  try {
    const { productUrl, productName, productKind, title, size } = req.body;

    if (!productUrl) {
      return res.status(400).json({ ok: false, error: "productUrl es requerido" });
    }

    const result = await getOrCreateLanding(
      productName || "Producto",
      productUrl,
      productKind || "physical",
      { tenantId: (req as any).tenant?.id ?? null },
    );

    return res.json(result);
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

/** Listar landings generadas */
router.get("/list", async (_req, res) => {
  try {
    const data = await listLandings();
    res.json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});

export default router;
