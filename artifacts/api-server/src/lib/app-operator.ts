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

import { db, products, productCategories, agents, settings, stores, conversations, leads } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { tenantManager } from "./tenantManager";
import { dbNow } from "./date-utils";

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
      signal: AbortSignal.timeout(15000),
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

// Decodifica las entidades HTML más comunes (títulos y resúmenes del buscador
// llegan con &amp;, &#233;, etc.).
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // al final, para no romper las demás
}

// ── 🔎 BÚSQUEDA WEB ────────────────────────────────────────────────────────
// Ningún buscador gratuito es fiable por sí solo: DuckDuckGo bloquea con HTTP
// 202 tras unas pocas consultas seguidas, y las instancias públicas de SearXNG
// van y vienen. Por eso se intentan varios en orden hasta que uno responda.
export interface SearchHit { title: string; url: string; snippet: string }

const SEARCH_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

async function getText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEARCH_UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8", ...headers },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    });
    // DuckDuckGo devuelve 202 + página "anomaly" cuando limita.
    if (!res.ok || res.status === 202) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/** Tavily: pensado para agentes, capa gratuita. Requiere TAVILY_API_KEY. */
async function searchTavily(query: string, limit: number): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: "basic" }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.results || []).slice(0, limit).map((r: any) => ({
      title: String(r.title || "").trim(),
      url: String(r.url || ""),
      snippet: String(r.content || "").replace(/\s+/g, " ").trim().slice(0, 400),
    }));
  } catch {
    return [];
  }
}

/** Brave Search API: capa gratuita. Requiere BRAVE_SEARCH_API_KEY. */
async function searchBrave(query: string, limit: number): Promise<SearchHit[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`,
      { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(12000) },
    );
    if (!res.ok) return [];
    const j: any = await res.json();
    return (j?.web?.results || []).slice(0, limit).map((r: any) => ({
      title: String(r.title || "").trim(),
      url: String(r.url || ""),
      snippet: String(r.description || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 400),
    }));
  } catch {
    return [];
  }
}

/** DuckDuckGo (sin key). Mejor calidad, pero limita tras varias consultas. */
async function searchDuckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
  const html = await getText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];
  const out: SearchHit[] = [];
  for (const b of html.split(/class="result__a"/).slice(1)) {
    if (out.length >= limit) break;
    const href = b.match(/href="([^"]+)"/)?.[1] || "";
    const title = decodeEntities(b.match(/>([^<]{3,300})</)?.[1] || "").trim();
    let url = href.startsWith("//") ? `https:${href}` : href;
    // DDG envuelve el destino en un redirect: /l/?uddg=<url-encoded>
    const uddg = url.match(/[?&]uddg=([^&]+)/)?.[1];
    if (uddg) url = decodeURIComponent(uddg);
    const snippet = decodeEntities(
      (b.match(/class="result__snippet"[^>]*>([\s\S]{0,600}?)<\/a>/)?.[1] || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
    ).trim();
    if (title && /^https?:\/\//i.test(url)) out.push({ title, url, snippet: snippet.slice(0, 400) });
  }
  return out;
}

/** SearXNG público (sin key). Se rotan instancias porque caen a menudo. */
const SEARX_INSTANCES = ["https://searxng.site", "https://search.rhscz.eu", "https://searx.be"];
async function searchSearx(query: string, limit: number): Promise<SearchHit[]> {
  for (const base of SEARX_INSTANCES) {
    const html = await getText(`${base}/search?q=${encodeURIComponent(query)}`);
    if (!html) continue;
    const out: SearchHit[] = [];
    for (const b of html.split(/<article\b/).slice(1)) {
      if (out.length >= limit) break;
      const m = b.match(/<h3>\s*<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!m) continue;
      const url = m[1];
      const title = decodeEntities(m[2].replace(/<[^>]+>/g, "")).trim();
      const snippet = decodeEntities(
        (b.match(/<p class="content">([\s\S]*?)<\/p>/)?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
      ).trim();
      if (title) out.push({ title, url, snippet: snippet.slice(0, 400) });
    }
    if (out.length > 0) return out;
  }
  return [];
}

/** Wikipedia: último recurso. Siempre disponible, pero solo enciclopédico. */
async function searchWikipedia(query: string, limit: number): Promise<SearchHit[]> {
  for (const lang of ["es", "en"]) {
    const body = await getText(
      `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json`,
    );
    if (!body) continue;
    try {
      const j = JSON.parse(body);
      const hits = (j?.query?.search || []).map((r: any) => ({
        title: String(r.title || ""),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`,
        snippet: String(r.snippet || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
      }));
      if (hits.length > 0) return hits;
    } catch {}
  }
  return [];
}

// Portadas de buscadores y agregadores que algunas instancias devuelven como
// "resultado": son ruido, nunca información sobre lo que se buscó.
const JUNK_HOSTS =
  /^(www\.)?(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|startpage|qwant|ask)\.[a-z.]+$/i;

/** Descarta resultados que claramente no informan sobre la consulta. */
function isUsefulHit(h: SearchHit, query: string): boolean {
  let host = "";
  let pathLen = 0;
  try {
    const u = new URL(h.url);
    host = u.hostname;
    pathLen = u.pathname.replace(/\/+$/, "").length;
  } catch {
    return false;
  }
  if (JUNK_HOSTS.test(host)) return false;
  // Raíz de dominio sin resumen: casi siempre relleno.
  if (pathLen === 0 && !h.snippet) {
    // Se acepta si el dominio recoge alguna palabra clave (ej: opencode.ai).
    const words = query.toLowerCase().match(/[a-záéíóúñ]{4,}/g) || [];
    const bare = host.toLowerCase().replace(/[^a-z]/g, "");
    if (!words.some((w) => bare.includes(w))) return false;
  }
  return true;
}

/** Intenta los motores en orden de calidad hasta que uno devuelva resultados. */
export async function runWebSearch(
  query: string,
  limit = 6,
): Promise<{ engine: string; results: SearchHit[] }> {
  const chain: [string, (q: string, n: number) => Promise<SearchHit[]>][] = [
    ["tavily", searchTavily],
    ["brave", searchBrave],
    ["duckduckgo", searchDuckDuckGo],
    ["searxng", searchSearx],
    ["wikipedia", searchWikipedia],
  ];
  for (const [engine, fn] of chain) {
    // Se pide de más porque el filtro de relevancia descarta parte.
    const raw = await fn(query, limit + 4);
    const results = raw.filter((h) => isUsefulHit(h, query)).slice(0, limit);
    if (results.length > 0) return { engine, results };
  }
  return { engine: "none", results: [] };
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

  {
    name: "delete_category",
    description: "Eliminar una categoria de productos por su id.",
    args: '{ "id": number (req) }',
    run: async (args, ctx) => {
      if (!args.id) return { ok: false, summary: "Falta 'id'" };
      const existing = await db.select({ id: productCategories.id }).from(productCategories).where(and(eq(productCategories.tenantId, ctx.tenantId), eq(productCategories.id, Number(args.id)))).limit(1);
      if (existing.length === 0) return { ok: false, summary: "No existe la categoria #" + args.id };
      await db.delete(productCategories).where(and(eq(productCategories.tenantId, ctx.tenantId), eq(productCategories.id, Number(args.id))));
      return { ok: true, summary: "Categoria #" + args.id + " eliminada" };
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
        // dbNow(): en Postgres updatedAt exige un objeto Date, un string
        // revienta la escritura (ver date-utils.ts) — el Architect fallaba
        // al aplicar sus propios planes de cambio sobre el agente.
        patch.updatedAt = dbNow();
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
            const head = await fetch(direct, { method: "GET", headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(10000) });
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
          signal: AbortSignal.timeout(15000),
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

  {
    name: "web_search",
    description:
      "BUSCAR en internet por palabras clave y obtener resultados REALES (título, URL y resumen). Úsala SIEMPRE antes de web_fetch cuando no conozcas la URL exacta: nunca adivines direcciones. Flujo normal: web_search para encontrar las fuentes → web_fetch para leer las 2-3 más relevantes.",
    args: '{ "query": string (req), "limit": number (opcional, por defecto 6) }',
    run: async (args) => {
      const query = String(args.query || "").trim();
      if (!query) return { ok: false, summary: "Falta 'query' (qué buscar)" };
      const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 10);

      try {
        const { engine, results } = await runWebSearch(query, limit);
        if (results.length === 0) {
          return {
            ok: false,
            summary: `Sin resultados para "${query}" (fallaron todos los buscadores). Prueba otras palabras clave.`,
          };
        }
        const text = results
          .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join("\n");
        return {
          ok: true,
          summary: `🔎 ${results.length} resultados reales para "${query}" (vía ${engine})`,
          data: { query, engine, results, text },
        };
      } catch (e: any) {
        return { ok: false, summary: `No se pudo buscar: ${e?.message}` };
      }
    },
  },

  {
    name: "web_scrape_images",
    description:
      "EXTRAER las URLs de las imágenes reales de una página web (scraping). Úsala cuando el admin quiera una foto de producto que ya existe en internet (la página del proveedor, una tienda, un curso) en vez de generar una con IA. Devuelve las imágenes ordenadas de más a menos relevante (portada/og:image primero). Solo LEE, no asigna nada — después usa set_product_image con la URL elegida.",
    args: '{ "url": string (req), "limit": number (opcional, por defecto 12) }',
    run: async (args) => {
      const url = String(args.url || "").trim();
      const limit = Math.min(num(args.limit) || 12, 30);
      if (!/^https?:\/\//i.test(url)) return { ok: false, summary: "URL inválida (debe empezar por http/https)" };
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36" },
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return { ok: false, summary: `La página respondió ${res.status}` };
        const html = await res.text();

        const base = new URL(url);
        const abs = (u: string): string | null => {
          try { return new URL(u.trim().replace(/&amp;/g, "&"), base).href; } catch { return null; }
        };
        // Descarta sprites, iconos, píxeles de tracking y logos: nunca sirven
        // como foto de producto y ensucian la lista.
        const util = (u: string) =>
          !/\.svg($|\?)/i.test(u) &&
          !/(sprite|icon|favicon|logo|pixel|avatar|badge|1x1|blank)/i.test(u);

        const ordered: string[] = [];
        const push = (u: string | null) => {
          if (u && util(u) && !ordered.includes(u)) ordered.push(u);
        };

        // 1º las que la propia página declara como imagen principal.
        for (const re of [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
                          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/gi]) {
          for (const m of html.matchAll(re)) push(abs(m[1]));
        }
        // 2º <img src> y srcset, en orden de aparición.
        for (const m of html.matchAll(/<img[^>]+?(?:data-src|data-original|src)=["']([^"']+)["']/gi)) push(abs(m[1]));
        for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
          const best = m[1].split(",").pop()?.trim().split(/\s+/)[0];
          if (best) push(abs(best));
        }

        const images = ordered.slice(0, limit);
        if (images.length === 0) {
          return { ok: false, summary: "No encontré imágenes utilizables (la página puede cargarlas por JavaScript)." };
        }
        return {
          ok: true,
          summary: `🖼️ ${images.length} imágenes encontradas en ${base.hostname}. La primera suele ser la principal.`,
          data: { images, text: images.map((u, i) => `${i + 1}. ${u}`).join("\n") },
        };
      } catch (e: any) {
        return { ok: false, summary: `No se pudo leer la página: ${e?.message}` };
      }
    },
  },

  // ── 🖼️ BÚSQUEDA DE IMÁGENES PROFESIONALES (para anuncios / productos) ────
  {
    name: "search_product_images",
    description:
      "BUSCAR imágenes profesionales de alta calidad en internet para un producto o tema. " +
      "Devuelve URLs de fotos reales, aptas para Facebook Ads (mínimo 600px, sin logos/iconos/Wikipedia). " +
      "Usa Pexels (stock gratuito), Brave Images y DuckDuckGo Images. " +
      "Muéstrale al admin las opciones con Markdown: ![Opción 1](url) para que elija. " +
      "Luego usa set_product_image con la URL elegida.",
    args: '{ "query": string (req, ej: "curso excel online profesional"), "limit": number (opcional, default 6) }',
    run: async (args) => {
      const query = String(args.query || "").trim();
      const limit = Math.min(num(args.limit) || 6, 12);
      if (!query) return { ok: false, summary: "Falta 'query' (qué buscar)" };

      const allImages: { url: string; source: string; title: string }[] = [];

      // Dominios basura que NUNCA sirven para anuncios de Facebook
      const JUNK_PATTERN = /(wikipedia|wikimedia|gravatar|avatar|favicon|icon|sprite|badge|pixel|1x1|blank|logo\.|\.svg|\.gif|placeholder|loading|spinner|data:image)/i;
      const isGoodImage = (url: string): boolean => {
        if (!url || !/^https?:\/\//i.test(url)) return false;
        if (JUNK_PATTERN.test(url)) return false;
        // Rechazar imágenes demasiado pequeñas por URL (thumbnails de 20px, 50px, etc.)
        if (/\/(\d+)px-/i.test(url)) {
          const px = parseInt(url.match(/\/(\d+)px-/i)![1]);
          if (px < 200) return false;
        }
        return true;
      };

      // ── 1. Pexels (fotos stock profesionales, 100% legales para ads) ──
      try {
        const pexelsKey = process.env.PEXELS_API_KEY;
        if (pexelsKey) {
          const res = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${limit}&locale=es-ES`,
            { headers: { Authorization: pexelsKey }, signal: AbortSignal.timeout(10000) },
          );
          if (res.ok) {
            const j: any = await res.json();
            for (const photo of (j?.photos || [])) {
              const url = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
              if (url && isGoodImage(url)) {
                allImages.push({ url, source: "Pexels", title: photo.alt || query });
              }
            }
          }
        }
      } catch {}

      // ── 2. Brave Image Search (alta calidad, requiere API key) ──
      try {
        const braveKey = process.env.BRAVE_SEARCH_API_KEY;
        if (braveKey) {
          const res = await fetch(
            `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${limit}&safesearch=moderate`,
            { headers: { Accept: "application/json", "X-Subscription-Token": braveKey }, signal: AbortSignal.timeout(10000) },
          );
          if (res.ok) {
            const j: any = await res.json();
            for (const img of (j?.results || [])) {
              const url = img?.properties?.url || img?.url;
              if (url && isGoodImage(url)) {
                allImages.push({ url, source: "Brave", title: img.title || query });
              }
            }
          }
        }
      } catch {}

      // ── 3. DuckDuckGo Image Search (sin API key, scraping) ──
      if (allImages.length < limit) {
        try {
          // DDG necesita un token vqd para búsqueda de imágenes
          const tokenRes = await fetch(
            `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
            { headers: { "User-Agent": SEARCH_UA }, signal: AbortSignal.timeout(8000) },
          );
          if (tokenRes.ok) {
            const tokenHtml = await tokenRes.text();
            const vqd = tokenHtml.match(/vqd=["']([^"']+)["']/)?.[1] ||
                         tokenHtml.match(/vqd=([\d-]+)/)?.[1];
            if (vqd) {
              const imgRes = await fetch(
                `https://duckduckgo.com/i.js?l=es-ES&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=size:Large`,
                { headers: { "User-Agent": SEARCH_UA, Referer: "https://duckduckgo.com/" }, signal: AbortSignal.timeout(10000) },
              );
              if (imgRes.ok) {
                const imgJson: any = await imgRes.json();
                for (const r of (imgJson?.results || [])) {
                  if (allImages.length >= limit * 2) break;
                  const url = r?.image;
                  if (url && isGoodImage(url)) {
                    allImages.push({ url, source: "DuckDuckGo", title: r.title || query });
                  }
                }
              }
            }
          }
        } catch {}
      }

      // ── 4. Fallback: SearXNG con categoría images ──
      if (allImages.length < 3) {
        for (const base of SEARX_INSTANCES) {
          try {
            const res = await fetch(
              `${base}/search?q=${encodeURIComponent(query)}&categories=images&format=json`,
              { headers: { "User-Agent": SEARCH_UA }, signal: AbortSignal.timeout(8000) },
            );
            if (res.ok) {
              const j: any = await res.json();
              for (const r of (j?.results || [])) {
                if (allImages.length >= limit * 2) break;
                const url = r?.img_src || r?.url;
                if (url && isGoodImage(url)) {
                  allImages.push({ url, source: "SearXNG", title: r.title || query });
                }
              }
              if (allImages.length >= 3) break;
            }
          } catch {}
        }
      }

      // Deduplicar y limitar
      const seen = new Set<string>();
      const unique = allImages.filter(img => {
        if (seen.has(img.url)) return false;
        seen.add(img.url);
        return true;
      }).slice(0, limit);

      if (unique.length === 0) {
        return { ok: false, summary: "No encontré imágenes profesionales para esa búsqueda. Intenta con otros términos más específicos." };
      }

      // Formatear para que el Arquitecto muestre visualmente con Markdown
      const markdown = unique.map((img, i) =>
        `🖼️ Opción ${i + 1} (${img.source}): ${img.title}\n![Opción ${i + 1}](${img.url})`
      ).join("\n\n");

      return {
        ok: true,
        summary: `🖼️ ${unique.length} imágenes profesionales encontradas para "${query}". Muéstralas al admin con Markdown para que elija.`,
        data: {
          images: unique,
          markdown,
          text: unique.map((img, i) => `${i + 1}. [${img.source}] ${img.url}`).join("\n"),
        },
      };
    },
  },

  // ── 📘 FACEBOOK / META ─────────────────────────────────────────────────────
  {
    name: "fb_status",
    description: "Verificar la conexión con Facebook/Meta (token válido, página, cuenta de ads).",
    args: "{}",
    run: async (_args, ctx) => {
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
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
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
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
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
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
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      const r = await fb.syncCatalog();
      return { ok: r.failed === 0, summary: `Catálogo sincronizado: ${r.synced} ok, ${r.failed} fallidos`, data: r };
    },
  },
  {
    name: "fb_page_can_post",
    description: "Diagnóstico: verifica si la página de Facebook conectada tiene permiso para publicar en su muro (sin esto, fb_page_publish falla).",
    args: "{}",
    run: async (_args, ctx) => {
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { checkPostingPermission } = await import("./facebook-page-posts");
      const problema = await checkPostingPermission(tenant || undefined);
      return {
        ok: problema === null,
        summary: problema === null ? "La página puede publicar ✅" : `No puede publicar: ${problema}`,
        data: { canPost: problema === null, reason: problema },
      };
    },
  },
  {
    name: "fb_page_preview",
    description: "Genera el texto de una publicación ORGÁNICA (sin pauta, gratis) para un producto, SIN publicarla. Úsalo siempre antes de fb_page_publish para que el admin revise el texto y la imagen.",
    args: '{ "productId": number (req) }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { buildPostDraft } = await import("./facebook-page-posts");
      try {
        const draft = await buildPostDraft(id, tenant?.slug || "demo");
        return {
          ok: true,
          summary: `Vista previa lista para "${draft.productName}". Imagen: ${draft.imageUrl ? "sí" : "no (se publicará solo texto)"}.`,
          data: draft,
        };
      } catch (e: any) {
        return { ok: false, summary: e?.message || "No se pudo generar la vista previa" };
      }
    },
  },
  {
    name: "fb_page_publish",
    description: "Publica en el MURO de la página de Facebook (orgánico, sin costo — distinto de fb_create_ad que es pauta paga). Muestra el producto con foto y texto reales del catálogo. Cambia el estado público de la página → requiere confirmación. Usa fb_page_preview antes para revisar el texto.",
    args: '{ "productId": number (req), "message"?: string (opcional, para editar el texto generado antes de publicar) }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { buildPostDraft, publishToPage } = await import("./facebook-page-posts");
      try {
        const draft = await buildPostDraft(id, tenant?.slug || "demo");
        if (typeof args.message === "string" && args.message.trim()) draft.message = args.message.trim();
        const result = await publishToPage(draft, tenant || undefined);
        if (!result.ok) return { ok: false, summary: `No se pudo publicar: ${result.error}` };
        return {
          ok: true,
          summary: `Publicado en la página: ${result.permalink || result.postId}`,
          data: result,
        };
      } catch (e: any) {
        return { ok: false, summary: e?.message || "Error publicando" };
      }
    },
  },
  {
    name: "fb_ad_draft",
    description: "Genera un BORRADOR de anuncio (copy, segmentación, imagen) para un producto y lo guarda localmente. Por defecto NO toca la cuenta publicitaria de Meta ni crea nada real — el admin lo revisa y decide si publicarlo después desde el panel de anuncios. Seguro de usar sin gastar dinero.",
    args: '{ "productId": number (req) }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { AdStrategist } = await import("./ad-strategist");
      try {
        const draft = await new AdStrategist(tenant || undefined).createDraftAd(
          tenant?.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
          tenant?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "",
          id,
        );
        return {
          ok: true,
          summary: `Borrador de anuncio creado para "${draft.productName}" (nicho: ${draft.strategy.niche}). Guardado local, no se tocó la cuenta de Meta.`,
          data: draft,
        };
      } catch (e: any) {
        return { ok: false, summary: e?.message || "No se pudo generar el borrador" };
      }
    },
  },
  {
    name: "fb_list_drafts",
    description: "Lista los borradores de anuncios ya generados para este negocio (creados con fb_ad_draft), con su estado.",
    args: "{}",
    run: async (_args, ctx) => {
      const { adStrategist } = await import("./ad-strategist");
      const drafts = await adStrategist.getDrafts(ctx.tenantId);
      return {
        ok: true,
        summary: `${drafts.length} borradores de anuncios`,
        data: drafts.map((d: any) => ({ id: d.id, productName: d.productName, niche: d.strategy?.niche, status: d.status })),
      };
    },
  },

  // ── 📊 MONITOREO (WhatsApp, conversaciones, ventas) ─────────────────────────
  {
    name: "whatsapp_status",
    description: "Ver el estado de la conexión de WhatsApp: conectado o no, número vinculado, último error. Úsalo para diagnosticar por qué el bot no está respondiendo.",
    args: "{}",
    run: async () => {
      const { whatsapp } = await import("./whatsapp");
      const s = whatsapp.getStatus();
      return {
        ok: true,
        summary: s?.state === "connected"
          ? `WhatsApp conectado — número ${s.phone}`
          : `WhatsApp NO conectado (estado: ${s?.state || "desconocido"}${s?.lastError ? `, último error: ${s.lastError}` : ""})`,
        data: s,
      };
    },
  },
  {
    name: "dashboard_summary",
    description: "Resumen de ventas y actividad del negocio: leads totales, conversaciones activas, tasa de conversión, ingresos del mes, mensajes de hoy.",
    args: "{}",
    run: async (_args, ctx) => {
      const allLeads = await db.select().from(leads).where(eq(leads.tenantId, ctx.tenantId));
      const allConvos = await db.select().from(conversations).where(eq(conversations.tenantId, ctx.tenantId));
      const won = allLeads.filter((l) => l.stage === "won");
      const startOfMonth = new Date(); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);
      const revenue = won.filter((l) => new Date(l.createdAt as any) >= startOfMonth).reduce((a, l) => a + Number(l.value), 0);
      const data = {
        totalLeads: allLeads.length,
        activeConversations: allConvos.filter((c) => c.status !== "closed").length,
        wonDeals: won.length,
        conversionRate: allLeads.length ? Math.round((won.length / allLeads.length) * 100) : 0,
        revenueThisMonth: revenue,
      };
      return { ok: true, summary: `${data.totalLeads} leads · ${data.activeConversations} conversaciones activas · ${data.wonDeals} ventas cerradas · conversión ${data.conversionRate}%`, data };
    },
  },
  {
    name: "list_recent_conversations",
    description: "Lista las conversaciones más recientes de WhatsApp con su etapa y último mensaje. Útil para revisar cómo está vendiendo el agente.",
    args: '{ "limit"?: number }',
    run: async (args, ctx) => {
      const rows = await db
        .select()
        .from(conversations)
        .where(eq(conversations.tenantId, ctx.tenantId))
        .orderBy(desc(conversations.lastMessageAt))
        .limit(num(args.limit) || 15);
      return {
        ok: true,
        summary: `${rows.length} conversaciones recientes`,
        data: rows.map((c) => ({
          id: c.id, name: c.contactName, phone: c.contactPhone, stage: c.currentStage,
          status: c.status, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt,
        })),
      };
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
      if (!url) return { ok: false, summary: "No se pudo generar la imagen con ningún proveedor (DALL-E, G4F ni Pollinations respondieron)." };
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

  // ── 📦 DROPI (dropshipping) ────────────────────────────────────────────────
  {
    name: "dropi_status",
    description: "Verificar la conexión con Dropi (dropshipping). Úsala SIEMPRE antes de buscar o importar: si el token no está o la IP del servidor no está autorizada, te dice exactamente qué falta.",
    args: "{}",
    run: async () => {
      const { dropiStatus } = await import("./dropi");
      const r = await dropiStatus();
      if (r.ok) return { ok: true, summary: "📦 Dropi conectado y respondiendo." };
      return {
        ok: false,
        summary: `Dropi no disponible: ${r.error}`,
        data: r.blockedIp ? { ipBloqueada: r.blockedIp } : undefined,
      };
    },
  },
  {
    name: "dropi_search_products",
    description: "Buscar productos en el catálogo de proveedores de Dropi (dropshipping: los despacha el proveedor, no hace falta stock propio). Solo LEE — devuelve nombre, precio sugerido, stock e imagen para que el admin elija cuáles importar.",
    args: '{ "query": string (req, qué buscar), "limit": number (opcional, por defecto 10) }',
    run: async (args) => {
      const { dropiSearchProducts, dropiProductImage } = await import("./dropi");
      const q = String(args.query || "").trim();
      const r = await dropiSearchProducts(q, num(args.limit) || 10);
      if (!r.ok) return { ok: false, summary: `No se pudo buscar en Dropi: ${r.error}` };
      const list = (r.data || []).map((p) => ({
        id: p.id,
        nombre: p.name,
        precioSugerido: p.suggested_price ?? p.sale_price ?? null,
        stock: p.stock ?? null,
        imagen: dropiProductImage(p),
      }));
      if (list.length === 0) return { ok: true, summary: `Sin resultados en Dropi para "${q}"`, data: { productos: [] } };
      return {
        ok: true,
        summary: `📦 ${list.length} productos de Dropi para "${q}"`,
        data: { productos: list, text: list.map((p) => `#${p.id} ${p.nombre} — $${p.precioSugerido} (stock ${p.stock})`).join("\n") },
      };
    },
  },
  {
    name: "dropi_import_product",
    description: "Importar un producto de Dropi al catálogo de ESTA tienda (con su foto, descripción y precio). A partir de ahí el bot lo vende como cualquier otro producto. Crea datos → requiere confirmación. El precio de venta lo decide el admin: si no lo pasa, se usa el sugerido por Dropi.",
    args: '{ "dropiProductId": number (req), "price": number (opcional, precio de venta al cliente) }',
    run: async (args, ctx) => {
      const { dropiGetProduct, dropiProductImage } = await import("./dropi");
      const dropiId = num(args.dropiProductId);
      if (!dropiId) return { ok: false, summary: "Falta 'dropiProductId'" };

      const r = await dropiGetProduct(dropiId);
      if (!r.ok || !r.data) return { ok: false, summary: `No se pudo traer el producto de Dropi: ${r.error}` };
      const p = r.data;

      const precio = num(args.price) || p.suggested_price || p.sale_price || 0;
      if (!precio) return { ok: false, summary: "El producto de Dropi no trae precio y no se indicó uno. Pasa 'price'." };

      const [creado] = await db
        .insert(products)
        .values({
          tenantId: ctx.tenantId,
          name: p.name,
          description: p.description || p.name,
          price: String(precio),
          currency: "COP",
          category: p.categories?.[0]?.name || "Dropshipping",
          kind: "physical",
          isActive: true,
          // Queda registrado de dónde salió: sin esto es imposible saber, al
          // vender, que hay que crear la orden en Dropi en vez de entregar
          // un enlace de descarga como con los productos digitales.
          metadata: JSON.stringify({ source: "dropi", dropiProductId: dropiId, dropiStock: p.stock ?? null }),
        })
        .returning();

      // La foto se baja al volumen propio: las URLs de Dropi pueden rotar o
      // caducar, y un producto sin imagen no se puede publicar ni anunciar.
      const img = dropiProductImage(p);
      let imgMsg = "sin imagen en Dropi";
      if (img) {
        const { saveProductImage } = await import("./image-store");
        const saved = await saveProductImage(img, creado.id);
        if (saved) {
          await db.update(products).set({ imageUrl: saved }).where(eq(products.id, creado.id));
          imgMsg = "con imagen guardada en el volumen";
        } else {
          await db.update(products).set({ imageUrl: img }).where(eq(products.id, creado.id));
          imgMsg = "con imagen enlazada desde Dropi (no se pudo copiar al volumen)";
        }
      }

      return {
        ok: true,
        summary: `📦 Importado de Dropi: #${creado.id} "${p.name}" a $${precio} COP (${imgMsg})`,
        data: { id: creado.id, dropiProductId: dropiId, price: precio },
      };
    },
  },
  {
    name: "fb_agent_logs",
    description: "Leer el historial del agente de crecimiento de anuncios: qué sugirió, por qué (razón y métricas del momento), si el admin aprobó/rechazó y si la acción se aplicó. Responde 'cómo van mis anuncios', 'qué me recomendó el agente', 'por qué pausó X'. LECTURA, no cambia nada.",
    args: '{ "limit": number (opcional, cuántos logs, def 25), "checkType": string (opcional, filtrar por "spend_protection" | "trend_review" | "daily_cap"), "status": string (opcional, "suggested" | "applied" | "rejected" | "no_action") }',
    run: async (args) => {
      const { adAgentLogs } = await import("@workspace/db");
      const { desc } = await import("drizzle-orm");
      const limit = Math.min(Math.max(num(args.limit) || 25, 1), 100);
      const conditions = [];
      if (args.checkType) conditions.push(eq(adAgentLogs.checkType, String(args.checkType)));
      if (args.status) conditions.push(eq(adAgentLogs.status, String(args.status)));
      let rows;
      if (conditions.length) {
        rows = await db.select().from(adAgentLogs).where(and(...conditions)).orderBy(desc(adAgentLogs.createdAt)).limit(limit);
      } else {
        rows = await db.select().from(adAgentLogs).orderBy(desc(adAgentLogs.createdAt)).limit(limit);
      }
      if (!rows.length) return { ok: true, summary: "El agente de anuncios no ha registrado actividad todavía (corre cada cierto tiempo).", data: { logs: [] } };
      const tipo: Record<string, string> = {
        spend_protection: "Protección de gasto",
        trend_review: "Revisión de tendencia",
        daily_cap: "Tope diario",
      };
      const est: Record<string, string> = {
        suggested: "🟡 sugerido",
        applied: "✅ aplicado",
        rejected: "🚫 rechazado",
        no_action: "⚪ sin acción",
      };
      const accion: Record<string, string> = {
        pause: "Pausar",
        resume: "Reanudar",
        increase_budget: "Subir presupuesto 20%",
        decrease_budget: "Bajar presupuesto 30%",
      };
      const resumen = rows.map((r: any) => {
        let m = "";
        try { const s = typeof r.metricsSnapshot === "string" ? JSON.parse(r.metricsSnapshot) : r.metricsSnapshot || {}; m = Object.entries(s).filter(([k]) => k !== "id").map(([k, v]) => `${k}: ${v}`).join(", "); } catch { m = ""; }
        return `[${tipo[r.checkType] || r.checkType}] ${r.suggestedAction ? accion[r.suggestedAction] || r.suggestedAction : "monitoreo"} · ${r.productName || r.campaignId} · ${r.reason}${m ? ` · métricas: ${m}` : ""}`;
      });
      return {
        ok: true,
        summary: `${rows.length} registro(s) del agente de anuncios.`,
        data: { logs: rows.map((r: any) => ({ ...r, statusLabel: est[r.status] || r.status })), resumen },
      };
    },
  },
  {
    name: "fb_campaign_metrics",
    description: "Leer métricas EN VIVO de las campañas de Facebook Ads (gasto, impresiones, clics, CTR, alcance, resultados, costo por resultado). Responde 'cómo está rindiendo mi anuncio', 'cuánto gasté'. LECTURA, no cambia nada. Si no hay token o falla Meta, devuelve el motivo.",
    args: '{ "campaignIds": string[] (opcional, filtrar campañas específicas), "days": number (opcional, ventana en días, def 7) }',
    run: async (_args, ctx) => {
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no configurado (falta token en el entorno o en el tenant)." };
      const days = Math.min(Math.max(num(_args.days) || 7, 1), 30);
      const r = await fb.getCampaignMetrics?.({
        campaignIds: Array.isArray(_args.campaignIds) ? _args.campaignIds : undefined,
        days,
      });
      if (!r) return { ok: false, summary: "No se pudieron leer las métricas (¿la cuenta de ads no tiene campañas o el token no tiene permiso?)." };
      const cams = r.campaigns || r;
      const n = Array.isArray(cams) ? cams.length : 0;
      return { ok: n > 0, summary: n > 0 ? `${n} campaña(s) con datos.` : "No hay campañas con datos en la ventana seleccionada.", data: r };
    },
  },
  {
    name: "dropi_create_order",
    description: "Crear una orden REAL en Dropi para que el proveedor despache al cliente (pago contra entrega). Úsala solo cuando una venta ya esté cerrada y tengas los datos de envío completos. GENERA UN PEDIDO REAL con costo → requiere confirmación explícita.",
    args: '{ "productId": number (req, id del producto en ESTA tienda), "quantity": number (req), "clientName": string (req), "clientPhone": string (req), "clientAddress": string (req), "clientCity": string (opcional), "clientDepartment": string (opcional), "notes": string (opcional) }',
    run: async (args) => {
      const { dropiCreateOrder } = await import("./dropi");
      const pid = num(args.productId);
      if (!pid) return { ok: false, summary: "Falta 'productId'" };

      const [prod] = await db.select().from(products).where(eq(products.id, pid)).limit(1);
      if (!prod) return { ok: false, summary: `Producto ${pid} no existe en la tienda` };

      let meta: any = {};
      try { meta = typeof prod.metadata === "string" ? JSON.parse(prod.metadata) : prod.metadata || {}; } catch {}
      const dropiProductId = meta?.dropiProductId;
      if (!dropiProductId) {
        return { ok: false, summary: `"${prod.name}" no vino de Dropi (es un producto propio) — no se le puede crear orden de dropshipping.` };
      }

      for (const campo of ["clientName", "clientPhone", "clientAddress"]) {
        if (!String(args[campo] || "").trim()) return { ok: false, summary: `Falta '${campo}' (obligatorio para el envío)` };
      }

      const r = await dropiCreateOrder({
        dropiProductId,
        quantity: num(args.quantity) || 1,
        clientName: String(args.clientName),
        clientPhone: String(args.clientPhone),
        clientAddress: String(args.clientAddress),
        clientCity: args.clientCity ? String(args.clientCity) : undefined,
        clientDepartment: args.clientDepartment ? String(args.clientDepartment) : undefined,
        notes: args.notes ? String(args.notes) : undefined,
      });
      if (!r.ok) return { ok: false, summary: `Dropi rechazó la orden: ${r.error}` };
      return { ok: true, summary: `📦 Orden creada en Dropi para "${prod.name}" → ${args.clientName} (${args.clientPhone})`, data: r.data };
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
        // Sin timeout, un DALL-E colgado dejaba el turno entero del Arquitecto
        // "trabajando" sin fin -- el chat nunca respondía ni llegaba a subir
        // la imagen. 30s alcanza de sobra para una generación normal.
        signal: AbortSignal.timeout(30000),
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

  // Pollinations: gratis y sin API key. Última red de seguridad para que
  // generar imágenes nunca quede sin proveedor.
  try {
    const [w = "1024", h = "1024"] = size.split("x");
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=${encodeURIComponent(w)}&height=${encodeURIComponent(h)}&nologo=true&model=flux`;
    const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    if (resp.ok) return url;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[generate_image] Pollinations falló");
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
  "fb_page_can_post", "fb_page_preview", "fb_list_drafts",
  // Agente de anuncios: leer logs y métricas no cambia nada (solo consulta)
  "fb_agent_logs", "fb_campaign_metrics",
  // Monitoreo: solo consultan, no cambian nada
  "whatsapp_status", "dashboard_summary", "list_recent_conversations",
  // Lectura de web (información externa)
  "web_fetch", "web_search", "web_scrape_images", "search_product_images",
  // Dropi de solo lectura: consultar el catálogo del proveedor no crea nada.
  "dropi_status", "dropi_search_products",
]);
export const DESTRUCTIVE_TOOLS = new Set([
  "delete_product",
  // fb_create_ad crea objetos reales en Meta y puede gastar al activarse → confirmación reforzada
  "fb_create_ad",
  // fb_page_publish es público e irreversible desde la app (borrar hay que
  // hacerlo en Facebook) → misma confirmación reforzada que gastar dinero.
  "fb_page_publish",
  // dropi_create_order dispara un despacho real del proveedor con cobro
  // contra entrega: es dinero de verdad moviéndose, nunca sin el sí del admin.
  "dropi_create_order",
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
8. TERMINA EL TRABAJO EN UN SOLO TURNO — NO ANUNCIES, HAZ:
   ❌ MAL: "Ya tengo la info de Claude Code. Ahora voy a investigar Antigravity…" (y no llamas la herramienta)
   ✅ BIEN: llamas web_fetch de Antigravity en ESTE turno, con "done": false, y sigues hasta tenerlo todo.
   Nunca digas "voy a…", "déjame…", "a continuación…", "en seguida…" ni "siguiente paso:". Si falta algo,
   pon las herramientas en "actions" con "done": false y el sistema te devolverá los datos para continuar.
   El admin NO debe tener que escribir "sigue" para que avances. Solo pon "done": true cuando entregues
   el resultado FINAL completo, o el PLAN de cambios listo para confirmar.
   Tienes hasta 10 pasos por turno: úsalos para investigar todo lo necesario antes de responder.
9. ESTILO EMOJI, NUNCA ASTERISCOS NI VIÑETAS: no uses *negrita*, ni **, ni viñetas con • o -.
   Encabeza cada línea de lista con un emoji que aporte significado.
   ❌ MAL:  • **Productos**: crear, editar
   ✅ BIEN: 📦 Productos: crear, editar
   Referencias útiles: 📦 productos · 🏷️ categorías · 🤖 agente · ⚙️ configuración · 🛒 tienda
   · 📣 anuncios · 🖼️ imágenes · ✅ hecho · ❌ error · 📋 plan · ❓ pregunta · 💰 precio.

IMÁGENES — REGLAS DE CALIDAD PARA FACEBOOK ADS:
- 🖼️ HERRAMIENTA PRINCIPAL: search_product_images. Busca fotos profesionales de alta calidad
  en Pexels (stock gratuito legal), Brave Images y DuckDuckGo Images. SIEMPRE úsala primero
  cuando el admin pida buscar una imagen para un producto o anuncio.
- 📐 FLUJO OBLIGATORIO para asignar imágenes:
  1️⃣ search_product_images con query descriptivo (ej: "persona aprendiendo piano teclado")
  2️⃣ Mostrar las opciones al admin usando Markdown: ![Opción 1](url)
  3️⃣ Esperar que el admin elija ("la 2", "la primera", etc.)
  4️⃣ set_product_image con la URL elegida → queda hospedada permanente
- 🚫 NUNCA descargues imágenes de Wikipedia, Wikimedia, ni ningún sitio enciclopédico.
  Esas fotos NO sirven para anuncios y son ridículas como imagen de producto.
- ✅ REQUISITOS FACEBOOK ADS (la imagen DEBE cumplir todos):
  📏 Mínimo 1080×1080 px (1:1) para feed, 1200×628 para horizontal, 1080×1920 para stories
  🚫 Máximo 20% de texto en la imagen (Meta penaliza el alcance si hay más)
  🚫 Sin bordes gruesos, marcas de agua, ni collages con flechas rojas
  ✅ Fotos reales, profesionales, bien iluminadas, fondos limpios
  ✅ Personas usando el producto > producto solo > ilustración genérica
- 📸 Si el admin te da una foto (URL o enlace de Google Drive /file/d/...), úsala DIRECTAMENTE
  con set_product_image. NO uses web_fetch para fotos.
- 🎨 generate_image es el ÚLTIMO recurso. Solo si search_product_images y web_scrape_images
  fallan Y el admin no tiene foto propia. Siempre pregunta antes de generar con IA.
- 📎 El admin también puede ADJUNTAR una imagen directamente en este chat. Si lo hace, tómala
  y úsala con set_product_image.
- web_scrape_images sigue disponible para extraer fotos de la página de un proveedor específico
  cuando se conoce la URL exacta.

FACEBOOK — PUBLICAR (gratis) vs ANUNCIAR (paga), no las confundas:
- 📢 fb_page_publish: publica en el MURO de la página, orgánico, SIN costo, visible de inmediato. Úsalo cuando el admin diga "publica", "postea" o "sube esto a Facebook". SIEMPRE llama fb_page_preview antes para que el admin vea el texto y la imagen, y fb_page_can_post si hay dudas de permisos.
- 💰 fb_create_ad: crea una CAMPAÑA PAGA en Ads Manager (se crea en pausa, pero gastará dinero al activarla). Solo úsalo cuando el admin pida explícitamente "anuncio", "campaña" o "pauta" — nunca lo ofrezcas como si fuera gratis.
- 📝 fb_ad_draft: genera el COPY y la segmentación de un anuncio y lo guarda local, SIN tocar la cuenta de Meta ni gastar nada. Es el paso intermedio seguro: úsalo para preparar campañas que el admin revisará y activará él mismo después, no fb_create_ad, salvo que pida crearla ya en Meta.

MONITOREO (cuando el admin pregunte "cómo va todo", "revisa el negocio", "por qué no responde WhatsApp", etc.):
- 📱 whatsapp_status: primero que nada si la duda es sobre el bot no respondiendo o la conexión.
- 📊 dashboard_summary: leads, conversión, ventas del mes, conversaciones activas.
- 💬 list_recent_conversations: para ver cómo está vendiendo el agente en conversaciones reales, no solo números.
- Combina estas lecturas en el mismo turno para dar un diagnóstico completo, no solo un dato suelto.

INFORMACIÓN DE INTERNET (nunca inventes datos externos):
- 🔎 Si no conoces la URL exacta, usa web_search PRIMERO. Jamás adivines direcciones.
- 📖 Luego usa web_fetch en las 2-3 URLs más relevantes para leer el contenido real.
- 🔁 Si el tema tiene varias partes (ej: "Claude Code, Antigravity, MCP y agentes"), busca y lee
  CADA una en el mismo turno con done:false, hasta cubrirlas todas. No entregues la mitad.
- 🧾 Cuando presentes la información, di de dónde salió (dominio o título de la fuente).
- ⚠️ Si una búsqueda no da resultados útiles, dilo con honestidad; no rellenes con suposiciones.

DROPSHIPPING CON DROPI (vender productos de proveedores sin tener stock):
- 📦 dropi_status primero: si la IP del servidor no está autorizada te lo dice con la IP exacta
  que hay que pedirle a Dropi que habilite. No sigas intentando si eso falla — reporta la IP.
- 🔎 dropi_search_products para explorar el catálogo del proveedor; muéstrale al admin nombre,
  precio sugerido y stock, y deja que él elija cuál importar y a qué precio venderlo.
- ⬇️ dropi_import_product lo trae a ESTA tienda con su foto. A partir de ahí el bot lo vende
  igual que cualquier producto propio.
- 🚚 dropi_create_order SOLO cuando la venta ya esté cerrada y tengas nombre, teléfono y
  dirección completos. Dispara un despacho real con cobro contra entrega: confirmación
  obligatoria, y si falta algún dato pídelo antes en vez de inventarlo.
- ⚠️ Los productos de Dropi son FÍSICOS: se envían a una dirección, no llevan enlace de Drive
  como los cursos digitales. No mezcles los dos flujos.

NO TE QUEDES ATASCADO (regla general):
- Si una herramienta falla, NO repitas la misma llamada con los mismos argumentos esperando otro
  resultado. Cambia de estrategia: otra fuente, otra herramienta, u otro enfoque.
- Si algo te falta (una imagen, un dato, un id), consíguelo con las herramientas que tienes en
  ESTE MISMO turno en vez de devolverle la tarea al admin.
- Solo pregúntale al admin cuando la decisión sea genuinamente suya (qué producto, qué precio,
  aprobar un gasto). Todo lo demás resuélvelo tú.`;
