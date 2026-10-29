/**
 * AGENCIA PRO — Puerta HTTP
 * =========================
 *   POST /api/agencia/pro/pack
 *     { productId, objetivo?, presupuestoDiario?, fb?: auto }
 *   → { ok, pack, draftIds, scoreGlobal, validado }
 *
 * Flag: requiere AGENCIA_PRO=1 o businessConfig.agenciaPro = true.
 * No reemplaza /api/campana/generar (AdStrategist legacy) — convive.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { logger } from "../lib/logger";
import { generarPackPro, estaAgenciaProActiva } from "../lib/agencia/pro/agente-anuncios-pro";

const router: IRouter = Router();

router.post("/pack", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = Number((req as any).tenant?.id) || 0;
    if (!tenantId) return res.status(401).json({ message: "No hay sesión." });

    const activa = await estaAgenciaProActiva(tenantId);
    if (!activa) return res.status(403).json({ message: "Agencia Pro no activa. Actívala con AGENCIA_PRO=1 o en Configuración." });

    const body = (req.body ?? {}) as any;
    const productId = Number(body.productId || body.productoId) || 0;
    if (!productId) return res.status(400).json({ message: "Falta productId." });

    // fb conector opcional — si no hay credenciales, el research cae a referencias ES+EN + ficha real
    let fb: any = null;
    try {
      const { getFacebookService } = await import("../lib/facebook");
      fb = await getFacebookService(tenantId);
      if (fb && !fb.isConfigured?.()) fb = null;
    } catch { fb = null; }

    const pack = await generarPackPro({
      tenantId,
      productId,
      objetivo: String(body.objetivo || "mensajes"),
      presupuestoDiario: Number(body.presupuestoDiario) || undefined,
      fb,
    });

    logger.info({ tenantId, productId, scoreGlobal: pack.scoreGlobal, draftIds: pack.draftIds }, "[AgenciaPro] Pack entregado");

    return res.json({
      ok: true,
      pack: {
        producto: pack.productName,
        objetivo: pack.objetivo,
        scoreGlobal: pack.scoreGlobal,
        validado: pack.validado,
        draftIds: pack.draftIds,
        enPausa: pack.enPausa,
        research: { hooks: pack.research.hooksPro.slice(0, 3), problema: pack.research.problemaPrincipal.slice(0, 180) },
        copy: pack.copy.variants.map(v => ({ headline: v.headline, cta: v.cta, arquetipo: v.arquetipo })),
        creativo: { imagenes: pack.creativo.imagenes.map(i => ({ rol: i.rol, hook: i.hookEnImagen, formato: i.formato })), validacion: pack.creativo.validacion },
        video: { sigla: pack.video.sigla, voz: pack.video.vozRecomendada, escenas: pack.video.guion.length },
      },
    });
  } catch (e: any) {
    logger.error({ err: e?.message }, "[AgenciaPro] No se pudo generar pack");
    return next(e);
  }
});

router.get("/packs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = Number((req as any).tenant?.id) || 0;
    if (!tenantId) return res.status(401).json({ message: "No hay sesión." });
    const { packsProDelTenant } = await import("../lib/agencia/pro/agente-anuncios-pro");
    const packs = await packsProDelTenant(tenantId);
    return res.json({ ok: true, packs });
  } catch (e: any) { return next(e); }
});

export default router;
