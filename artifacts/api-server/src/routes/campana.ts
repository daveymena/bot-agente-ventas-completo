/**
 * CAMPAÑA EN UN CLIC — la puerta HTTP
 * ===================================
 *
 * Lo que Atlas hace conversando, acá lo dispara el panel. Esta ruta NO
 * reimplementa el flujo: llama a `generarCampana`, que a su vez encadena las
 * mismas herramientas del operador (`fb_suggest_audience` y `crear_anuncio`).
 * Una sola verdad, dos puertas de entrada (Atlas y frontend).
 *
 *   POST /api/campana/generar
 *     { producto, dailyBudget, objetivo?, destinoWeb?, subirAMeta?, conSegmentacion? }
 *   → { ok, resumen, pasos[], productoId, draftId, copy }
 *
 * Regla de la casa: nada se inventa. Si falta el producto o el presupuesto, o
 * si Meta/Dropi rechazan, vuelve `ok:false` con el motivo en palabras del
 * negocio y sin borrador. Nunca un "éxito" vacío.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { generarCampana, type ObjetivoDeCampana } from "../lib/campana-un-clic";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const OBJETIVOS: readonly ObjetivoDeCampana[] = ["ventas", "trafico", "mensajes", "reconocimiento"];

/** Solo se acepta un objetivo conocido: uno inventado elige mal a quién le muestra Meta el anuncio. */
function objetivoValido(v: unknown): ObjetivoDeCampana | undefined {
  const s = String(v || "").trim().toLowerCase();
  return (OBJETIVOS as readonly string[]).includes(s) ? (s as ObjetivoDeCampana) : undefined;
}

router.post("/generar", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = Number((req as any).tenant?.id) || 0;
    if (!tenantId) return res.status(401).json({ message: "No hay sesión. Iniciá sesión de nuevo." });

    const body = (req.body ?? {}) as any;
    const destinoWeb = body.destinoWeb === "landing" ? "landing" : body.destinoWeb === "tienda" ? "tienda" : undefined;

    const r = await generarCampana(tenantId, {
      producto: String(body.producto || ""),
      dailyBudget: Number(body.dailyBudget) || 0,
      objetivo: objetivoValido(body.objetivo),
      destinoWeb,
      subirAMeta: body.subirAMeta === true,
      // La segmentación es sugerencia: solo se saltea si el panel la apaga.
      conSegmentacion: body.conSegmentacion !== false,
    });

    logger.info(
      { tenantId, ok: r.ok, draftId: r.draftId, pasos: r.pasos.map((p) => `${p.paso}:${p.ok}`).join(",") },
      "[Campana] Generación de campaña desde el panel",
    );

    return res.json(r);
  } catch (e: any) {
    logger.error({ err: e?.message }, "[Campana] No se pudo generar la campaña");
    return next(e);
  }
});

/**
 * POST /api/campana/gifs
 *   { productId, cuantos?, lado? }
 * → { ok, error?, clips[], guardado }
 *
 * Recorta 2-4 tramos del video del producto (o anima sus fotos) a WebP cuadrado
 * y los guarda EN EL PRODUCTO (`metadata.gifs`), para que la landing y el
 * anuncio lean el mismo activo.
 *
 * Es sincrónico a propósito: son 2-4 recortes de 3 s (~10-20 s). Cuando el
 * dueño lo pida desde varios productos a la vez, se mueve a segundo plano con
 * aviso, igual que el video de anuncio (`video-anuncio.generarVideoEnSegundoPlano`).
 */
router.post("/gifs", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenantId = Number((req as any).tenant?.id) || 0;
    if (!tenantId) return res.status(401).json({ message: "No hay sesión. Iniciá sesión de nuevo." });

    const body = (req.body ?? {}) as any;
    const productId = Number(body.productId) || 0;
    if (!productId) return res.status(400).json({ message: "Falta el producto." });

    const { generarGifsDelProducto } = await import("../lib/gifs-de-producto");
    const r = await generarGifsDelProducto(tenantId, productId, {
      cuantos: Number(body.cuantos) || undefined,
      lado: Number(body.lado) || undefined,
    });

    logger.info(
      { tenantId, productId, ok: r.ok, clips: r.clips.length, guardado: r.guardado },
      "[Campana] Recortes de producto",
    );
    return res.json(r);
  } catch (e: any) {
    logger.error({ err: e?.message }, "[Campana] No se pudieron generar los recortes");
    return next(e);
  }
});

export default router;
