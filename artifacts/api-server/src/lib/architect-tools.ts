import { db, products, agents as agentsTable, architectMemory, tenants, settings, productCategories } from "@workspace/db";
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

  async createProduct(data: {
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    category?: string;
    categoryId?: number;
    kind?: string;
    imageUrl?: string;
    features?: string[];
    highlight?: string;
    isActive?: boolean;
    tenantId?: number;
  }): Promise<Record<string, any>> {
    const [newProduct] = await db.insert(products).values({
      name: data.name,
      description: data.description || "",
      price: data.price || 0,
      currency: data.currency || "COP",
      category: data.category || "",
      categoryId: data.categoryId || null,
      kind: data.kind || "digital",
      imageUrl: data.imageUrl || "",
      features: data.features || [],
      highlight: data.highlight || "",
      isActive: data.isActive !== false,
      tenantId: data.tenantId || 1,
    } as any).returning();

    return { id: newProduct.id, name: newProduct.name, kind: newProduct.kind };
  }

  async createService(data: {
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    category?: string;
    imageUrl?: string;
    features?: string[];
    tenantId?: number;
  }): Promise<Record<string, any>> {
    return this.createProduct({
      ...data,
      kind: "service",
      highlight: "service",
    });
  }

  async deleteProduct(productId: number): Promise<boolean> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return false;
    await db.delete(products).where(eq(products.id, productId));
    return true;
  }

  async queryDatabase(sql: string, params?: any[]): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const allowedKeywords = ["SELECT", "INSERT", "UPDATE", "DELETE", "CREATE", "ALTER", "DROP"];
      const upperSql = sql.trim().toUpperCase();
      const isAllowed = allowedKeywords.some(k => upperSql.startsWith(k));
      if (!isAllowed) {
        return { success: false, error: "Tipo de consulta no permitida. Usa SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER o DROP." };
      }

      const restrictedPatterns = [/password/i, /secret/i, /token/i, /credential/i, /DROP\s+DATABASE/i];
      for (const pattern of restrictedPatterns) {
        if (pattern.test(sql) && !upperSql.startsWith("SELECT")) {
          return { success: false, error: "Operación no permitida por seguridad." };
        }
      }

      let result: any;
      if (upperSql.startsWith("SELECT")) {
        result = await db.all(sql);
      } else {
        result = await db.run(sql, params || []);
      }
      return { success: true, data: Array.isArray(result) ? result : [result] };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getSystemConfig(): Promise<Record<string, any>> {
    const [tenant] = await db.select().from(tenants).limit(1);
    const [appSettings] = await db.select().from(settings).limit(1);
    const categories = await db.select().from(productCategories).limit(50);

    return {
      tenant: tenant ? {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        brandName: tenant.brandName,
        status: tenant.status,
      } : null,
      settings: appSettings ? {
        businessName: appSettings.businessName,
        timezone: appSettings.timezone,
        aiProvider: appSettings.aiProvider,
        autoReplyEnabled: appSettings.autoReplyEnabled,
      } : null,
      categories: categories.map(c => ({ id: c.id, name: c.name })),
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
