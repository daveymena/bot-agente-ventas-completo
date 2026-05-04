import { Router, type IRouter } from "express";
import { URLShortener } from "../lib/payments";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * Handle short payment link redirects
 * Route: GET /p/:shortCode
 */
router.get("/:shortCode", async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    
    if (!shortCode || shortCode.length !== 6) {
      return res.status(404).json({ 
        error: "Link no válido",
        message: "El código de enlace no es válido" 
      });
    }

    const originalUrl = await URLShortener.resolveShortLink(shortCode);
    
    if (!originalUrl) {
      return res.status(404).json({ 
        error: "Link no encontrado",
        message: "Este enlace de pago ha expirado o no existe" 
      });
    }

    logger.info({ 
      shortCode, 
      originalUrl: originalUrl.slice(0, 50) + "...",
      userAgent: req.get('User-Agent'),
      ip: req.ip 
    }, "[PaymentRedirect] Redirecting to payment");

    // Redirect to the original payment URL
    return res.redirect(302, originalUrl);
    
  } catch (error) {
    logger.error({ error, shortCode: req.params.shortCode }, "[PaymentRedirect] Error processing redirect");
    return res.status(500).json({ 
      error: "Error interno",
      message: "Hubo un problema procesando el enlace de pago" 
    });
  }
});

/**
 * Get payment link analytics (optional)
 * Route: GET /p/:shortCode/stats
 */
router.get("/:shortCode/stats", async (req, res, next) => {
  try {
    const { shortCode } = req.params;
    
    // This could be expanded to show click analytics
    // For now, just confirm the link exists
    const originalUrl = await URLShortener.resolveShortLink(shortCode);
    
    if (!originalUrl) {
      return res.status(404).json({ 
        error: "Link no encontrado" 
      });
    }

    return res.json({
      shortCode,
      exists: true,
      message: "Link válido"
    });
    
  } catch (error) {
    logger.error({ error }, "[PaymentRedirect] Error getting stats");
    return res.status(500).json({ 
      error: "Error interno" 
    });
  }
});

export default router;