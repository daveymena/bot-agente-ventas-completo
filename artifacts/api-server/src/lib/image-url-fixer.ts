/**
 * ============================================================
 * IMAGE URL FIXER - Corregir URLs de imágenes en productos
 * ============================================================
 * Asegura que todos los productos tengan imageUrl correcto
 * y que las imágenes existan en disco.
 */

import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

export class ImageUrlFixer {
  /**
   * Corregir URLs de imágenes para un producto
   */
  async fixProductImage(productId: number, tenantId: number): Promise<string> {
    try {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, productId));

      if (!product) {
        return this.getDefaultImageUrl();
      }

      // Si ya tiene una URL relativa correcta, retornarla
      if (product.imageUrl && product.imageUrl.startsWith("/images/")) {
        return product.imageUrl;
      }

      // Si tiene URL pero es incorrecta, reconstruirla
      if (product.imageUrl) {
        // Extraer extensión o usar .jpg por defecto
        const ext = product.imageUrl.includes(".")
          ? product.imageUrl.split(".").pop()
          : "jpg";
        const correctUrl = `/images/products/${productId}.${ext}`;

        // Actualizar en BD
        await db
          .update(products)
          .set({ imageUrl: correctUrl })
          .where(eq(products.id, productId));

        return correctUrl;
      }

      // Si no tiene imagen, generar URL estándar y retornar default
      const defaultUrl = `/images/products/${productId}.jpg`;

      // Intentar actualizar (pero es opcional, puede que no exista la imagen)
      try {
        await db
          .update(products)
          .set({ imageUrl: defaultUrl })
          .where(eq(products.id, productId));
      } catch (e) {
        // Ignorar si falla la actualización
      }

      return this.getDefaultImageUrl();
    } catch (error) {
      logger.error({ error, productId }, "❌ Error fixing image URL");
      return this.getDefaultImageUrl();
    }
  }

  /**
   * Corregir URLs de TODOS los productos de un tenant
   */
  async fixAllProductImages(tenantId?: number): Promise<{
    fixed: number;
    withImages: number;
    withoutImages: number;
    downloaded: number;
    respetados: number;
  }> {
    try {
      const IMAGES_DIR = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");
      const allProducts = tenantId
        ? await db.select().from(products).where(eq(products.tenantId, tenantId))
        : await db.select().from(products);

      let fixed = 0;
      let withImages = 0;
      let withoutImages = 0;
      let downloaded = 0;
      let respetados = 0;

      for (const product of allProducts) {
        if (product.imageUrl && product.imageUrl.startsWith("/images/")) {
          withImages++;
          continue; // Ya tiene URL correcta
        }

        // ── ESTE "ARREGLO" ERA EL QUE ROMPÍA LAS FOTOS DE DROPI ───────────
        //
        // Acá se reescribía la URL de TODOS los productos a
        // `/images/products/{id}.jpg` -- existiera o no ese archivo. O sea
        // que a un producto de Dropi con su foto remota funcionando le pisaba
        // la URL con una ruta local vacía, y quedaba roto. Y corre en CADA
        // arranque, antes del que baja las imágenes: aunque alguien la
        // arreglara a mano, el siguiente reinicio la volvía a romper.
        //
        // El admin lo reportó el 2026-09-02: "las imágenes de los productos
        // de Dropi están rotas o no se ven".
        //
        // Ahora la ruta local solo se escribe si el ARCHIVO existe. Si no, se
        // deja lo que había: una URL remota que funciona vale infinitamente
        // más que una local que no.
        const archivo = path.join(IMAGES_DIR, "products", `${product.id}.jpg`);
        if (!existsSync(archivo)) {
          if (product.imageUrl) {
            respetados++;
            continue;
          }
          // Sin archivo Y sin URL: no hay nada que escribir. Poner una ruta
          // inventada solo cambia "sin foto" por "foto rota".
          withoutImages++;
          continue;
        }

        const correctUrl = `/images/products/${product.id}.jpg`;
        await db
          .update(products)
          .set({ imageUrl: correctUrl })
          .where(eq(products.id, product.id));

        fixed++;
      }

      logger.info(
        { tenantId: tenantId ?? "todos", fixed, withImages, withoutImages, downloaded, respetados },
        "✅ Product image URLs fixed"
      );

      return { fixed, withImages, withoutImages, downloaded, respetados };
    } catch (error) {
      logger.error({ error, tenantId }, "❌ Error fixing all product images");
      throw error;
    }
  }

  /**
   * Re-descargar imágenes de productos físicos desde metadata (Dropi/WooCommerce)
   */
  /**
   * Re-descarga las fotos de los productos físicos que se rompieron.
   *
   * `tenantId` opcional: sin él, TODOS los negocios. Antes era obligatorio y
   * `app.ts` lo llamaba con un 1 escrito a mano, así que en un SaaS solo se
   * reparaban las imágenes de UN cliente y las de los demás quedaban rotas
   * para siempre, sin que nadie se enterara.
   */
  async downloadPhysicalImages(tenantId?: number): Promise<{
    downloaded: number;
    failed: number;
    skipped: number;
    limpiados: number;
  }> {
    const IMAGES_DIR = process.env.IMAGE_STORE_DIR || path.resolve(process.cwd(), "data/images");

    const allProducts = tenantId
      ? await db.select().from(products).where(eq(products.tenantId, tenantId))
      : await db.select().from(products);

    const physicalProducts = allProducts.filter((p: any) => p.kind === "physical");
    let downloaded = 0;
    let failed = 0;
    let skipped = 0;
    let limpiados = 0;

    for (const product of physicalProducts) {
      // ── ¿Ya tiene una foto SERVIBLE en disco? ──────────────────────────
      //
      // No alcanza con que el archivo exista. Una descarga que se corta deja
      // un archivo de 0 bytes, y una respuesta de error de la CDN deja un
      // HTML de 200 bytes con extensión .jpg. Los dos "existen", los dos se
      // salteaban, y los dos se ven rotos en la ficha -- para siempre, porque
      // el reparador nunca los volvía a mirar.
      //
      // 1 KB es el corte: no hay foto de producto real por debajo de eso.
      const imgPath = path.join(IMAGES_DIR, "products", `${product.id}.jpg`);
      if (existsSync(imgPath)) {
        let usable = false;
        try { usable = statSync(imgPath).size > 1024; } catch { usable = false; }
        if (usable) {
          skipped++;
          continue;
        }
        logger.warn({ productId: product.id }, "Imagen en disco pero vacía o corrupta: se vuelve a bajar");
      }

      // Intentar obtener URL original del metadata
      let originalUrl: string | null = null;
      try {
        const meta = JSON.parse(product.metadata || "{}");
        if (meta.imageUrls && Array.isArray(meta.imageUrls) && meta.imageUrls.length > 0) {
          originalUrl = meta.imageUrls[0];
        }
      } catch (e) {
        // Metadata inválido
      }

      if (!originalUrl) {
        // ── Sin forma de recuperarla: se BORRA el enlace ─────────────────
        //
        // Dejar apuntando a una URL muerta hace que el navegador dibuje el
        // ícono de imagen rota, que se ve peor que no tener foto. Con el
        // campo vacío, la tienda y la ficha caen a su marcador de posición,
        // que al menos se ve intencional.
        //
        // Solo se limpia lo que apunta AFUERA: un `/images/products/N.jpg`
        // se deja, porque el archivo puede volver en la próxima ronda.
        if (product.imageUrl && /^https?:\/\//i.test(String(product.imageUrl))) {
          await db.update(products).set({ imageUrl: null }).where(eq(products.id, product.id));
          limpiados++;
        }
        failed++;
        continue;
      }

      // Descargar imagen
      try {
        const { saveProductImage } = await import("./image-store");
        const saved = await saveProductImage(originalUrl, product.id);
        if (saved) {
          await db.update(products).set({ imageUrl: saved }).where(eq(products.id, product.id));
          downloaded++;
          logger.info({ productId: product.id }, "✅ Image downloaded from source");
        } else {
          // No se pudo copiar al volumen. Si además el enlace de afuera está
          // muerto, se limpia por el mismo motivo de arriba.
          if (product.imageUrl && /^https?:\/\//i.test(String(product.imageUrl))) {
            const vive = await this.validateImageUrl(String(product.imageUrl));
            if (!vive) {
              await db.update(products).set({ imageUrl: null }).where(eq(products.id, product.id));
              limpiados++;
            }
          }
          failed++;
        }
      } catch (e) {
        failed++;
        logger.error({ productId: product.id, error: e }, "❌ Failed to download image");
      }
    }

    logger.info(
      { tenantId: tenantId ?? "todos", downloaded, failed, skipped, limpiados },
      "📦 Physical image download complete"
    );

    return { downloaded, failed, skipped, limpiados };
  }

  /**
   * Generar URL de imagen por defecto (placeholder SVG)
   */
  getDefaultImageUrl(): string {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 400'%3E%3Crect fill='%23f1f5f9' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%2394a3b8' font-size='24' font-family='sans-serif'%3ESin imagen%3C/text%3E%3C/svg%3E";
  }

  /**
   * Validar que una URL de imagen sea accesible
   */
  async validateImageUrl(imageUrl: string): Promise<boolean> {
    try {
      // Si es data URL, es válida
      if (imageUrl.startsWith("data:")) {
        return true;
      }

      // Si es URL relativa, asumir que existe
      if (imageUrl.startsWith("/")) {
        return true;
      }

      // Si es URL absoluta, intentar fetch
      if (imageUrl.startsWith("http")) {
        const response = await fetch(imageUrl, { method: "HEAD" });
        return response.ok;
      }

      return false;
    } catch (error) {
      logger.warn({ imageUrl, error }, "⚠️ Image URL validation failed");
      return false;
    }
  }

  /**
   * Obtener imagen compatible con parámetros
   * Usado por el endpoint que sirve imágenes
   */
  getImagePath(productId: number): string {
    return `/images/products/${productId}.jpg`;
  }
}

export const imageUrlFixer = new ImageUrlFixer();
