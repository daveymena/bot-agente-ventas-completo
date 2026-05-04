import { Router } from "express";
import { db, conversations, messages, leads, activityEvents, products } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

// Endpoint especial de limpieza profunda
router.post("/deep-clean", async (req, res) => {
  try {
    const { confirm = false } = req.body;
    
    if (!confirm) {
      return res.status(400).json({ error: "Debes confirmar la limpieza profunda" });
    }

    logger.info("[Clean] Iniciando limpieza profunda de la base de datos...");

    // Borrar interacciones en orden para respetar FKs si existen
    await db.delete(messages);
    await db.delete(conversations);
    await db.delete(leads);
    await db.delete(activityEvents);

    logger.info("[Clean] Reparando imágenes de productos...");
    
    // Corregir dominio Pexels a Unsplash (IDs compatibles)
    await db.execute(sql`
      UPDATE products 
      SET image_url = REPLACE(image_url, 'pexels.com', 'unsplash.com')
      WHERE image_url LIKE '%pexels.com%';
    `);

    // Poner fallback a imágenes vacías o nulas
    await db.execute(sql`
      UPDATE products 
      SET image_url = 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800'
      WHERE image_url IS NULL OR image_url = '' OR image_url = 'null';
    `);

    logger.info("[Clean] Limpieza y reparación completada con éxito.");

    return res.json({ 
      success: true, 
      message: "Base de datos de interacciones reseteada completamente. Los productos han sido preservados." 
    });
  } catch (e: any) {
    logger.error(e, "[Clean] Error en Deep Clean");
    return res.status(500).json({ error: e.message });
  }
});

export default router;
