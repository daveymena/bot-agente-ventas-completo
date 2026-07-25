/**
 * ============================================================
 * APP OPERATOR — Arquitecto IA con poderes reales de ejecución
 * ============================================================
 *
 * A diferencia del Arquitecto clásico (que solo devuelve una config del agente),
 * el Operador PUEDE EJECUTAR acciones reales sobre la aplicación: crear/editar
 * productos, categorías, el agente, settings y la tienda — como si fuera el
 * programador/administrador del sistema, todo por conversación.
 *
 * Protocolo portable (funciona con cualquier modelo OpenAI-compatible):
 * el modelo responde SIEMPRE en JSON:
 *   { "reply": "...", "actions": [ { "tool": "create_product", "args": {...} } ], "done": true|false }
 * El backend ejecuta cada acción, devuelve los resultados al modelo y repite
 * hasta que el modelo marca done:true (o se alcanza el límite de pasos).
 */

import { db, products, productCategories, agents, settings, stores } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "./logger";

export interface OperatorContext {
  tenantId: number;
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  data?: any;
}

interface ToolDef {
  name: string;
  description: string;
  args: string; // descripción de argumentos para el prompt
  run: (args: any, ctx: OperatorContext) => Promise<ToolResult>;
}

const num = (v: any) => (v === undefined || v === null || v === "" ? undefined : Number(v));

// Lee los nombres de archivos/carpetas de una carpeta PÚBLICA de Google Drive
// vía la vista incrustada (embeddedfolderview). Devuelve [] si es privada.
async function readDriveFolder(folderId: string): Promise<string[]> {
  try {
    const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36" },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = [...html.matchAll(/flip-entry-title[^>]*>([^<]+)<\/div>/gi)].map((m) => m[1].trim());
    // Ordenar por número inicial si lo tienen (1., 2., 10.)
    return matches.sort((a, b) => {
      const na = parseInt(a), nb = parseInt(b);
      return (isNaN(na) ? 1e9 : na) - (isNaN(nb) ? 1e9 : nb);
    });
  } catch {
    return [];
  }
}

// Convierte HTML a texto legible: prioriza <title> y meta description, luego
// quita scripts/estilos/etiquetas y colapsa espacios.
function htmlToText(html: string): string {
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").trim();
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || "").trim();
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  const header = [title && `TÍTULO: ${title}`, desc && `DESCRIPCIÓN: ${desc}`].filter(Boolean).join("\n");
  return (header ? header + "\n\n" : "") + body;
}

// ─── Registro de herramientas ────────────────────────────────────────────────
export const TOOLS: ToolDef[] = [
  // ── Lectura / diagnóstico ──
  {
    name: "analyze_system",
    description: "Ver un resumen del estado del sistema (conteos, productos sin imagen, etc.)",
    args: "{}",
    run: async (_args, ctx) => {
      const prods = await db.select().from(products).where(eq(products.tenantId, ctx.tenantId));
      const cats = await db.select().from(productCategories).where(eq(productCategories.tenantId, ctx.tenantId));
      const ags = await db.select().from(agents).where(eq(agents.tenantId, ctx.tenantId));
      const [st] = await db.select().from(settings).limit(1);
      const stors = await db.select().from(stores).where(eq(stores.tenantId, ctx.tenantId));
      const noImg = prods.filter((p) => !p.imageUrl).length;
      return {
        ok: true,
        summary: `Productos: ${prods.length} (${noImg} sin imagen) · Categorías: ${cats.length} · Agentes: ${ags.length} · Tiendas: ${stors.length}`,
        data: {
          products: prods.length, productsWithoutImage: noImg, categories: cats.length,
          agents: ags.length, stores: stors.length,
          businessName: st?.businessName, aiProvider: st?.aiProvider,
        },
      };
    },
  },
  {
    name: "list_products",
    description: "Listar productos (id, nombre, precio, categoría). Úsalo antes de editar para conocer los ids reales.",
    args: '{ "limit"?: number }',
    run: async (args, ctx) => {
      const rows = await db.select().from(products).where(eq(products.tenantId, ctx.tenantId)).limit(num(args.limit) || 50);
      return {
        ok: true,
        summary: `${rows.length} productos`,
        data: rows.map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, category: p.category, isActive: p.isActive, hasImage: !!p.imageUrl })),
      };
    },
  },
  {
    name: "list_categories",
    description: "Listar categorías de productos (id, nombre).",
    args: "{}",
    run: async (_args, ctx) => {
      const rows = await db.select().from(productCategories).where(eq(productCategories.tenantId, ctx.tenantId));
      return { ok: true, summary: `${rows.length} categorías`, data: rows.map((c) => ({ id: c.id, name: c.name })) };
    },
  },
  {
    name: "get_agent",
    description: "Ver la configuración del agente de ventas actual.",
    args: "{}",
    run: async (_args, ctx) => {
      const [a] = await db.select().from(agents).where(eq(agents.tenantId, ctx.tenantId)).orderBy(desc(agents.isActive)).limit(1);
      if (!a) return { ok: true, summary: "No hay agente configurado", data: null };
      return { ok: true, summary: `Agente: ${a.name} (${a.role})`, data: { id: a.id, name: a.name, role: a.role, tone: a.tone, isActive: a.isActive } };
    },
  },
  {
    name: "get_settings",
    description: "Ver la configuración del negocio (nombre, descripción, proveedor de IA, etc.).",
    args: "{}",
    run: async () => {
      const [s] = await db.select().from(settings).limit(1);
      if (!s) return { ok: true, summary: "Sin settings", data: null };
      return { ok: true, summary: "Settings del negocio", data: { businessName: s.businessName, businessDescription: s.businessDescription, timezone: s.timezone, aiProvider: s.aiProvider, autoReplyEnabled: s.autoReplyEnabled } };
    },
  },

  // ── Productos (CRUD) ──
  {
    name: "create_product",
    description: "Crear un producto o servicio nuevo.",
    args: '{ "name": string (req), "price"?: number, "currency"?: string, "description"?: string, "category"?: string, "categoryId"?: number, "kind"?: "digital"|"service"|"physical", "imageUrl"?: string, "features"?: string[], "deliveryLink"?: string, "paymentLink"?: string, "isActive"?: boolean }',
    run: async (args, ctx) => {
      if (!args.name) return { ok: false, summary: "Falta 'name'" };
      const [row] = await db.insert(products).values({
        tenantId: ctx.tenantId,
        name: String(args.name),
        description: args.description || "",
        price: (num(args.price) ?? 0) as any,
        currency: args.currency || "COP",
        category: args.category || "",
        categoryId: num(args.categoryId) ?? null,
        kind: args.kind || "digital",
        imageUrl: args.imageUrl || "",
        features: Array.isArray(args.features) ? args.features : [],
        deliveryLink: args.deliveryLink || "",
        paymentLink: args.paymentLink || "",
        highlight: args.highlight || "",
        isActive: args.isActive !== false,
      } as any).returning();
      return { ok: true, summary: `Producto creado: #${row.id} ${row.name}`, data: { id: row.id } };
    },
  },
  {
    name: "update_product",
    description: "Actualizar campos de un producto existente por id. Solo se cambian los campos enviados.",
    args: '{ "id": number (req), "name"?, "price"?, "currency"?, "description"?, "category"?, "categoryId"?, "kind"?, "imageUrl"?, "features"?: string[], "deliveryLink"?, "paymentLink"?, "highlight"?, "isActive"?: boolean }',
    run: async (args, ctx) => {
      const id = num(args.id);
      if (!id) return { ok: false, summary: "Falta 'id'" };
      const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existing || existing.tenantId !== ctx.tenantId) return { ok: false, summary: `Producto #${id} no encontrado` };
      const patch: Record<string, any> = {};
      for (const k of ["name", "description", "currency", "category", "kind", "imageUrl", "deliveryLink", "paymentLink", "highlight"]) {
        if (args[k] !== undefined) patch[k] = args[k];
      }
      if (args.price !== undefined) patch.price = num(args.price);
      if (args.categoryId !== undefined) patch.categoryId = num(args.categoryId);
      if (args.features !== undefined) patch.features = Array.isArray(args.features) ? args.features : existing.features;
      if (args.isActive !== undefined) patch.isActive = !!args.isActive;
      if (Object.keys(patch).length === 0) return { ok: false, summary: "Nada que actualizar" };
      await db.update(products).set(patch).where(eq(products.id, id));
      return { ok: true, summary: `Producto #${id} actualizado (${Object.keys(patch).join(", ")})` };
    },
  },
  {
    name: "delete_product",
    description: "Eliminar un producto por id. Acción destructiva.",
    args: '{ "id": number (req) }',
    run: async (args, ctx) => {
      const id = num(args.id);
      if (!id) return { ok: false, summary: "Falta 'id'" };
      const [existing] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!existing || existing.tenantId !== ctx.tenantId) return { ok: false, summary: `Producto #${id} no encontrado` };
      await db.delete(products).where(eq(products.id, id));
      return { ok: true, summary: `Producto #${id} eliminado` };
    },
  },

  // ── Categorías ──
  {
    name: "create_category",
    description: "Crear una categoría de productos.",
    args: '{ "name": string (req) }',
    run: async (args, ctx) => {
      if (!args.name) return { ok: false, summary: "Falta 'name'" };
      const [row] = await db.insert(productCategories).values({ tenantId: ctx.tenantId, name: String(args.name) } as any).returning();
      return { ok: true, summary: `Categoría creada: #${row.id} ${row.name}`, data: { id: row.id } };
    },
  },

  // ── Agente ──
  {
    name: "update_agent",
    description: "Actualizar el agente de ventas (nombre, rol, tono, prompt, activo). Crea uno si no existe.",
    args: '{ "name"?, "role"?, "tone"?, "systemPrompt"?, "isActive"?: boolean }',
    run: async (args, ctx) => {
      const [existing] = await db.select().from(agents).where(eq(agents.tenantId, ctx.tenantId)).limit(1);
      const patch: Record<string, any> = {};
      for (const k of ["name", "role", "tone", "systemPrompt"]) if (args[k] !== undefined) patch[k] = args[k];
      if (args.isActive !== undefined) patch.isActive = !!args.isActive;
      if (existing) {
        if (Object.keys(patch).length === 0) return { ok: false, summary: "Nada que actualizar en el agente" };
        patch.updatedAt = new Date().toISOString();
        await db.update(agents).set(patch).where(eq(agents.id, existing.id));
        return { ok: true, summary: `Agente #${existing.id} actualizado (${Object.keys(patch).join(", ")})` };
      }
      const [row] = await db.insert(agents).values({
        tenantId: ctx.tenantId,
        name: args.name || "Asistente",
        role: args.role || "Vendedor",
        tone: args.tone || "profesional",
        language: "es",
        model: "gpt-4o-mini",
        systemPrompt: args.systemPrompt || "Eres un asistente de ventas.",
        stages: [],
        isActive: args.isActive !== false,
      } as any).returning();
      return { ok: true, summary: `Agente creado: #${row.id} ${row.name}`, data: { id: row.id } };
    },
  },

  // ── Settings ──
  {
    name: "update_settings",
    description: "Actualizar la configuración del negocio.",
    args: '{ "businessName"?, "businessDescription"?, "timezone"?, "aiProvider"?, "autoReplyEnabled"?: boolean, "offHoursMessage"? }',
    run: async (args) => {
      const [s] = await db.select().from(settings).limit(1);
      if (!s) return { ok: false, summary: "No hay settings para actualizar" };
      const patch: Record<string, any> = {};
      for (const k of ["businessName", "businessDescription", "timezone", "aiProvider", "offHoursMessage"]) if (args[k] !== undefined) patch[k] = args[k];
      if (args.autoReplyEnabled !== undefined) patch.autoReplyEnabled = !!args.autoReplyEnabled;
      if (Object.keys(patch).length === 0) return { ok: false, summary: "Nada que actualizar" };
      await db.update(settings).set(patch).where(eq(settings.id, s.id));
      return { ok: true, summary: `Settings actualizados (${Object.keys(patch).join(", ")})` };
    },
  },

  // ── Tienda ──
  {
    name: "create_store",
    description: "Crear la tienda pública del negocio (necesaria para que /tienda muestre catálogo).",
    args: '{ "name": string (req), "slug": string (req, minúsculas y guiones) }',
    run: async (args, ctx) => {
      if (!args.name || !args.slug) return { ok: false, summary: "Faltan 'name' y/o 'slug'" };
      const existing = await db.select().from(stores).where(eq(stores.slug, String(args.slug))).limit(1);
      if (existing.length) return { ok: false, summary: `Ya existe una tienda con slug '${args.slug}'` };
      const [row] = await db.insert(stores).values({ tenantId: ctx.tenantId, name: String(args.name), slug: String(args.slug) } as any).returning();
      return { ok: true, summary: `Tienda creada: #${row.id} ${row.name} (/${row.slug})`, data: { id: row.id } };
    },
  },

  // ── 🌐 WEB / INFORMACIÓN EXTERNA ───────────────────────────────────────────
  {
    name: "web_fetch",
    description: "Leer el contenido de texto de una URL pública (para extraer info de un curso, producto, artículo, etc.). OJO: no funciona con carpetas de Google Drive privadas (requieren login) ni con páginas que cargan todo por JavaScript.",
    args: '{ "url": string (req) }',
    run: async (args) => {
      const url = String(args.url || "").trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, summary: "URL inválida (debe empezar por http/https)" };

      // Archivo de Google Drive (imagen/pdf) → es usable directamente como imagen
      if (/drive\.google\.com\/file\/d\//i.test(url) || /drive\.google\.com\/(uc|open)\?/i.test(url)) {
        const fid = url.match(/\/file\/d\/([\w-]+)/)?.[1] || url.match(/[?&]id=([\w-]+)/)?.[1];
        if (fid) {
          const direct = `https://drive.google.com/uc?export=download&id=${fid}`;
          try {
            const head = await fetch(direct, { method: "GET", headers: { Range: "bytes=0-0" } });
            if (head.ok || head.status === 206) {
              return { ok: true, summary: `Es un archivo de Drive accesible (imagen). Para ponerlo en un producto usa set_product_image con esta URL: ${direct}`, data: { imageUrl: direct, isImage: true } };
            }
          } catch {}
          return { ok: false, summary: "El archivo de Drive no es público. Compártelo como 'cualquiera con el enlace'." };
        }
      }

      // Carpeta de Google Drive → si es PÚBLICA, listar sus archivos/módulos
      const driveFolder = url.match(/drive\.google\.com\/drive\/folders\/([\w-]+)/i)?.[1];
      if (driveFolder) {
        const files = await readDriveFolder(driveFolder);
        if (files.length === 0) {
          return { ok: false, summary: "No pude leer la carpeta de Drive (probablemente es privada). Compártela como 'cualquiera con el enlace' o pásame el contenido." };
        }
        return { ok: true, summary: `Carpeta de Drive leída: ${files.length} elementos`, data: { modules: files, text: "Contenido de la carpeta:\n- " + files.join("\n- ") } };
      }

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36" },
          redirect: "follow",
        });
        if (!res.ok) return { ok: false, summary: `La página respondió ${res.status}` };
        const html = await res.text();
        const text = htmlToText(html).slice(0, 5000);
        if (text.replace(/\s/g, "").length < 40) {
          return { ok: false, summary: "No se pudo extraer texto útil (la página carga contenido por JavaScript o está protegida). Pídele al admin los detalles directamente." };
        }
        return { ok: true, summary: `Contenido leído de ${url} (${text.length} chars)`, data: { text } };
      } catch (e: any) {
        return { ok: false, summary: `No se pudo acceder: ${e?.message}` };
      }
    },
  },

  // ── 📘 FACEBOOK / META ─────────────────────────────────────────────────────
  {
    name: "fb_status",
    description: "Verificar la conexión con Facebook/Meta (token válido, página, cuenta de ads).",
    args: "{}",
    run: async (_args, ctx) => {
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService();
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no configurado (falta token en el entorno o en el tenant)." };
      const v = await fb.validate();
      return { ok: v.ok, summary: `Facebook: ${v.message}`, data: v };
    },
  },
  {
    name: "fb_suggest_audience",
    description: "Sugerir la audiencia/segmentación ideal para un producto (usa IA + categoría). LECTURA, no gasta dinero.",
    args: '{ "productId": number (req) }',
    run: async (args, ctx) => {
      if (!args.productId) return { ok: false, summary: "Falta 'productId'" };
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService();
      const aud = await fb.suggestAudience(Number(args.productId));
      if (!aud) return { ok: false, summary: "No se pudo sugerir audiencia (¿producto existe?)." };
      return { ok: true, summary: `Audiencia sugerida: ${aud.description}`, data: aud };
    },
  },
  {
    name: "fb_create_ad",
    description: "Crear una campaña de anuncios en Facebook/Instagram para un producto. Se crea SIEMPRE en PAUSA (no gasta hasta que el admin la active en Ads Manager). Meta adapta el creativo a cada tamaño/dispositivo automáticamente. GASTA DINERO al activarse.",
    args: '{ "productId": number (req), "dailyBudget": number (opcional, en la moneda de la cuenta, def 5000), "startDate": string opcional ISO, "cities": string[] opcional, "ageMin": number opcional, "ageMax": number opcional }',
    run: async (args, ctx) => {
      if (!args.productId) return { ok: false, summary: "Falta 'productId'" };
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService();
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no configurado (falta token)." };
      const targeting: any = {};
      if (args.cities) targeting.geoLocations = { cities: args.cities };
      if (args.ageMin) targeting.ageMin = Number(args.ageMin);
      if (args.ageMax) targeting.ageMax = Number(args.ageMax);
      const r = await fb.createAdForProduct(
        Number(args.productId),
        num(args.dailyBudget) ?? 5000,
        args.startDate,
        Object.keys(targeting).length ? targeting : undefined,
      );
      if (!r) return { ok: false, summary: "No se pudo crear la campaña (revisa token, permisos o el producto)." };
      return { ok: true, summary: `Campaña creada EN PAUSA para el producto ${args.productId}. Actívala en Ads Manager. Preview: ${r.previewUrl}`, data: r };
    },
  },
  {
    name: "fb_sync_catalog",
    description: "Sincronizar los productos activos al catálogo de Facebook (para tiendas y anuncios dinámicos). Requiere catálogo asignado.",
    args: "{}",
    run: async (_args, ctx) => {
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService();
      const r = await fb.syncCatalog();
      return { ok: r.failed === 0, summary: `Catálogo sincronizado: ${r.synced} ok, ${r.failed} fallidos`, data: r };
    },
  },

  // ── 🖼️ GENERACIÓN DE IMÁGENES ──────────────────────────────────────────────
  {
    name: "generate_image",
    description: "Generar una imagen con IA a partir de una descripción, en el tamaño correcto según el uso. Devuelve la URL para que el admin la revise ANTES de asignarla. NO la asigna sola.",
    args: '{ "prompt": string (req, descripción de la imagen), "purpose": "ad_feed"|"ad_story"|"card"|"square" (opcional, define el tamaño) }',
    run: async (args) => {
      if (!args.prompt) return { ok: false, summary: "Falta 'prompt' (descripción de la imagen)" };
      const sizes: Record<string, string> = {
        ad_feed: "1200x628", ad_story: "1080x1920", card: "1080x1080", square: "1080x1080",
      };
      const size = sizes[args.purpose as string] || "1080x1080";
      const url = await generateImageUrl(String(args.prompt), size);
      if (!url) return { ok: false, summary: "No hay generador de imágenes disponible. Activa G4F_ENABLED=true o configura AI_INTEGRATIONS_OPENAI_API_KEY (DALL-E)." };
      return { ok: true, summary: `Imagen generada (${size}). Revísala: ${url}`, data: { imageUrl: url, size } };
    },
  },
  {
    name: "set_product_image",
    description: "Asignar una imagen a un producto desde una URL (una foto que el admin provee, o una imagen generada). La sube a Cloudinary para que quede PERMANENTE (no se vence ni se pierde en redeploys) y actualiza el producto. Cambia datos → requiere confirmación.",
    args: '{ "productId": number (req), "imageUrl": string (req, URL de la imagen a asignar) }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      const src = String(args.imageUrl || "").trim();
      if (!id || !src) return { ok: false, summary: "Faltan 'productId' y/o 'imageUrl'" };
      const [prod] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!prod) return { ok: false, summary: `Producto ${id} no existe` };

      // Hospedaje permanente: 1º volumen de Easypanel (por defecto), 2º Cloudinary si está configurado.
      let finalUrl: string | null = null;
      let where = "";
      const { saveProductImage } = await import("./image-store");
      finalUrl = await saveProductImage(src, id);
      if (finalUrl) where = "volumen de Easypanel";
      if (!finalUrl) {
        const { isCloudinaryConfigured, uploadImageToCloudinary } = await import("./cloudinary");
        if (isCloudinaryConfigured()) {
          finalUrl = await uploadImageToCloudinary(src, `products/${id}`);
          if (finalUrl) where = "Cloudinary";
        }
      }
      if (!finalUrl) return { ok: false, summary: "No se pudo guardar la imagen (revisa la URL de origen o el volumen de almacenamiento)." };

      await db.update(products).set({ imageUrl: finalUrl }).where(eq(products.id, id));
      return {
        ok: true,
        summary: `Imagen asignada al producto ${id} (${prod.name}) — hospedada permanente en ${where} ✅`,
        data: { id, imageUrl: finalUrl, where },
      };
    },
  },
];

/**
 * Genera una imagen con el proveedor disponible: DALL-E (OpenAI) si hay key,
 * si no G4F (gratis) si está activo. Devuelve la URL o null si no hay generador.
 */
async function generateImageUrl(prompt: string, size: string): Promise<string | null> {
  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const [w] = size.split("x");
      const dalleSize = Number(w) >= 1700 ? "1792x1024" : "1024x1024";
      const resp = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
        body: JSON.stringify({ model: "dall-e-3", prompt, n: 1, size: dalleSize }),
      });
      const data = await resp.json();
      const url = data?.data?.[0]?.url;
      if (url) return url;
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[generate_image] DALL-E falló");
    }
  }
  if (process.env.G4F_ENABLED === "true") {
    try {
      const { getG4FImage } = await import("./providers/g4f-provider");
      const r = await getG4FImage(prompt);
      if (r?.image) return r.image;
    } catch (e: any) {
      logger.warn({ err: e?.message }, "[generate_image] G4F falló");
    }
  }
  return null;
}

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

export async function executeAction(tool: string, args: any, ctx: OperatorContext): Promise<ToolResult> {
  const def = TOOL_MAP.get(tool);
  if (!def) return { ok: false, summary: `Herramienta desconocida: ${tool}` };
  try {
    return await def.run(args || {}, ctx);
  } catch (e: any) {
    logger.error({ tool, err: e?.message }, "[AppOperator] Tool error");
    return { ok: false, summary: `Error ejecutando ${tool}: ${e?.message}` };
  }
}

// ─── Clasificación de herramientas ───────────────────────────────────────────
// Lectura: seguras, se ejecutan libremente para "mirar antes de actuar".
// Mutación: cambian datos → requieren PLAN + confirmación del admin.
// Destructivas / de dinero: confirmación reforzada.
export const READ_ONLY_TOOLS = new Set([
  "analyze_system", "list_products", "list_categories", "get_agent", "get_settings",
  // Facebook de solo lectura + generación de imagen (solo devuelve preview, no asigna)
  "fb_status", "fb_suggest_audience", "generate_image",
  // Lectura de web (información externa)
  "web_fetch",
]);
export const DESTRUCTIVE_TOOLS = new Set([
  "delete_product",
  // fb_create_ad crea objetos reales en Meta y puede gastar al activarse → confirmación reforzada
  "fb_create_ad",
]);
export function isReadOnlyTool(name: string): boolean {
  return READ_ONLY_TOOLS.has(name);
}
export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name);
}

/**
 * VERIFICAR DESPUÉS DE ACTUAR: tras una mutación, relee la entidad afectada y
 * devuelve su estado REAL, para confirmar que el cambio se aplicó de verdad
 * (no confiar en que el tool dijo "ok").
 */
export async function verifyMutation(tool: string, args: any, ctx: OperatorContext): Promise<string> {
  try {
    if (tool === "update_product" || tool === "create_product") {
      const id = args?.id ? Number(args.id) : undefined;
      let row;
      if (id) {
        [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      } else if (args?.name) {
        const all = await db.select().from(products).where(eq(products.tenantId, ctx.tenantId));
        row = all.find((p) => (p.name || "").toLowerCase() === String(args.name).toLowerCase());
      }
      if (!row) return "⚠️ No se pudo verificar (producto no encontrado tras la operación).";
      return `Verificado → [ID ${row.id}] ${row.name} · ${row.price} ${row.currency} · ${row.imageUrl ? "con imagen" : "SIN imagen"} · ${row.isActive ? "activo" : "inactivo"}`;
    }
    if (tool === "delete_product") {
      const id = args?.id ? Number(args.id) : undefined;
      if (!id) return "";
      const [row] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      return row ? "⚠️ El producto AÚN existe (no se borró)." : `Verificado → producto ${id} eliminado.`;
    }
    if (tool === "update_settings" || tool === "get_settings") {
      const [st] = await db.select().from(settings).limit(1);
      return st ? `Verificado → negocio: ${st.businessName} · IA: ${st.aiProvider}` : "";
    }
    if (tool === "update_agent" || tool === "get_agent") {
      const [ag] = await db.select().from(agents).where(eq(agents.tenantId, ctx.tenantId)).limit(1);
      return ag ? `Verificado → agente: ${ag.name} (${ag.role})` : "";
    }
  } catch (e: any) {
    return `⚠️ Verificación falló: ${e?.message}`;
  }
  return "";
}

export function buildToolsDoc(): string {
  return TOOLS.map((t) => `- ${t.name}: ${t.description}\n  args: ${t.args}`).join("\n");
}

export const OPERATOR_SYSTEM_PROMPT = `Eres el ARQUITECTO/OPERADOR del sistema — actúas como el programador y administrador de la aplicación, pero PRUDENTE y CONFIABLE.

HERRAMIENTAS DISPONIBLES:
${"${TOOLS}"}

FORMATO: Responde SIEMPRE en JSON válido:
{ "reply": "mensaje claro para el admin", "actions": [ { "tool": "nombre", "args": { ... } } ], "done": true|false }

PRINCIPIOS OBLIGATORIOS:
1. MIRA ANTES DE ACTUAR: nunca inventes ids, precios ni datos. Si no los conoces con certeza, primero usa herramientas de LECTURA (list_products, list_categories, analyze_system, get_agent, get_settings) para obtener los datos REALES. Las lecturas se ejecutan solas; úsalas libremente.
2. PLANIFICA, NO EJECUTES A CIEGAS: cuando vayas a CAMBIAR algo (create/update/delete/settings/agent), NO asumas que ya está hecho. El sistema NO ejecutará tus cambios hasta que el admin los apruebe. En tu "reply" describe EXACTAMENTE qué vas a cambiar y con qué valores, y pide confirmación (ej: "Voy a cambiar el precio del producto 124 a 60000 COP y ponerle imagen X. ¿Confirmas?").
3. Incluye las acciones de cambio en "actions" con los datos ya resueltos (ids reales). El sistema las mostrará como PLAN y las ejecutará solo cuando el admin diga "sí".
4. HONESTIDAD: si no encuentras algo (ej: un producto), dilo claramente y ofrece alternativas ("no encontré 'X', ¿te refieres a este [ID N]?"). Nunca fabriques un id ni un resultado.
5. Haz EXACTAMENTE lo que el admin pide, ni más ni menos.
6. Si el admin solo pregunta o pide diagnóstico, usa solo lecturas y responde; no propongas cambios.
7. Sé claro y conciso en "reply" (español). Pon "done": true cuando no queden más lecturas por hacer.

IMÁGENES:
- Puedes GENERAR imágenes (generate_image) y ASIGNARLAS a un producto (set_product_image). Las imágenes se hospedan permanentes (no se vencen).
- SIEMPRE sugiere/usa la MEDIDA correcta según el uso:
  • Card del producto / feed cuadrado: 1080×1080 (1:1)
  • Anuncio feed horizontal: 1200×628 (1.91:1)
  • Story / Reel: 1080×1920 (9:16)
  • Marketplace: 1200×628
  Si dudas, usa 1080×1080 (se ve bien en todos lados). Para anuncios, Meta reajusta el tamaño por ubicación automáticamente.
- Si el admin te da una foto (URL de internet, o un enlace de archivo de Google Drive tipo /file/d/...), NO uses web_fetch para "leerla": úsala DIRECTAMENTE con set_product_image (que la trae, la hospeda permanente y la asigna). set_product_image sabe convertir enlaces de Drive a la imagen real.
- Puedes TRAER imágenes del exterior: de una URL pública de internet o de un archivo público de Google Drive. Si el admin quiere que la crees, usa generate_image primero para que la revise, y solo tras su "sí" la asignas con set_product_image.
- web_fetch es para LEER texto de páginas/carpetas (info de cursos, módulos), no para imágenes.`;
