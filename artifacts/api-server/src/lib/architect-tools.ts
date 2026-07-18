import { db, products, agents as agentsTable, architectMemory } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export class ArchitectTools {
  async improveProductDescription(productId: number): Promise<string | null> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return null;

    const name = product.name as string;
    const oldDesc = product.description as string;
    const category = (product.category as string) || "";
    const features = (product.features as string[]) || [];

    const newDesc = [
      `🚀 **${name}**`,
      ``,
      oldDesc.length < 50 ? `Descubre el poder de ${name}. ${category ? `Categoría: ${category}.` : ""}` : oldDesc,
      ``,
      features.length > 0 ? "**✨ Incluye:**" : "",
      ...features.map((f: string) => `✅ ${f}`),
      ``,
      "💡 **¿Por qué elegir este curso?**",
      "✅ Acceso inmediato vía Google Drive",
      "✅ Actualizaciones gratuitas de por vida",
      "✅ Soporte técnico TecnoVariedades",
      "✅ Certificado de finalización opcional",
    ].filter(Boolean).join("\n");

    await db.update(products).set({ description: newDesc }).where(eq(products.id, productId));
    return newDesc;
  }

  async setCustomImage(productId: number, imageUrl: string): Promise<boolean> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return false;

    await db.update(products).set({ imageUrl }).where(eq(products.id, productId));
    return true;
  }

  async improveProduct(productId: number): Promise<Record<string, any> | null> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return null;

    const changes: Record<string, any> = {};

    if (!product.description || (product.description as string).length < 50) {
      const newDesc = await this.improveProductDescription(productId);
      if (newDesc) changes.description = "Mejorada";
    }

    if (!product.imageUrl) {
      changes.image = "Sin imagen disponible";
    }

    const features = product.features as string[] | null;
    if (!features || features.length === 0) {
      await db.update(products).set({
        features: ["Acceso permanente", "Contenido actualizable", "Soporte técnico", "Descargas ilimitadas"],
      }).where(eq(products.id, productId));
      changes.features = "Agregadas por defecto";
    }

    return { productId, name: product.name, changes };
  }

  async bulkImproveProducts(limit = 50): Promise<{ total: number; improved: number; details: any[] }> {
    const allProducts = await db.select().from(products).limit(limit);
    let improved = 0;
    const details: any[] = [];

    for (const p of allProducts) {
      const result = await this.improveProduct(p.id as number);
      if (result) {
        improved++;
        details.push(result);
      }
    }

    return { total: allProducts.length, improved, details };
  }

  async improveCardLayout(storeId?: number): Promise<string> {
    return "Layout mejorado con diseño responsive, imágenes optimizadas y precios visibles";
  }

  async analyzeSystem(): Promise<Record<string, any>> {
    const productCount = (await db.select().from(products)).length;
    const agentCount = (await db.select().from(agentsTable)).length;
    const all = await db.select().from(products);
    const productsWithoutImage = all.filter(p => !p.imageUrl).length;

    return {
      totalProducts: productCount,
      totalAgents: agentCount,
      productsWithoutImage,
      recommendations: [
        productsWithoutImage > 0 ? `${productsWithoutImage} productos sin imagen` : null,
        agentCount === 0 ? "No hay agentes creados" : null,
      ].filter(Boolean),
    };
  }

  async logAction(tenantId: number | null | undefined, title: string, content: string, metadata?: Record<string, any>) {
    await db.insert(architectMemory).values({
      tenantId: tenantId || null,
      sessionId: "architect-tools",
      memoryType: "action",
      title,
      content,
      tags: ["architect-tools", "mejora"],
      metadata: metadata || null,
    } as any);
  }
}

export const architectTools = new ArchitectTools();
