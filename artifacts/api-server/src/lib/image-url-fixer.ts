/**
 * ============================================================
 * IMAGE URL FIXER - Corregir URLs de imágenes en productos
 * ============================================================
 * Asegura que todos los productos tengan imageUrl correcto
 */

import { db, products } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

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
  async fixAllProductImages(tenantId: number): Promise<{
    fixed: number;
    withImages: number;
    withoutImages: number;
  }> {
    try {
      const allProducts = await db
        .select()
        .from(products)
        .where(eq(products.tenantId, tenantId));

      let fixed = 0;
      let withImages = 0;
      let withoutImages = 0;

      for (const product of allProducts) {
        if (product.imageUrl && product.imageUrl.startsWith("/images/")) {
          withImages++;
          continue; // Ya tiene URL correcta
        }

        // Corregir URL
        const correctUrl = `/images/products/${product.id}.jpg`;
        await db
          .update(products)
          .set({ imageUrl: correctUrl })
          .where(eq(products.id, product.id));

        fixed++;

        if (!product.imageUrl) {
          withoutImages++;
        }
      }

      logger.info(
        { tenantId, fixed, withImages, withoutImages },
        "✅ Product image URLs fixed"
      );

      return { fixed, withImages, withoutImages };
    } catch (error) {
      logger.error({ error, tenantId }, "❌ Error fixing all product images");
      throw error;
    }
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
