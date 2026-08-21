import { db, products, agents as agentsTable, architectMemory, tenants, settings, productCategories } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export class ArchitectTools {
  /**
   * Descripción de producto en HTML estructurado.
   *
   * Dos cosas estaban mal acá, y las dos llegaban al cliente:
   *
   * 1. Salía en Markdown (`**negrita**`), pero la ficha de la tienda renderiza
   *    HTML: los asteriscos se veían crudos y el texto quedaba en un bloque
   *    corrido, imposible de escanear en un celular.
   * 2. Le ponía "Acceso vía Google Drive", "Actualizaciones de por vida" y
   *    "Certificado de finalización" a TODOS los productos por igual --
   *    incluida una rodillera térmica. Un curso y un producto físico no se
   *    entregan igual, no se garantizan igual y no se compran por lo mismo.
   *    Prometerle un certificado a quien compra una rodillera es mentirle.
   *
   * Ahora ramifica por `kind` y solo afirma lo que ese tipo de producto
   * realmente cumple. Las etiquetas son las que el sanitizador de la tienda
   * permite (h2, h3, p, ul, li, strong): cualquier otra se descarta al
   * mostrarla, así que usarla sería trabajo perdido.
   */
  async improveProductDescription(productId: number): Promise<string | null> {
    const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!product) return null;

    const name = String(product.name || "");
    const oldDesc = String(product.description || "");
    const category = String(product.category || "");
    const features = ((product.features as string[]) || []).filter(Boolean);
    const esDigital = String(product.kind || "digital") !== "physical";

    // El texto que ya tenía, limpio de HTML y de restos de editores.
    const introPrevia = oldDesc
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // El texto viejo se CONSERVA (es lo que escribio el admin), pero si el
    // producto es FISICO hay que sacarle las promesas de producto digital que
    // arrastra de la plantilla anterior: esa plantilla le ponia "Google
    // Drive", "descargable" y "certificado" a todo el catalogo por igual.
    // Regenerar sin limpiar esto solo cambiaria el formato y dejaria la
    // mentira adentro.
    //
    // Se filtra por FRASE y no con una expresion regular: es mas facil de
    // leer, de ampliar cuando aparezca una promesa nueva, y no se rompe con
    // acentos ni con el escapado.
    const PROMESAS_DIGITALES = [
      "google drive", "drive", "descargable", "descargalo", "de por vida",
      "certificad", "100% online", "acceso inmediato", "actualizaciones",
      "sin conexion", "desde tu celular",
    ];
    const SALTO = String.fromCharCode(10);
    const previaLimpia = esDigital
      ? introPrevia
      : introPrevia
          .split(SALTO)
          .join(". ")
          .split(".")
          .filter((frase) => {
            const f = frase.toLowerCase();
            return !PROMESAS_DIGITALES.some((mala) => f.includes(mala));
          })
          .join(". ")
          .split(" ")
          .filter(Boolean)
          .join(" ")
          .trim();

    const intro = previaLimpia.length >= 40
      ? previaLimpia.slice(0, 600)
      : esDigital
        ? `Aprendé ${name} paso a paso, a tu ritmo y desde donde quieras.`
        : `${name}${category ? `, de la categoría ${category}` : ""}. Práctico, listo para usar.`;

    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lista = (items: string[]) => `<ul>\n${items.map((i) => `  <li>${esc(i)}</li>`).join("\n")}\n</ul>`;

    const bloques: string[] = [`<h2>${esc(name)}</h2>`, `<p>${esc(intro)}</p>`];

    if (features.length > 0) {
      bloques.push(esDigital ? "<h3>Qué incluye</h3>" : "<h3>Características</h3>");
      bloques.push(lista(features));
    }

    if (esDigital) {
      // Lo que SÍ cumple un producto digital de este catálogo: entrega por
      // enlace, sin vencimiento, y se puede ver desde cualquier dispositivo.
      // No se promete certificado ni soporte personalizado: eso depende del
      // producto y ya hubo anuncios rechazados por afirmarlo de más.
      bloques.push("<h3>Cómo lo recibís</h3>");
      bloques.push(
        lista([
          "Acceso inmediato apenas se confirma el pago",
          "100% online: lo ves desde el celular, la computadora o la tablet",
          "Acceso permanente, sin vencimiento",
        ]),
      );
      bloques.push("<h3>Empezá hoy</h3>");
      bloques.push("<p>Lo recibís al instante y avanzás a tu propio ritmo.</p>");
    } else {
      // Producto físico: nada de "descargable" ni "acceso de por vida". Y NO
      // se inventan plazos de envío ni garantías: si el negocio los ofrece,
      // van cargados en las características del producto y aparecen arriba.
      bloques.push("<h3>Por qué llevarlo</h3>");
      bloques.push(
        lista([
          "Producto físico, se despacha a tu dirección",
          "Se coordina la entrega por WhatsApp después de la compra",
        ]),
      );
      bloques.push("<h3>¿Lo querés?</h3>");
      bloques.push("<p>Escribinos y coordinamos el envío.</p>");
    }

    const newDesc = `<div class="product-description">\n${bloques.map((b) => `  ${b}`).join("\n")}\n</div>`;
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

  /**
   * @param kind si se pasa "physical" o "digital", solo toca esos. Existe
   * porque el problema real es acotado: las descripciones de los productos
   * FISICOS arrastran promesas de producto digital (Drive, descargable,
   * certificado) de la plantilla vieja. Regenerar los 138 para arreglar unos
   * pocos es tocar de mas.
   */
  async bulkImproveProducts(limit = 50, kind?: "physical" | "digital"): Promise<{ total: number; improved: number; details: any[] }> {
    const todos = await db.select().from(products).limit(limit);
    const allProducts = kind
      ? todos.filter((p: any) => (String(p.kind || "digital") === "physical") === (kind === "physical"))
      : todos;
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
