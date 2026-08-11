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

import { db, products, productCategories, agents, settings, stores, tenants, conversations, leads, architectMemory, facebookDrafts } from "@workspace/db";
import { eq, desc, and, gte, sql, ilike } from "drizzle-orm";
import { logger } from "./logger";
import { tenantManager } from "./tenantManager";
import { dbNow } from "./date-utils";

export interface OperatorContext {
  tenantId: number;
  sessionId?: string;
  // Timestamp absoluto (Date.now() + ms) del límite del TURNO completo del
  // operador (ver requestDeadline en routes/code-agent.ts, 130s). Sin esto,
  // deep_research se armaba su propio presupuesto fresco de 100s cada vez
  // que se llamaba -- si ya se habían gastado varios pasos del turno (ej:
  // 3 web_search antes), a un agente externo real (~60-70s por intento
  // confirmado en vivo) no le quedaba tiempo real para responder antes de
  // que el turno completo cortara la conexión, y el error se reportaba
  // como "sin cuota" cuando en realidad era que se quedó sin tiempo.
  turnDeadline?: number;
}

// Ventana de vigencia de una investigación: una búsqueda de hace 3 horas ya
// no representa "lo que funciona hoy" para decidir un anuncio nuevo.
const RESEARCH_EVIDENCE_WINDOW_MS = 3 * 60 * 60 * 1000;

async function recordResearchEvidence(ctx: OperatorContext, query: string): Promise<void> {
  if (!ctx.sessionId) return;
  try {
    await db.insert(architectMemory).values({
      tenantId: ctx.tenantId,
      sessionId: ctx.sessionId,
      memoryType: "research_evidence",
      title: "web_research",
      content: query.slice(0, 500),
      tags: [],
      metadata: {},
    });
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[AppOperator] No se pudo registrar evidencia de investigación");
  }
}

/**
 * Gate real (no una sugerencia en el prompt): ¿hubo una búsqueda/lectura web
 * reciente en esta sesión? Sin esto, fb_ad_draft no genera nada -- el modelo
 * puede saltarse una instrucción del prompt, pero no puede saltarse esto.
 */
async function hasRecentResearch(ctx: OperatorContext): Promise<boolean> {
  if (!ctx.sessionId) return false;
  try {
    const since = new Date(Date.now() - RESEARCH_EVIDENCE_WINDOW_MS).toISOString();
    const rows = await db
      .select({ id: architectMemory.id })
      .from(architectMemory)
      .where(
        and(
          eq(architectMemory.tenantId, ctx.tenantId),
          eq(architectMemory.sessionId, ctx.sessionId),
          eq(architectMemory.memoryType, "research_evidence"),
          gte(architectMemory.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[AppOperator] No se pudo verificar evidencia de investigación");
    return false; // ante la duda, no dejar pasar sin investigar
  }
}

/**
 * Agentes de investigación externos (instancias standalone de `opencode
 * serve`, cada una en su propio contenedor EasyPanel con CPU/RAM dedicados
 * -- proyecto `opencode1`: oc-zen, oc-groq, oc-router).
 *
 * Por qué existen: una investigación real (varias búsquedas web encadenadas
 * + razonamiento multi-paso) hecha DENTRO del propio proceso de
 * bot-agenwhatsapp llegó a tumbar el contenedor entero -- EasyPanel
 * devolvía su propia página "Service is not reachable", no un error de la
 * app, señal de agotar la RAM/CPU compartida del host. Estas tres
 * instancias tienen su propio contenedor con recursos reservados (1
 * CPU/1GB cada una), así que el trabajo pesado corre ahí, no acá: lo único
 * que hace este proceso es esperar una respuesta HTTP, que es barato.
 *
 * Confirmado en vivo (2026-08-06): las tres responden con modelos
 * gratuitos (sin necesitar la cuenta de pago OpenCode Go) y con
 * herramienta `websearch` real -- probado con una investigación de 3
 * búsquedas encadenadas que devolvió datos y URLs reales, sin fabricar
 * nada.
 */
const EXTERNAL_RESEARCH_AGENTS: { url: string; providerID: string; modelID: string }[] = [
  { url: "https://oc-zen.2xs2bu.easypanel.host", providerID: "opencode", modelID: "nemotron-3-ultra-free" },
  { url: "https://oc-groq.2xs2bu.easypanel.host", providerID: "groq", modelID: "llama-3.3-70b-versatile" },
  { url: "https://oc-router.2xs2bu.easypanel.host", providerID: "openrouter", modelID: "google/gemma-4-26b-a4b-it:free" },
];

// Medido en vivo (2026-08-07): UN solo intento exitoso contra oc-zen tomó
// ~66s (creación de sesión ~0.6s + mensaje ~65.5s -- el modelo hace su
// propia búsqueda web real antes de responder, no es instantáneo). Por
// debajo de este piso, ni vale la pena intentar: el intento va a quedar a
// mitad de camino cuando se acabe el tiempo, y el motivo real ("no quedaba
// tiempo en el turno") terminaba reportándose como "sin cuota" -- que no
// es lo que pasó, confundía el diagnóstico.
const MIN_VIABLE_BUDGET_MS = 50_000;

type ExternalResearchResult =
  | { ok: true; agent: string; text: string }
  | { ok: false; reason: string };

/**
 * Delegar una investigación completa a uno de los agentes externos.
 * Prueba las 3 instancias en orden (refuerzo: si una falla o está sin
 * cuota, sigue con la próxima) y devuelve el texto final de la respuesta.
 *
 * `turnDeadline` (Date.now() + ms, ver OperatorContext) es el límite del
 * TURNO COMPLETO del operador, no de esta función sola -- antes esta
 * función siempre se armaba un presupuesto fresco de 100s propio, sin
 * saber cuánto quedaba realmente disponible. Si deep_research se llamaba
 * después de varios pasos ya gastados (ej: 3 web_search antes en el mismo
 * turno), un agente externo real (~60-70s) directamente no le alcanzaba el
 * tiempo que quedaba -- fallaba, pero el mensaje decía "sin cuota" cuando
 * el motivo real era que no había presupuesto suficiente.
 */
async function askExternalResearchAgent(prompt: string, turnDeadline?: number): Promise<ExternalResearchResult> {
  const hardCap = Date.now() + 100_000; // techo propio, nunca más que esto aunque sobre turno
  const effectiveDeadline = turnDeadline ? Math.min(turnDeadline, hardCap) : hardCap;
  const available = effectiveDeadline - Date.now();
  if (available < MIN_VIABLE_BUDGET_MS) {
    return {
      ok: false,
      reason: `deep_research no viable ahora mismo -- no queda tiempo en este turno (cada intento real tarda ~60-70s, solo quedaban ~${Math.max(0, Math.round(available / 1000))}s). No es un problema de cuota. ACCIÓN: no reportes esto como un error final ni le pidas al admin que investigue -- llamá web_search vos mismo, en este mismo turno, y seguí con la tarea usando esos resultados.`,
    };
  }

  for (const agent of EXTERNAL_RESEARCH_AGENTS) {
    const remaining = effectiveDeadline - Date.now();
    if (remaining < MIN_VIABLE_BUDGET_MS) break; // lo que queda ya no alcanza ni para un intento realista
    try {
      const sessionRes = await fetch(`${agent.url}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(Math.min(15000, remaining)),
      });
      if (!sessionRes.ok) continue;
      const session: any = await sessionRes.json();
      if (!session?.id) continue;

      // El loop interno (varias búsquedas + razonamiento) corre en SU
      // contenedor, no en este -- el costo para este proceso es solo
      // mantener la conexión HTTP abierta.
      const msgRes = await fetch(`${agent.url}/session/${session.id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "general",
          model: { providerID: agent.providerID, modelID: agent.modelID },
          parts: [{ type: "text", text: prompt }],
        }),
        signal: AbortSignal.timeout(Math.max(5000, effectiveDeadline - Date.now())),
      });
      if (!msgRes.ok) continue;
      const msg: any = await msgRes.json();
      if (msg?.error) {
        logger.warn({ agent: agent.url, error: msg.error }, "[AppOperator] Agente externo devolvió error, rotando");
        continue;
      }
      const parts: any[] = Array.isArray(msg?.parts) ? msg.parts : [];
      const textParts = parts.filter((p) => p?.type === "text").map((p) => String(p.text || ""));
      const text = textParts.join("\n\n").trim();
      if (!text) continue;
      return { ok: true, agent: agent.providerID, text };
    } catch (e: any) {
      logger.warn({ agent: agent.url, err: e?.message }, "[AppOperator] Agente externo falló, rotando al siguiente");
    }
  }
  return { ok: false, reason: "deep_research: los 3 agentes externos fallaron o no devolvieron texto útil. ACCIÓN: no reportes esto como un error final -- llamá web_search vos mismo, en este mismo turno, y seguí con la tarea usando esos resultados." };
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

/**
 * SearXNG público (sin key). Se rotan instancias porque caen a menudo.
 *
 * Las 3 instancias se consultan EN PARALELO, no en serie: probarlas una por
 * una (con ~12s de timeout cada una) podía sumar hasta 36s solo para este
 * motor, y era uno de los tramos que hacía que una búsqueda completa tardara
 * más de un minuto (ver runWebSearch). En paralelo el costo es el de la
 * instancia más lenta, no la suma de las tres.
 */
const SEARX_INSTANCES = ["https://searxng.site", "https://search.rhscz.eu", "https://searx.be"];
async function searchSearx(query: string, limit: number): Promise<SearchHit[]> {
  const attempts = await Promise.all(
    SEARX_INSTANCES.map(async (base) => {
      const html = await getText(`${base}/search?q=${encodeURIComponent(query)}`);
      if (!html) return [] as SearchHit[];
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
      return out;
    }),
  );
  return attempts.find((out) => out.length > 0) || [];
}

/**
 * Wikipedia: último recurso. Siempre disponible, pero solo enciclopédico.
 * "es" y "en" en paralelo por la misma razón que arriba.
 */
async function searchWikipedia(query: string, limit: number): Promise<SearchHit[]> {
  const attempts = await Promise.all(
    ["es", "en"].map(async (lang) => {
      const body = await getText(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&format=json`,
      );
      if (!body) return [] as SearchHit[];
      try {
        const j = JSON.parse(body);
        return (j?.query?.search || []).map((r: any) => ({
          title: String(r.title || ""),
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(r.title).replace(/ /g, "_"))}`,
          snippet: String(r.snippet || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
        }));
      } catch {
        return [] as SearchHit[];
      }
    }),
  );
  // "es" gana si ambos tienen resultados -- orden de prioridad, no de llegada.
  return attempts[0].length > 0 ? attempts[0] : attempts[1];
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

/**
 * Intenta los 5 motores EN PARALELO y se queda con el de mayor calidad que
 * haya devuelto algo (tavily > brave > duckduckgo > searxng > wikipedia).
 *
 * Antes se probaban en serie, uno esperando al anterior. Con Tavily/Brave sin
 * API key (devuelven al toque) el costo real caía sobre duckduckgo (~12s,
 * frecuentemente bloqueado con 202 tras varias consultas seguidas) + searxng
 * (hasta 36s con sus 3 instancias) + wikipedia (~12s) = hasta ~60-70s por
 * CADA llamada a esta función. El Arquitecto puede llamarla varias veces
 * dentro de su loop de hasta 10 pasos (una investigación real casi siempre
 * dispara más de una búsqueda), así que ese costo se multiplicaba -- la causa
 * real detrás de pedidos que tardaban varios minutos y terminaban en el
 * genérico "Error: Error del servidor" (ver code-agent.tsx, que cae a ese
 * texto cuando la respuesta no llega a ser JSON). En paralelo el costo es el
 * de la instancia más lenta del motor más lento (~12-15s), no la suma.
 */
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
  const settled = await Promise.all(
    chain.map(async ([engine, fn]) => {
      // Se pide de más porque el filtro de relevancia descarta parte.
      const raw = await fn(query, limit + 4).catch(() => [] as SearchHit[]);
      return { engine, results: raw.filter((h) => isUsefulHit(h, query)).slice(0, limit) };
    }),
  );
  for (const [engine] of chain) {
    const found = settled.find((s) => s.engine === engine && s.results.length > 0);
    if (found) return found;
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
      // La tienda pública real (GET /api/public/products/:slug, la que usa
      // PublicLayout.tsx) se resuelve por tenants.slug, no por una fila en
      // `stores` -- tenants viejos (como el 1) nunca recibieron esa fila y
      // antes esto decía "0 tiendas, aún no creada" aunque la tienda pública
      // ya estuviera viva y vendiendo. stors.length sigue siendo real (fila
      // de personalización curada), pero "hay tienda pública" se decide con
      // el slug, que es lo que de verdad determina si /tienda/<slug> responde.
      const [tenantRow] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      const publicStoreUrl = tenantRow?.slug ? `/tienda/${tenantRow.slug}` : null;
      const noImg = prods.filter((p) => !p.imageUrl).length;
      return {
        ok: true,
        summary: `Productos: ${prods.length} (${noImg} sin imagen) · Categorías: ${cats.length} · Agentes: ${ags.length} · Tienda pública: ${publicStoreUrl ? `activa en ${publicStoreUrl}` : "sin slug, no accesible"} (fila en tabla stores: ${stors.length})`,
        data: {
          products: prods.length, productsWithoutImage: noImg, categories: cats.length,
          agents: ags.length, stores: stors.length, publicStoreUrl,
          businessName: st?.businessName, aiProvider: st?.aiProvider,
        },
      };
    },
  },
  {
    name: "list_products",
    description: "Listar productos (id, nombre, precio, categoría). Úsalo antes de editar para conocer los ids reales. Si buscás un producto puntual (ej. 'el curso de piano'), pasá 'search' -- el catálogo puede tener más productos que el límite por defecto, y sin buscar por nombre podés no ver uno que sí existe. IMPORTANTE: 'search' filtra por NOMBRE (texto), no por id -- si ya tenés el productId numérico (ej. 123), no lo pases acá como texto de búsqueda, no lo va a encontrar por el número.",
    args: '{ "limit"?: number, "search"?: string (filtra por nombre, sin distinguir mayúsculas) }',
    run: async (args, ctx) => {
      const search = typeof args.search === "string" ? args.search.trim() : "";
      const conditions = [eq(products.tenantId, ctx.tenantId)];
      if (search) conditions.push(ilike(products.name, `%${search}%`));
      // Antes sin orderBy: con más productos que el límite por defecto (85 en
      // este negocio, límite 50), Postgres no garantiza qué subconjunto
      // devuelve sin ORDER BY -- un producto real podía quedar afuera de
      // forma no determinística según el escaneo interno, y el Arquitecto
      // reportaba "no encontré el producto" sobre algo que sí existía.
      // orderBy(id) hace el resultado reproducible; 'search' deja encontrar
      // un producto puntual sin depender de que entre en la muestra truncada.
      const rows = await db.select().from(products).where(and(...conditions)).orderBy(products.id).limit(num(args.limit) || 50);
      return {
        ok: true,
        summary: `${rows.length} productos${search ? ` (filtrado por "${search}")` : ""}`,
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
    description: "Crear un producto o servicio nuevo. Si das 'category' (texto) y no un 'categoryId' puntual, se resuelve/crea automáticamente la categoría real -- nunca queda un producto con la etiqueta de texto desconectada de la categoría real (eso es lo que rompía el filtrado por categoría antes).",
    args: '{ "name": string (req), "price"?: number, "currency"?: string, "description"?: string, "category"?: string, "categoryId"?: number, "kind"?: "digital"|"service"|"physical", "imageUrl"?: string, "features"?: string[], "deliveryLink"?: string, "paymentLink"?: string, "isActive"?: boolean }',
    run: async (args, ctx) => {
      if (!args.name) return { ok: false, summary: "Falta 'name'" };
      const { resolveCategoryId } = await import("./product-categories");
      const categoryId = num(args.categoryId) ?? await resolveCategoryId(ctx.tenantId, args.category, args.kind || "digital");
      const [row] = await db.insert(products).values({
        tenantId: ctx.tenantId,
        name: String(args.name),
        description: args.description || "",
        price: (num(args.price) ?? 0) as any,
        currency: args.currency || "COP",
        category: args.category || "",
        categoryId,
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
    description: "Actualizar campos de un producto existente por id. Solo se cambian los campos enviados. Si mandás 'category' (texto) sin 'categoryId' puntual, se resuelve/crea automáticamente la categoría real y se re-vincula -- nunca queda la etiqueta de texto desconectada de la categoría real.",
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
      if (args.categoryId !== undefined) {
        patch.categoryId = num(args.categoryId);
      } else if (args.category !== undefined) {
        const { resolveCategoryId } = await import("./product-categories");
        patch.categoryId = await resolveCategoryId(ctx.tenantId, args.category, patch.kind || existing.kind);
      }
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
  {
    name: "get_store",
    description: "Consultar la tienda pública actual, su slug y tema visual.",
    args: "{}",
    run: async (_args, ctx) => {
      const [store] = await db.select().from(stores).where(eq(stores.tenantId, ctx.tenantId)).limit(1);
      if (store) {
        return { ok: true, summary: `Tienda: ${store.name} (/${store.slug})`, data: { id: store.id, name: store.name, slug: store.slug, theme: store.theme } };
      }
      // La fila en `stores` es solo para personalización curada (tema,
      // nombre propio) -- casi ningún negocio la llena nunca. La tienda
      // pública REAL en /tienda/:slug sirve directo del catálogo real
      // (products/productCategories por tenant) con o sin esa fila, la
      // misma lógica de fallback que ya tiene routes/store.ts. Antes esta
      // tool decía "todavía no tiene tienda" incluso con la tienda pública
      // activa y vendiendo -- información falsa que confundía al admin y
      // al propio Atlas durante auto-reparación.
      const [tenant] = await db.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
      if (tenant?.slug) {
        return { ok: true, summary: `Tienda pública activa en /tienda/${tenant.slug} (sin personalización curada -- usa el catálogo real directo).`, data: { slug: tenant.slug, curated: false } };
      }
      return { ok: true, summary: "El negocio todavía no tiene tienda", data: null };
    },
  },
  {
    name: "update_store",
    description: "Actualizar la tienda existente: nombre, slug o tema visual. Solo cambia los campos enviados.",
    args: '{ "name"?, "slug"?, "theme"?: object }',
    run: async (args, ctx) => {
      const [store] = await db.select().from(stores).where(eq(stores.tenantId, ctx.tenantId)).limit(1);
      if (!store) return { ok: false, summary: "No existe una tienda para actualizar; créala primero" };
      const patch: Record<string, any> = {};
      if (args.name !== undefined) patch.name = String(args.name).trim();
      if (args.slug !== undefined) patch.slug = String(args.slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      if (args.theme !== undefined && args.theme && typeof args.theme === "object") patch.theme = args.theme;
      if (!Object.keys(patch).length) return { ok: false, summary: "Nada que actualizar en la tienda" };
      const [updated] = await db.update(stores).set(patch).where(eq(stores.id, store.id)).returning();
      return { ok: true, summary: `Tienda actualizada: ${updated.name} (/${updated.slug})`, data: { id: updated.id, name: updated.name, slug: updated.slug } };
    },
  },

  // ── 🌐 WEB / INFORMACIÓN EXTERNA ───────────────────────────────────────────
  {
    name: "web_fetch",
    description: "Leer el contenido de texto de una URL pública (para extraer info de un curso, producto, artículo, etc.). OJO: no funciona con carpetas de Google Drive privadas (requieren login) ni con páginas que cargan todo por JavaScript.",
    args: '{ "url": string (req) }',
    run: async (args, ctx) => {
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
        await recordResearchEvidence(ctx, url);
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
    run: async (args, ctx) => {
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
        await recordResearchEvidence(ctx, query);
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
    name: "deep_research",
    description:
      "Delega una investigación COMPLETA (varias búsquedas + análisis, encadenadas) a un agente externo dedicado, en vez de encadenar varios web_search vos mismo en este turno. Úsala para pedidos de investigación reales antes de armar una campaña/anuncio (tendencias del nicho, qué hace la competencia, qué ángulos funcionan) -- es más lenta que web_search (puede tardar 1-2 minutos) pero hace el trabajo pesado en un servidor aparte y devuelve un resumen ya elaborado con fuentes citadas, no resultados crudos para que vos los proceses.",
    args: '{ "instruccion": string (req) — qué investigar, en lenguaje natural, ej: "tendencias de anuncios de cursos de piano online, con fuentes" }',
    run: async (args, ctx) => {
      const instruccion = String(args.instruccion || "").trim();
      if (!instruccion) return { ok: false, summary: "Falta 'instruccion' (qué investigar)" };
      try {
        const result = await askExternalResearchAgent(
          `Investigá en internet de verdad (usá tu herramienta de búsqueda web, no respondas de memoria): ${instruccion}. Sé concreto, citá las fuentes/URLs reales que encontraste, no inventes datos.`,
          ctx.turnDeadline,
        );
        if (!result.ok) {
          return { ok: false, summary: result.reason };
        }
        await recordResearchEvidence(ctx, instruccion);
        return {
          ok: true,
          summary: `🔎 Investigación completa (vía agente externo ${result.agent})`,
          data: { instruccion, agente: result.agent, resultado: result.text },
        };
      } catch (e: any) {
        return { ok: false, summary: `No se pudo completar la investigación: ${e?.message}` };
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
      const { credencialesFacebookDe, probarFacebook } = await import("./tenant-facebook-credentials");
      const cred = credencialesFacebookDe(tenant);
      const v = await probarFacebook(cred.accessToken, cred.pageId || undefined);
      return { ok: v.ok, summary: `Facebook: ${v.detalle}`, data: { ...v, pageId: cred.pageId, adAccountId: cred.adAccountId, catalogId: cred.catalogId } };
    },
  },
  {
    name: "payment_status",
    description: "Probar las credenciales reales de pago del tenant y mostrar qué métodos están disponibles, sin crear cobros.",
    args: "{}",
    run: async (_args, ctx) => {
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { validateAllPaymentServices, PaymentGateway } = await import("./payments");
      const results = await validateAllPaymentServices(tenant || undefined);
      const cred = new PaymentGateway(tenant || undefined);
      const transfer = cred.getTransferInfo();
      const available = results
        .filter((r: any) => r.isValid && r.service !== "transfer")
        .map((r: any) => r.service);
      return {
        ok: available.length > 0 || transfer.options.length > 0,
        summary: `Pagos disponibles: ${[...available, transfer.options.length ? "transferencia" : ""].filter(Boolean).join(", ") || "ninguno"}`,
        data: { results, transferAccounts: transfer.options.length },
      };
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
      if (!r) {
        // createAdForProduct devuelve null en cualquier error (para no
        // romper a otros llamadores que asumen `| null`) pero SÍ guarda el
        // motivo real en fb.lastAdError -- antes esto se ignoraba y siempre
        // se mostraba el mismo genérico "revisa token, permisos o el
        // producto", así que un error real y específico de Graph API (ej:
        // "no hay método de pago en la cuenta") quedaba invisible tanto
        // para el admin como para el propio self-repair, que terminaba
        // investigando cosas que no tenían nada que ver con la causa real.
        const detalle = fb.lastAdError ? ` Motivo real: ${fb.lastAdError}` : "";
        return { ok: false, summary: `No se pudo crear la campaña.${detalle}` };
      }
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
    description: "Genera un BORRADOR de anuncio (copy, segmentación, imagen) para un producto y lo guarda localmente. Por defecto NO toca la cuenta publicitaria de Meta ni crea nada real — el admin lo revisa y decide si publicarlo después desde el panel de anuncios. Seguro de usar sin gastar dinero. REQUIERE haber investigado antes (web_search o web_fetch) en esta misma sesión, en las últimas 3 horas -- si no, la llamada falla y hay que investigar primero. " +
      "OBLIGATORIO, no opcional: SIEMPRE redactá vos mismo primaryText, headline y description COMPLETOS, con tus propias palabras, a partir de lo que investigaste -- NUNCA mandes solo hook/angle/researchNote y dejes que el sistema arme el texto por vos. Si solo pasás hook/angle, el backend arma un anuncio con una PLANTILLA FIJA (misma estructura y mismas frases siempre, solo cambia el gancho) -- eso es exactamente lo que el admin NO quiere: dijo explícitamente que el copy le sale repetido y poco dinámico. Cada producto, cada pedido, tiene que sonar distinto: variá la estructura (a veces empezá con una pregunta, a veces con una estadística, a veces con una historia corta), el ángulo (dolor vs. deseo vs. urgencia vs. prueba social) y el cierre (no repitas siempre el mismo CTA calcado). " +
      "primaryText: el anuncio completo, listo para publicar (no una plantilla con huecos). headline: título corto y de impacto (máx. ~35 caracteres, sino Meta lo recorta). description: una línea de refuerzo (precio, garantía, o el beneficio principal en pocas palabras).",
    args: '{ "productId": number (req), "primaryText": string (req en la práctica -- el texto completo del anuncio, redactado por vos con la investigación real, NO un huequito para rellenar), "headline": string (req en la práctica -- título corto propio, no genérico), "description"?: string, "hook"?: string (opcional, solo como respaldo si por algo no pudiste redactar el texto completo), "angle"?: string (ángulo/enfoque respaldado por la investigación), "researchNote"?: string (fuente o hallazgo concreto que respalda el copy, ej: "competidores en Facebook Ads Library usan X"), "whatsapp"?: string (número CON código de país, ej "573001234567", o un enlace wa.me — si lo pasás, el anuncio lleva a una conversación de WhatsApp en vez de a la web; úsalo cuando el admin pida "tráfico a WhatsApp" o "que me escriban") }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      // El gate principal es hasRecentResearch (busca evidencia real en la
      // DB, por sesión+ventana de 3h) -- pero se vio en vivo un caso donde
      // rechazó una llamada aunque había evidencia real de la MISMA sesión
      // guardada minutos antes (mismo tenant, mismo session_id, bien dentro
      // de la ventana), sin poder aislar la causa exacta del fallo del
      // lookup. Mientras tanto, un researchNote concreto y no trivial (una
      // cita/hallazgo real, no un genérico de una palabra) es en sí mismo
      // evidencia de que hubo investigación -- es mucho más difícil de
      // fabricar de forma convincente que un hook solo. Aceptarlo como vía
      // alternativa evita bloquear un caso legítimo por un gate frágil,
      // sin abrir la puerta a saltarse la investigación por completo (un
      // researchNote vacío o genérico sigue sin alcanzar).
      const hasGroundedNote = typeof args.researchNote === "string" && args.researchNote.trim().length >= 40;
      if (!hasGroundedNote && !(await hasRecentResearch(ctx))) {
        return {
          ok: false,
          summary: "Todavía no investigaste nada en esta sesión (o hace más de 3 horas). Usa web_search para ver qué funciona de verdad en este nicho -- competencia, ángulos, precios -- antes de generar el borrador. No se genera copy sin esa base real.",
        };
      }
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { AdStrategist } = await import("./ad-strategist");
      const grounded = {
        hook: typeof args.hook === "string" ? args.hook.trim() || undefined : undefined,
        angle: typeof args.angle === "string" ? args.angle.trim() || undefined : undefined,
        researchNote: typeof args.researchNote === "string" ? args.researchNote.trim() || undefined : undefined,
        primaryText: typeof args.primaryText === "string" ? args.primaryText.trim() || undefined : undefined,
        headline: typeof args.headline === "string" ? args.headline.trim() || undefined : undefined,
        description: typeof args.description === "string" ? args.description.trim() || undefined : undefined,
      };
      try {
        // Destino WhatsApp: cambia el tipo de campaña entera (objetivo,
        // destino del conjunto y botón), no es solo un enlace distinto.
        const wa = typeof args.whatsapp === "string" ? args.whatsapp.trim() : "";
        const draft = await new AdStrategist(tenant || undefined).createDraftAd(
          tenant?.facebook?.adAccountId || process.env.FB_AD_ACCOUNT_ID || "",
          tenant?.facebook?.userAccessToken || tenant?.facebook?.accessToken || process.env.FB_ACCESS_TOKEN || "",
          id,
          grounded,
          undefined,
          wa ? { tipo: "whatsapp", numero: wa } : undefined,
        );
        const groundedNote = grounded.hook || grounded.researchNote ? " (anclado en la investigación de esta sesión)" : " (plantilla genérica del nicho — no se pasó hook/angle basado en investigación)";
        // El summary es lo ÚNICO que el admin termina viendo (ver lines.push
        // en code-agent.ts, arma la respuesta final con r.summary, nunca con
        // r.data) -- antes esto era una sola línea confirmando que "se creó
        // un borrador" sin mostrar una sola palabra del copy real. El admin
        // aprobaba a ciegas y, después de aprobar, seguía sin ver qué se
        // había generado. Ahora el copy completo va en el summary mismo.
        //
        // join("\n\n") y no "\n": el frontend renderiza la reply con
        // ReactMarkdown -- en Markdown/CommonMark un solo salto de línea
        // dentro de un párrafo se colapsa a un espacio (no hay línea nueva
        // visible), solo una línea EN BLANCO (doble salto) separa párrafos
        // de verdad. Con un solo "\n" todo el borrador salía como un bloque
        // aplastado sin ninguna separación visible entre título/texto/precio.
        const copyPreview = [
          `📝 Borrador de anuncio para "${draft.productName}" (nicho: ${draft.strategy.niche})${groundedNote}:`,
          `🎯 Título: ${draft.headline}`,
          `✍️ Texto principal:\n${draft.primaryText}`,
          `📄 Descripción: ${draft.description}`,
          draft.imageUrl ? `🖼️ Imagen: ${draft.imageUrl}` : `🖼️ Sin imagen asignada todavía`,
          `💾 Guardado local, no se tocó la cuenta de Meta.`,
        ].join("\n\n");
        return {
          ok: true,
          summary: copyPreview,
          data: draft,
        };
      } catch (e: any) {
        return { ok: false, summary: e?.message || "No se pudo generar el borrador" };
      }
    },
  },
  {
    name: "fb_list_drafts",
    description: "Lista los borradores de anuncios ya generados para este negocio (creados con fb_ad_draft), con el TEXTO REAL del anuncio (headline/primaryText/description) y su estado. Usá esta tool -- no fb_campaign_metrics ni el nombre interno de la campaña -- cuando te pidan revisar, opinar o mejorar el COPY de un anuncio: el nombre de la campaña es solo una etiqueta administrativa que el cliente nunca ve, no es el texto del anuncio.",
    args: "{}",
    run: async (_args, ctx) => {
      const { adStrategist } = await import("./ad-strategist");
      const drafts = await adStrategist.getDrafts(ctx.tenantId);
      return {
        ok: true,
        summary: `${drafts.length} borradores de anuncios`,
        data: drafts.map((d: any) => ({
          id: d.id,
          productName: d.productName,
          niche: d.strategy?.niche,
          status: d.status,
          creadoEnMeta: !!d.campaignId,
          campaignId: d.campaignId,
          fbStatus: d.fbStatus,
          headline: d.headline,
          primaryText: d.primaryText,
          description: d.description,
          dailyBudgetCop: d.budget,
          numImagenes: Array.isArray(d.images) ? d.images.length : (d.imageUrl ? 1 : 0),
        })),
      };
    },
  },

  {
    name: "fb_update_draft_creative",
    description: "Cambia el TEXTO (headline/primaryText/description) de un borrador de anuncio ya existente -- si ese borrador ya es un objeto real en Meta (creadoEnMeta:true en fb_list_drafts), reconstruye el creativo real y lo repone en el anuncio (Meta no deja editar un creativo existente, así que arma uno nuevo y lo repunta; el anuncio sigue con el mismo id y el mismo estado -- PAUSED sigue PAUSED). Si el borrador todavía no existe en Meta, esto solo actualiza el borrador local. Usala cuando el admin apruebe un copy nuevo para reemplazar el de un anuncio ya creado -- no hay otra forma de lograrlo, fb_create_ad SIEMPRE crea una campaña nueva con copy autogenerado y NO acepta texto personalizado.",
    args: '{ "draftId": number (req, id del borrador -- lo da fb_list_drafts), "headline"?: string, "primaryText"?: string, "description"?: string }',
    run: async (_args, ctx) => {
      const draftId = Number(_args.draftId);
      if (!draftId) return { ok: false, summary: "Falta el id del borrador (usá fb_list_drafts para obtenerlo)." };
      const patch: Record<string, any> = { updatedAt: new Date() };
      if (typeof _args.headline === "string" && _args.headline.trim()) patch.headline = _args.headline.trim();
      if (typeof _args.primaryText === "string" && _args.primaryText.trim()) patch.primaryText = _args.primaryText.trim();
      if (typeof _args.description === "string" && _args.description.trim()) patch.description = _args.description.trim();
      if (Object.keys(patch).length <= 1) return { ok: false, summary: "No mandaste ningún campo de texto para actualizar." };

      const [updated] = await db.update(facebookDrafts).set(patch).where(and(eq(facebookDrafts.id, draftId), eq(facebookDrafts.tenantId, ctx.tenantId))).returning();
      if (!updated) return { ok: false, summary: `No encontré el borrador ${draftId} para este negocio.` };

      if (!updated.campaignId) {
        return { ok: true, summary: `Borrador ${draftId} actualizado (guardado local, todavía no existe en Meta).` };
      }
      const { AdStrategist } = await import("./ad-strategist");
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const sync = await new AdStrategist(tenant || undefined).updateDraftCreative(draftId);
      return {
        ok: sync.ok,
        summary: sync.ok
          ? `Borrador ${draftId} actualizado y sincronizado con el anuncio real en Meta (sigue en el mismo estado, ${updated.fbStatus || "PAUSED"}).`
          : `Se guardó el texto nuevo, pero Meta rechazó actualizar el creativo del anuncio real: ${sync.message || "error desconocido"}.`,
      };
    },
  },

  // ── 📊 MONITOREO (WhatsApp, conversaciones, ventas) ─────────────────────────
  {
    name: "whatsapp_status",
    description: "Ver el estado de la conexión de WhatsApp: conectado o no, número vinculado, último error. Úsalo para diagnosticar por qué el bot no está respondiendo.",
    args: "{}",
    run: async (_args, ctx) => {
      // Antes importaba `whatsapp` de "./whatsapp" -- una instancia standalone
      // de WhatsAppManager que NUNCA se inicia (el bot real corre por tenant
      // vía whatsapp-factory.ts). Esa instancia siempre reporta su estado
      // inicial ("no conectado"), sin importar que el WhatsApp del negocio SÍ
      // esté conectado -- el Arquitecto decía "no tengo WhatsApp conectado"
      // de forma permanente, sin relación con la realidad. getWhatsAppForTenant
      // con el tenant real de esta conversación (no el proxy de compatibilidad
      // en whatsapp-singleton.ts, que cae al tenant por defecto) es la fuente
      // correcta -- mismo patrón que ya se aplicó en routes/dashboard.ts.
      const { getWhatsAppForTenant } = await import("./whatsapp-factory");
      const s = getWhatsAppForTenant(ctx.tenantId).getStatus();
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

  // ── 🧠 INTELIGENCIA DE NEGOCIO (arquitecto real, con datos reales) ─────────
  // Estos tools exponen los módulos architect-predictor/-optimizer/-reasoner/
  // -multichannel al agente conversacional real. Antes existían pero solo se
  // podían llamar por una API REST separada que nadie usaba -- el Arquitecto
  // IA de WhatsApp/dashboard no tenía forma de invocarlos. Todos son de solo
  // lectura/sugerencia (no mutan nada), por eso van en READ_ONLY_TOOLS.
  {
    name: "predict_customer",
    description: "Predicciones reales (basadas en historial real de conversación/mensajes/pagos, no inventadas) sobre un cliente: probabilidad de compra próxima, riesgo de abandono (churn) y mejor horario para contactarlo. Úsalo antes de decidir cómo o cuándo hacerle seguimiento a alguien.",
    args: '{ "phone": string (req, número o parte del número del cliente) }',
    run: async (args, ctx) => {
      const phone = String(args.phone || "").trim();
      if (!phone) return { ok: false, summary: "Falta 'phone'" };
      const { architectPredictor } = await import("./architect-predictor");
      const [purchase, churn, timing] = await Promise.all([
        architectPredictor.predictNextPurchase(ctx.tenantId, phone),
        architectPredictor.predictChurnRisk(ctx.tenantId, phone),
        architectPredictor.predictBestContactTime(ctx.tenantId, phone),
      ]);
      return {
        ok: true,
        summary: `Compra: ${purchase.prediction} (${purchase.probability}%, confianza ${purchase.confidence}%) · Churn: ${churn.prediction} · Mejor horario: ${timing.bestDay} ~${timing.bestHour}:00`,
        data: { purchase, churn, timing },
      };
    },
  },
  {
    name: "optimize_price",
    description: "Sugiere un ajuste de precio para un producto basado en pagos confirmados reales vs. interés real (mensajes de clientes) en los últimos 30 días -- no en una demanda inventada. Si hay pocos datos, lo dice en vez de inventar una recomendación. Solo sugiere, no cambia el precio solo.",
    args: '{ "productId": number (req) }',
    run: async (args, ctx) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      const { architectOptimizer } = await import("./architect-optimizer");
      const { architectMemoryService } = await import("./architect-memory-service");
      const result = await architectOptimizer.optimizePricing(id);
      await architectMemoryService.recordLearning(
        ctx.tenantId, "decision", `💲 Sugerencia de precio: producto #${id}`,
        `${result.currentValue} → ${result.optimizedValue}. ${result.expectedImprovement}`,
        ["pricing", `product-${id}`], { confidence: result.confidence, impact: 60, source: "optimize_price" },
      );
      return { ok: true, summary: `${result.currentValue} → ${result.optimizedValue} (confianza ${result.confidence}%): ${result.expectedImprovement}`, data: result };
    },
  },
  {
    name: "optimize_copy",
    description: "Reescribe la descripción de un producto usando SOLO sus features/highlight reales ya cargados (nunca inventa garantías, soporte o beneficios que el producto no tiene declarados). Si el producto no tiene features cargadas, te lo dice en vez de inventar contenido.",
    args: '{ "productId": number (req) }',
    run: async (args) => {
      const id = num(args.productId);
      if (!id) return { ok: false, summary: "Falta 'productId'" };
      const { architectOptimizer } = await import("./architect-optimizer");
      const result = await architectOptimizer.optimizeCopy(id);
      return { ok: true, summary: result.expectedImprovement, data: result };
    },
  },
  {
    name: "analyze_channel_performance",
    description: "Compara el desempeño real (conversaciones y ventas confirmadas) entre los canales que de verdad están integrados: WhatsApp, Facebook Messenger y comentarios de Facebook. Canales sin integración real (email, SMS) se marcan como no implementados en vez de simular datos.",
    args: "{}",
    run: async (_args, ctx) => {
      const { architectMultichannel } = await import("./architect-multichannel");
      const result = await architectMultichannel.analyzePerformance(ctx.tenantId);
      return {
        ok: true,
        summary: result.top_performer
          ? `Mejor canal: ${result.top_performer}${result.bottom_performer ? ` · Peor: ${result.bottom_performer}` : ""}`
          : "Sin volumen suficiente todavía para comparar canales con confianza",
        data: result,
      };
    },
  },
  {
    name: "reason_business_decision",
    description: "Razona una decisión de negocio desde 4 ángulos (CEO/estrategia, ventas, UX, datos) y da una recomendación con nivel de confianza real (más alto cuanto más datos reales le des, no un número fijo). Antes de razonar, consulta lecciones aprendidas de decisiones pasadas similares en este negocio, y guarda la nueva conclusión para la próxima vez -- así el Arquitecto IA mejora con el tiempo en vez de repetir el mismo análisis desde cero.",
    args: '{ "situation": string (req, ej: "bajar el precio del curso de piano"), "data"?: object (métricas reales que tengas: conversionRate, aov, monthlyVisitors, revenue, etc — cuantas más pases, más confiable la respuesta), "goals"?: string[] }',
    run: async (args, ctx) => {
      const situation = String(args.situation || "").trim();
      if (!situation) return { ok: false, summary: "Falta 'situation'" };
      const { architectReasoner } = await import("./architect-reasoner");
      const { architectMemoryService } = await import("./architect-memory-service");
      const priorLearnings = await architectMemoryService.applyLearnings(ctx.tenantId, situation);
      const context = {
        situation,
        data: { ...(args.data && typeof args.data === "object" ? args.data : {}), previousLessons: priorLearnings.relevantLessons.map((l) => l.title) },
        constraints: [],
        goals: Array.isArray(args.goals) ? args.goals : [],
        tenantId: ctx.tenantId,
      };
      const reasoning = await architectReasoner.reason(context);
      await architectMemoryService.recordLearning(
        ctx.tenantId, "decision", `🧠 Razonamiento: ${situation}`,
        reasoning.synthesis.recommendation,
        ["reasoning", situation.toLowerCase().slice(0, 40)],
        { confidence: reasoning.synthesis.confidence, impact: 55, source: "reason_business_decision" },
      );
      return {
        ok: true,
        summary: `${reasoning.synthesis.recommendation} (confianza ${reasoning.synthesis.confidence}%)${priorLearnings.relevantLessons.length ? ` · basado en ${priorLearnings.relevantLessons.length} lecciones previas` : ""}`,
        data: reasoning,
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
  // Control real de campañas desde el chat. NO son de solo lectura: mueven
  // dinero (pausar corta el gasto, reactivar lo reanuda, el presupuesto lo
  // cambia), así que quedan fuera de READ_ONLY_TOOLS y pasan por el plan con
  // confirmación del admin, igual que crear un anuncio.
  {
    name: "fb_pause_campaign",
    description: "PAUSAR una campaña de Facebook Ads que está activa: deja de gastar de inmediato. Úsala cuando el admin pida frenar/parar/pausar un anuncio, o cuando esté gastando sin resultados. Necesita el id de la campaña -- si no lo tenés, leé primero las métricas para obtenerlo.",
    args: '{ "campaignId": string (req, id de la campaña en Meta) }',
    run: async (_args, ctx) => {
      const campaignId = String(_args.campaignId || "").trim();
      if (!campaignId) return { ok: false, summary: "Falta el id de la campaña a pausar." };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no está conectado." };
      const ok = await fb.pauseCampaign(campaignId);
      return { ok, summary: ok ? `Campaña ${campaignId} pausada: deja de gastar desde ahora.` : `Meta no aceptó pausar la campaña ${campaignId}.` };
    },
  },
  {
    name: "fb_resume_campaign",
    description: "REACTIVAR una campaña de Facebook Ads que estaba pausada: vuelve a gastar según su presupuesto diario. Úsala solo si el admin lo pide explícitamente.",
    args: '{ "campaignId": string (req, id de la campaña en Meta) }',
    run: async (_args, ctx) => {
      const campaignId = String(_args.campaignId || "").trim();
      if (!campaignId) return { ok: false, summary: "Falta el id de la campaña a reactivar." };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no está conectado." };
      const ok = await fb.resumeCampaign(campaignId);
      return { ok, summary: ok ? `Campaña ${campaignId} reactivada: vuelve a gastar.` : `Meta no aceptó reactivar la campaña ${campaignId}.` };
    },
  },
  {
    name: "fb_set_budget",
    description: "Fijar el presupuesto DIARIO de un conjunto de anuncios, en pesos (no en porcentaje). El presupuesto vive en el conjunto de anuncios, NO en la campaña: si solo tenés el id de la campaña, usá fb_list_adsets primero para obtener el del conjunto.",
    args: '{ "adSetId": string (req, id del CONJUNTO de anuncios), "dailyBudget": number (req, monto diario en la moneda de la cuenta) }',
    run: async (_args, ctx) => {
      const adSetId = String(_args.adSetId || "").trim();
      const monto = num(_args.dailyBudget);
      if (!adSetId) return { ok: false, summary: "Falta el id del conjunto de anuncios." };
      if (!monto || monto <= 0) return { ok: false, summary: "El presupuesto diario tiene que ser un monto mayor a cero." };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no está conectado." };
      const r = await fb.setAdSetBudget(adSetId, monto);
      return { ok: r.ok, summary: r.ok ? `Presupuesto diario del conjunto ${adSetId} fijado en ${monto}.` : (r.message || "Meta no aceptó el cambio de presupuesto.") };
    },
  },
  {
    name: "fb_list_adsets",
    description: "Listar los conjuntos de anuncios de una campaña, con su presupuesto diario y estado. LECTURA, no cambia nada. Se usa para saber a qué conjunto cambiarle el presupuesto.",
    args: '{ "campaignId": string (req, id de la campaña) }',
    run: async (_args, ctx) => {
      const campaignId = String(_args.campaignId || "").trim();
      if (!campaignId) return { ok: false, summary: "Falta el id de la campaña." };
      const tenant = await tenantManager.getTenantById(ctx.tenantId);
      const { FacebookService } = await import("./facebook");
      const fb = new FacebookService(tenant || undefined);
      if (!fb.isConfigured()) return { ok: false, summary: "Facebook no está conectado." };
      const adSets = await fb.listAdSets(campaignId);
      return { ok: adSets.length > 0, summary: adSets.length ? `${adSets.length} conjunto(s) de anuncios.` : "Esa campaña no tiene conjuntos de anuncios visibles.", data: adSets };
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

  // ── Remarketing ──
  {
    name: "lead_opt_out",
    description: "Marca (o desmarca) un lead como que no quiere recibir más campañas de remarketing (email_campaign_send / whatsapp_broadcast_send lo excluyen automáticamente). Usalo cuando el admin te cuente que un cliente pidió no recibir más mensajes/promociones.",
    args: '{ "leadId": number (req), "optOut"?: boolean (default true) }',
    run: async (args, ctx) => {
      const id = num(args.leadId);
      if (!id) return { ok: false, summary: "Falta 'leadId'" };
      const value = args.optOut === undefined ? true : !!args.optOut;
      const [existing] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.tenantId, ctx.tenantId))).limit(1);
      if (!existing) return { ok: false, summary: `Lead #${id} no encontrado` };
      await db.update(leads).set({ optOut: value }).where(eq(leads.id, id));
      return { ok: true, summary: value ? `🚫 ${existing.name} marcado como que no quiere más campañas.` : `✅ ${existing.name} vuelve a poder recibir campañas.` };
    },
  },
  {
    name: "email_campaign_send",
    description: "Encola un correo de remarketing para los leads guardados (filtrable por 'stage'). Progresivo, NO masivo: no se manda todo de una, queda encolado y remarketing-scheduler.ts lo va mandando en tandas de a poco durante varias horas -- así el patrón de envío no se lee como un blast. Sin 'stage', apunta solo a leads potenciales (excluye automáticamente 'converted' y 'lost', que no son remarketing). Usa el SMTP configurado del negocio. Nunca incluye leads con opt_out=true. Acción real e irreversible una vez que empieza a mandarse → requiere confirmación explícita del admin mostrando el asunto, el mensaje y a cuántos leads les llega ANTES de encolar. Tope de 300 destinatarios por campaña; si el segmento es más grande, acotá con 'stage' o dividí en varias campañas.",
    args: '{ "subject": string (req), "html": string (req, cuerpo del correo en HTML simple), "stage"?: string (opcional, filtra leads por etapa puntual — si se omite, aplica a leads potenciales sin opt_out, excluyendo convertidos/perdidos) }',
    run: async (args, ctx) => {
      if (!args.subject || !args.html) return { ok: false, summary: "Faltan 'subject' y/o 'html'" };
      const { queueEmailCampaign } = await import("./remarketing");
      const r = await queueEmailCampaign(ctx.tenantId, { subject: String(args.subject), html: String(args.html), stage: args.stage ? String(args.stage) : undefined });
      return { ok: r.ok, summary: r.summary, data: r };
    },
  },
  {
    name: "whatsapp_broadcast_send",
    description: "Encola el mismo mensaje de WhatsApp para los leads guardados (filtrable por 'stage'). Progresivo, NO masivo: no se manda todo de una, queda encolado y remarketing-scheduler.ts lo va mandando en tandas chicas (5 cada 10 min) durante el día -- reduce mucho el riesgo de que Meta marque el número por un patrón de ráfaga. Sin 'stage', apunta solo a leads potenciales (excluye automáticamente 'converted' y 'lost'). Usa el WhatsApp ya conectado del negocio. Nunca incluye leads con opt_out=true. RIESGO REAL si se abusa igual: por eso el tope de seguridad es más bajo que el de email (80 por campaña) y por eso esto SIEMPRE requiere que el admin confirme explícitamente el mensaje exacto y el segmento antes de encolar, sin excepciones.",
    args: '{ "message": string (req), "stage"?: string (opcional, filtra leads por etapa puntual — si se omite, aplica a leads potenciales sin opt_out, excluyendo convertidos/perdidos) }',
    run: async (args, ctx) => {
      if (!args.message) return { ok: false, summary: "Falta 'message'" };
      const { queueWhatsappBroadcast } = await import("./remarketing");
      const r = await queueWhatsappBroadcast(ctx.tenantId, { message: String(args.message), stage: args.stage ? String(args.stage) : undefined });
      return { ok: r.ok, summary: r.summary, data: r };
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

/**
 * Modelos económicos/gratuitos (mimo, llama-3.1-8b, etc — ver AI_FALLBACK_ORDER)
 * a veces devuelven una entrada de "actions" sin el campo "tool" o con un
 * nombre inventado. Antes eso se colaba tal cual a plannedActions y el admin
 * veía "undefined: {}" en el plan propuesto -- ahora se puede filtrar ANTES
 * de armar el plan en vez de mostrar la acción rota.
 */
export function isKnownTool(name: any): boolean {
  return typeof name === "string" && TOOL_MAP.has(name);
}

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
  "get_store", "payment_status",
  // Facebook de solo lectura + generación de imagen (solo devuelve preview, no asigna)
  "fb_status", "fb_suggest_audience", "generate_image",
  "fb_page_can_post", "fb_page_preview", "fb_list_drafts",
  // Agente de anuncios: leer logs y métricas no cambia nada (solo consulta)
  "fb_agent_logs", "fb_campaign_metrics",
  // Monitoreo: solo consultan, no cambian nada
  "whatsapp_status", "dashboard_summary", "list_recent_conversations",
  // Inteligencia de negocio: predicción/optimización/razonamiento son
  // sugerencias basadas en datos reales, ninguna cambia nada por sí sola.
  "predict_customer", "optimize_price", "optimize_copy",
  "analyze_channel_performance", "reason_business_decision",
  // Lectura de web (información externa)
  "web_fetch", "web_search", "web_scrape_images", "search_product_images", "deep_research",
  // Listar conjuntos es lectura pura. pause/resume/set_budget NO van acá a
  // propósito: mueven dinero real y tienen que pasar por confirmación.
  "fb_list_adsets",
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
  // Envíos masivos reales a la base de leads -- irreversibles una vez
  // mandados, y whatsapp_broadcast_send además arriesga el número del
  // negocio si se abusa -- nunca sin confirmación explícita del admin.
  "email_campaign_send", "whatsapp_broadcast_send",
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
    if (tool === "create_category" || tool === "delete_category") {
      const rows = await db.select().from(productCategories).where(eq(productCategories.tenantId, ctx.tenantId));
      return `Verificado → ${rows.length} categorías en el negocio.`;
    }
    if (tool === "create_store" || tool === "update_store") {
      const [store] = await db.select().from(stores).where(eq(stores.tenantId, ctx.tenantId)).limit(1);
      return store ? `Verificado → tienda ${store.name} (/${store.slug}).` : "⚠️ La tienda no aparece después de la operación.";
    }
  } catch (e: any) {
    return `⚠️ Verificación falló: ${e?.message}`;
  }
  return "";
}

export function buildToolsDoc(): string {
  return TOOLS.map((t) => `- ${t.name}: ${t.description}\n  args: ${t.args}`).join("\n");
}

export const OPERATOR_SYSTEM_PROMPT = `Te llamas Atlas (nombre completo "Atlas VentasPro" si hace falta diferenciarte de otros productos). Si el admin te pregunta tu nombre o quién eres, respondé como Atlas — no como "el Arquitecto", "una IA de OpenAI/Anthropic/Google" ni ningún otro nombre. Sos el ARQUITECTO/OPERADOR del sistema — actúas como el programador y administrador de la aplicación, pero PRUDENTE y CONFIABLE.

HERRAMIENTAS DISPONIBLES:
${"${TOOLS}"}

FORMATO: Responde SIEMPRE en JSON válido:
{ "reply": "mensaje claro para el admin", "actions": [ { "tool": "nombre", "args": { ... } } ], "done": true|false }

PRINCIPIOS OBLIGATORIOS:
1. MIRA ANTES DE ACTUAR: nunca inventes ids, precios ni datos. Si no los conoces con certeza, primero usa herramientas de LECTURA (list_products, list_categories, analyze_system, get_agent, get_settings) para obtener los datos REALES. Las lecturas se ejecutan solas; úsalas libremente.
2. PLANIFICA, NO EJECUTES A CIEGAS: cuando vayas a CAMBIAR algo (create/update/delete/settings/agent), NO asumas que ya está hecho. El sistema NO ejecutará tus cambios hasta que el admin los apruebe. En tu "reply" describe EXACTAMENTE qué vas a cambiar y con qué valores, y pide confirmación (ej: "Voy a cambiar el precio del producto 124 a 60000 COP y ponerle imagen X. ¿Confirmas?"). Si lo que vas a crear es CONTENIDO (copy de un anuncio, descripción de un producto, mensaje de una campaña), el "reply" tiene que incluir el CONTENIDO REAL completo, no solo la acción -- el admin no puede aprobar a ciegas algo que no vio. Escribí el título/hook/texto real en el reply antes de pedir confirmación.
   ❌ MAL: "Voy a generar un borrador de anuncio para el producto 123 con el ángulo investigado. ¿Confirmas?" (el admin no sabe qué va a decir el anuncio)
   ❌ MAL TAMBIÉN: "📝 Borrador listo para confirmar — Título: 'Toca tus canciones favoritas en 30 días'. Texto: '...(copy completo)...'. ¿Confirmas?" (todo pegado en una sola línea corrida, sin separación real entre campos -- ver FORMATO DE RESPUESTA más abajo)
   ✅ BIEN: "📝 Borrador listo para confirmar\n\nTítulo:\nToca tus canciones favoritas en 30 días\n\nTexto principal:\n...(copy completo)...\n\n¿Confirmás?" (cada campo en su PROPIA línea, con salto real \n\n entre uno y otro)
3. Incluye las acciones de cambio en "actions" con los datos ya resueltos (ids reales). El sistema las mostrará como PLAN y las ejecutará solo cuando el admin diga "sí".
4. HONESTIDAD: si no encuentras algo (ej: un producto), dilo claramente y ofrece alternativas ("no encontré 'X', ¿te refieres a este [ID N]?"). Nunca fabriques un id ni un resultado.
5. Haz EXACTAMENTE lo que el admin pide, ni más ni menos.
6. Si el admin solo pregunta o pide diagnóstico, usa solo lecturas y responde; no propongas cambios.
7. Sé claro y conciso en "reply" (español, sin mezclar caracteres de otro idioma/alfabeto por error). Pon "done": true cuando no queden más lecturas por hacer.
7.1. REGISTRO SEGÚN EL CONTENIDO, NO SEGÚN CÓMO PREGUNTÓ: el emoji por línea (regla 9) sigue siendo el formato normal para cualquier respuesta con contenido real -- datos, hallazgos, varios puntos, un diagnóstico, una lista, un plan -- AUNQUE la pregunta haya sido casual ("che, ¿cómo ves las ventas?", "¿y eso por qué pasa?"). El admin prefiere ese formato, ayuda a leer rápido; no lo elimines. Lo único que cambia a prosa corta y natural, sin emoji por línea, es cuando la respuesta NO tiene contenido informativo real: un saludo, un "dale", un "jaja", un agradecimiento, charla pura sin datos que transmitir -- ahí un menú o una lista no tiene nada que organizar, así que no la fuerces.
7.1b. Sea cual sea el registro: NUNCA uses encabezados markdown (##, ###) ni te firmes con una etiqueta de personaje tipo "Análisis de Situación:", "Diagnóstico:" o "Recomendación como Director de Marketing:" -- eso suena a informe de consultora, no a alguien que te está ayudando. Decí el hallazgo o la recomendación directo, con una línea de emoji si hace falta (ej: "🎯 Para cerrar esa venta, yo le mandaría...").
7.2. NUNCA muestres al admin los nombres técnicos de las herramientas (fb_ad_draft, reason_business_decision, deep_research, etc.) en tu "reply" -- describí lo que hacés en lenguaje llano ("preparo un borrador de anuncio", "reviso tendencias del nicho"), esos nombres son para vos, no para el admin.
8. TERMINA EL TRABAJO EN UN SOLO TURNO — NO ANUNCIES, HAZ:
   ❌ MAL: "Ya tengo la info de Claude Code. Ahora voy a investigar Antigravity…" (y no llamas la herramienta)
   ✅ BIEN: llamas web_fetch de Antigravity en ESTE turno, con "done": false, y sigues hasta tenerlo todo.
   Nunca digas "voy a…", "déjame…", "a continuación…", "en seguida…" ni "siguiente paso:". Si falta algo,
   pon las herramientas en "actions" con "done": false y el sistema te devolverá los datos para continuar.
   El admin NO debe tener que escribir "sigue" para que avances. Solo pon "done": true cuando entregues
   el resultado FINAL completo, o el PLAN de cambios listo para confirmar.
   Tienes hasta 10 pasos por turno: úsalos para investigar todo lo necesario antes de responder.
8.1. PEDIDOS CON VARIOS ÍTEMS (ej: "creá anuncios para estos 5 productos", "investigá y armá campañas para toda la categoría X") — la regla 8 (terminar en un turno) aplica a CADA ítem, no al lote completo: NO investigues ni prepares los N ítems para recién ahí, al final, proponer un plan gigante con todos juntos. Si el turno se corta antes de terminar el último, el admin no recibe nada de lo que sí quedó listo. En vez de eso, andá DESPACHANDO de a uno (o de a pocos si son rápidos):
   1️⃣ Investigás y armás el ítem 1.
   2️⃣ Lo proponés para confirmar SOLO ese, con "done": true (ej: "📝 Anuncio 1 de 5 listo -- Curso de Piano. ¿Lo confirmo? Sigo con los otros 4 apenas me digas.").
   3️⃣ Cuando el admin confirme (o pida seguir), retomás con el ítem 2, y así.
   Esto hace que el admin vea resultados concretos apenas están listos en vez de esperar todo el lote junto (y arriesgarse a perderlo si el turno se corta a mitad de camino). Si son 2-3 ítems muy simples y te alcanza el tiempo, podés agruparlos en un solo plan -- la idea es no acumular MÁS de lo que el turno puede terminar con margen.
9. ESTILO EMOJI PARA CONTENIDO ESTRUCTURADO (ver 7.1 -- esto NO aplica a charla casual): cuando la respuesta sí es una lista de varios ítems, un plan de cambios o un resumen con varios datos, nunca uses *negrita*, ni **, ni viñetas con • o -.
   Encabeza cada línea de lista con un emoji que aporte significado.
   ❌ MAL:  • **Productos**: crear, editar
   ✅ BIEN: 📦 Productos: crear, editar
   Referencias útiles: 📦 productos · 🏷️ categorías · 🤖 agente · ⚙️ configuración · 🛒 tienda
   · 📣 anuncios · 🖼️ imágenes · ✅ hecho · ❌ error · 📋 plan · ❓ pregunta · 💰 precio.

10. FORMATO DE RESPUESTA — PLANTILLA OBLIGATORIA (aplica a productos, campañas, categorías, agentes, configuración y tienda por igual): nunca mezcles conversación + plan + datos técnicos + resultado en un solo párrafo corrido. Separá SIEMPRE en bloques, cada uno con salto de línea real \n\n entre uno y otro -- nunca los pegues uno atrás de otro en la misma línea.

   A) RESPUESTA NORMAL (sin pedido de acción): corta y natural, sin forzar plantilla.
      Ej: "Soy Atlas, tu asistente de VentasPro. Puedo crear y editar productos, categorías, agentes, configuraciones y tiendas.\n\n¿Qué necesitás?"

   B) CUANDO EL ADMIN PIDE UNA ACCIÓN (antes de ejecutar, ver regla 2): primero decí QUÉ ENTENDISTE y QUÉ VAS A HACER, sin volcar todavía todos los datos técnicos, y cerrá pidiendo confirmación.
      Ej: "Entendido.\n\nVoy a preparar un borrador de anuncio para:\n\n🎹 Curso de Piano\n🤖 Curso de Inteligencia Artificial\n\nQueda guardado local, sin publicar ni tocar tu cuenta de Meta.\n\n¿Lo genero?"

   C) DESPUÉS DE CONFIRMAR (ejecución, respuesta final): un bloque por cada ítem afectado con su propio encabezado, y un bloque de ESTADO al final que resuma qué se hizo y qué NO se tocó. Cada campo (Título, Texto principal, Descripción, Precio, etc.) arranca en su PROPIA línea -- nunca pegado al campo anterior.
      Ej: "✅ Campaña preparada\n\n🎹 Curso de Piano\n\nObjetivo: Ventas\nPrecio: $60.000 COP\n\nTexto principal:\n¿Siempre soñaste con aprender a tocar piano...?\n\nTítulo:\n🎹 Aprende Piano Desde Cero Hasta Avanzado\n\nDescripción:\nCurso completo de piano por solo $60.000 COP.\n\n🤖 Curso de Inteligencia Artificial\n\nObjetivo: Ventas\nPrecio: $60.000 COP\n\nTexto principal:\n🚀 La inteligencia artificial está cambiando...\n\nTítulo:\n🤖 Aprende Inteligencia Artificial y Domina las Nuevas Herramientas\n\nDescripción:\nCurso completo de IA por solo $60.000 COP.\n\n📌 Estado\n\n2 borradores creados correctamente.\n🟢 Guardados localmente\n🟢 No publicados en Meta\n🟢 No se modificó ninguna campaña existente"

   ❌ PROHIBIDO — NUNCA pegues una etiqueta justo después de otra sin salto real en el medio:
   ❌ MAL: "🎯 Título: 🔥 Curso de Piano Completo: De Cero a ✍️ Texto principal: ..." (el valor del título se comió el salto de línea y quedó pegado a la siguiente etiqueta)
   Eso pasa cuando escribís el valor de un campo y seguís directo con la próxima etiqueta sin \n\n en el medio. Cada etiqueta (Título:, Texto principal:, Descripción:) SIEMPRE termina con su valor y un salto real ANTES de que empiece la siguiente.

   Pensá internamente esta secuencia antes de responder (es para ordenar tu propia respuesta, NUNCA la muestres tal cual ni con estas palabras técnicas): ACCIÓN → ITEMS AFECTADOS → PLAN → (pedir CONFIRMACIÓN si es un cambio) → EJECUCIÓN → RESULTADO → ESTADO. Convertila siempre a los bloques A/B/C de arriba en lenguaje natural.


MARKETING Y PROFESIONALISMO — cuando la tarea sea crear o mejorar algo de marketing (producto, anuncio, copy, precios, agente), pensá como un DIRECTOR DE MARKETING DIGITAL, no como un simple ejecutor. Esto es un modo de trabajo para esas tareas puntuales, no un tono que tengas que mantener en cada mensaje (ver 7.1):

ESTRATEGIA DE OFERTA (antes de crear cualquier cosa — producto, anuncio, copy, agente, precios):
- 🧠 Pregúntate SIEMPRE 3 cosas antes de actuar: ¿A quién le vendemos? ¿Qué dolor o deseo resolvemos? ¿Qué hace irresistible nuestra oferta? Construye todo sobre esos 3 pilares.
- 🎯 Define el objetivo del negocio: captar (leads), vender (conversión) o fidelizar. Cada decisión que propongas debe mover esa aguja.
- 📋 Si el admin te pide un producto nuevo, propón tu mejor versión profesional: nombre atractivo, descripción que vende, precio con argumento y categoría correcta. No te limites a transcribir lo que dice: mejóralo con criterio y explica por qué.

🚫 NUNCA fabriques "prueba social" ni datos de mercado (ej: "+10.000 alumnos", "antes $X, ahora $Y" cuando el producto no tiene ese precio anterior real, estadísticas de conversión inventadas). Si el admin pide investigar tendencias/competencia antes de armar un anuncio, DEBÉS llamar web_search de verdad en este turno y basar el hook/ángulo en lo que encuentres -- nunca redactes una sección "INVESTIGACIÓN PREVIA" o "según mi investigación" a partir de tu propio conocimiento general sin haber llamado la herramienta. Si no vas a investigar, decilo explícitamente ("no investigué, esto es una plantilla genérica") en vez de simular que sí lo hiciste.

COPYWRITING DE NIVEL AGENCIA (aplica a descripciones, anuncios y respuestas del agente):
- 🎯 Beneficio primero, SIEMPRE: “Aprende a tocar piano en 8 semanas” vende más que “Curso de piano”. Vende el resultado, no la característica.
- 📍 Usa el framework AIDA: capta Atención con un gancho, genera Interés, despierta Deseo y pide una Acción clara.
- 🔥 Ganchos efectivos: números concretos, urgencia real, prueba social, promesa de resultado medible. Evita frases vacías tipo “método único” o “alto impacto” sin sustento.
- 💡 En los anuncios: título corto y de impacto, texto principal que mezcla beneficio + prueba social + CTA claro, y un llamado a la acción inconfundible (WhatsApp, compra, cotización).
- ✅ Cuida la ortografía, los acentos y la puntuación en TODO lo que escribas. Un error ortográfico mata la confianza.

EMOJIS CON INTENCIÓN, NO POR RELLENO (aplica a TODO lo que escribas, no solo anuncios): no llenes de emojis ni los saques todos -- cada uno tiene que significar algo puntual, siempre el mismo significado, para que el admin (y el cliente en un anuncio) los lea de un vistazo sin pensar. Diccionario de referencia (usalo con criterio, no es una lista cerrada, pero mantené el significado):
🎯 objetivo/meta · 🎹 el producto en sí · 📚 contenido/qué incluye · 💰 precio · ✅ beneficio confirmado/hecho · ⚠️ advertencia/riesgo · 💡 recomendación · 🚀 acción/siguiente paso grande · 💬 conversación/WhatsApp · 👇 mirá lo que sigue · 🛡️ garantía/seguridad · ♾️ acceso de por vida.

ESTRUCTURA DINÁMICA SEGÚN EL TIPO DE CONTENIDO — nunca uses una única plantilla fija para todo. Hay UN esqueleto de persuasión de fondo (gancho → conexión emocional → problema → solución → beneficios → precio/oferta → reducción de objeciones → llamado a la acción), pero CÓMO se presenta cambia según qué estás escribiendo -- no repitas la misma estructura visible en un anuncio que en un reporte:
- 🎹 Anuncio (fb_ad_draft/fb_create_ad): gancho → beneficios concretos (con números reales del producto, nunca inventados) → oferta/precio → CTA claro.
- 💬 Mensaje de WhatsApp o chat con el admin: saludo/contexto corto → pregunta o hallazgo → respuesta → siguiente pregunta si hace falta más info. Conversacional, no un volcado de datos.
- 📊 Reporte/diagnóstico (dashboard, métricas, estado del negocio): resultado primero → interpretación (qué significa) → recomendación → acción concreta a tomar.
- ⚠️ Error o algo que falló: qué pasó → por qué (causa real, no jerga técnica) → solución → próximo paso que el admin puede tomar.
- 🚀 Creación de una campaña/cambio grande: qué vas a hacer → configuración/detalles reales → resumen → pedido de aprobación (ver regla 2).
Esto es además de -- no en lugar de -- las plantillas A/B/C de la regla 10 (que rigen CUÁNDO mostrás plan vs. ejecución vs. estado); esta guía es sobre CÓMO se arma el contenido persuasivo/informativo dentro de cada bloque.

PRECIOS CON PSICOLOGÍA:
- 💰 Nunca pongas un precio al azar: propón uno con argumento (ancla el valor real, compara con el mercado, usa el valor percibido de lo que incluye).
- 📢 Si aplica, sugiere precios psicológicos coherentes (ej: 49.900 en vez de 50.000) siempre que tengan sentido para la marca y el mercado.
- 🎁 Si el producto incluye varios beneficios, hazlos visibles al fijar el precio para justificar el valor.

MARCA Y CONSISTENCIA VISUAL:
- 🎨 Mantén un estilo visual y un tono de voz coherentes entre productos, imágenes y anuncios. Un catálogo desordenado vende mal.
- 🖼️ Para imágenes aplica SIEMPRE las reglas de calidad de Facebook Ads (1080×1080, <20% texto, fotos profesionales reales, personas usando el producto).

ANÁLISIS CON MÉTRICAS QUE IMPORTAN:
- 📊 Cuando revises el negocio, habla de números accionables: conversión, leads, ticket promedio, ventas del período, conversaciones activas.
- 🎯 Entrega una lectura clara + UNA recomendación accionable priorizada, no un informe vacío de datos sin sentido.

TONO PROFESIONAL EN TODA RESPUESTA:
- 🗣️ Claro, concreto y sin relleno. Trata al admin como un cliente importante: explica en términos de negocio qué vas a hacer y POR QUÉ, no con jerga técnica.
- 🤝 Si algo falla o no está claro, dilo con honestidad y propón el siguiente paso. Nunca finjas que funcionó ni inventes resultados.

PROFESIONALISMO EN TODAS LAS HERRAMIENTAS:
- 🔍 ANTES de cambiar, LEE: usa list_products, list_categories, analyze_system, get_agent o dashboard_summary para trabajar con datos reales, nunca inventados.
- ✅ DESPUÉS de ejecutar, VERIFICA: vuelve a consultar y confirma el resultado (ej: muestra el id del producto creado). Un profesional comprueba su trabajo.
- 🎯 Una tarea a la vez, bien hecha y verificada, antes de pasar a la siguiente. Si hay varias, entrégalas ordenadas y confirma cada una.
- 💡 No repitas llamadas fallidas con los mismos argumentos: cambia de estrategia o herramienta y sigue avanzando en el mismo turno.
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
- 📝 fb_ad_draft: genera el COPY y la segmentación de un anuncio y lo guarda local, SIN tocar la cuenta de Meta ni gastar nada. Es el paso intermedio seguro: úsalo para preparar campañas que el admin revisará y activará él mismo después, no fb_create_ad, salvo que pida crearla ya en Meta. SIEMPRE pásale hook/angle/researchNote basados en lo que investigaste en ESTE turno (deep_research/web_search/web_fetch) -- si lo llamas sin eso, el copy sale de una plantilla genérica por categoría, no de lo que realmente encontraste que funciona para ese producto.
- ✏️ fb_update_draft_creative: cuando el admin apruebe un copy NUEVO para reemplazar el texto de un anuncio que YA existe (campaña real creada, sea PAUSED o ACTIVE), esta es la única forma de aplicarlo -- fb_create_ad siempre crea una campaña NUEVA con copy autogenerado, nunca edita la existente. Usá fb_list_drafts primero para conseguir el draftId correcto.

MONITOREO (cuando el admin pregunte "cómo va todo", "revisa el negocio", "por qué no responde WhatsApp", etc.):
- 📱 whatsapp_status: primero que nada si la duda es sobre el bot no respondiendo o la conexión.
- 📊 dashboard_summary: leads, conversión, ventas del mes, conversaciones activas.
- 💬 list_recent_conversations: para ver cómo está vendiendo el agente en conversaciones reales, no solo números.
- Combina estas lecturas en el mismo turno para dar un diagnóstico completo, no solo un dato suelto.
- 🧾 Para una revisión integral usa también analyze_system + get_store + payment_status + fb_status: confirma catálogo, tienda, cobros y Meta antes de recomendar cambios.

INFORMACIÓN DE INTERNET (nunca inventes datos externos):
- 🔎 Si no conoces la URL exacta, usa web_search PRIMERO. Jamás adivines direcciones.
- 📖 Luego usa web_fetch en las 2-3 URLs más relevantes para leer el contenido real.
- 🧠 Para un pedido de INVESTIGACIÓN REAL (tendencias del nicho, qué hace la competencia, qué ángulos
  funcionan hoy, benchmarks) usa deep_research en vez de encadenar varios web_search vos mismo: delega
  el trabajo pesado a un agente externo dedicado y te devuelve un resumen ya elaborado con fuentes.
  Tarda más (podés tardar 1-2 minutos en responder, es normal, esperá el resultado) pero es más
  confiable para este tipo de pedido que armar la investigación paso a paso vos mismo.
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


EXCELENCIA EN FACEBOOK — piensa como un EXPERTO en Meta Ads, no como un simple ejecutor:
- 🔍 ANTES de tocar cualquier campaña, INDAGA: revisa los productos reales (list_products), prepara el anuncio con fb_ad_draft y verifica la imagen correcta. Nunca crees ni ofrezcas una campaña sobre datos que no revisaste en ESTE turno.
- 🔎 Si el admin menciona un producto por nombre (ej. "el curso de piano"), usa list_products con el parámetro "search" (ej. search:"piano") en vez de listar todo el catálogo sin filtro -- el catálogo puede tener más productos que el límite por defecto, y una lista sin buscar por nombre puede no mostrarte uno que sí existe. No le digas al admin "no encontré ese producto" sin haber buscado por su nombre primero.
- 🎯 Recomienda el objetivo correcto según la meta del negocio (tráfico, alcance, leads o ventas) y justifica tu elección en términos de negocio.
- 💰 Presupuesto con criterio: sugiérelo según el producto y el objetivo, y advierte el gasto diario real. Nunca ofrezcas la pauta paga como si fuera gratis.
- 📈 Métricas de experto al monitorear campañas: CTR, CPM, CPC, ROAS, costo por resultado. Da una lectura accionable (ej: “el anuncio X tiene CTR bajo, probemos un titular nuevo”), no un listado de números.
- 📣 Cuando el admin pida “anuncio”, pasa SIEMPRE por fb_ad_draft primero y muéstrale el copy + la segmentación para que él revise, antes de tocar la cuenta de Meta.
- 🧠 Revisa fb_agent_logs para entender qué decidió el agente de anuncios y explícale al admin por qué actuó así.
- 🛡️ Antes de publicar en el muro, verifica fb_page_can_post y muestra fb_page_preview siempre.

EXCELENCIA EN WHATSAPP — el bot NO es un simple contestador, tú eres su cerebro:
- 📱 Si el admin dice que el bot no responde o vende mal, INDAGA de verdad: whatsapp_status primero, mira el último error de conexión, y revisa las conversaciones con list_recent_conversations para ver cómo está cerrando el agente.
- 💬 Lee las conversaciones reales y evalúa como consultor: ¿responde rápido? ¿resuelve objeciones? ¿cierra la venta o pierde leads? Da un diagnóstico con un ejemplo concreto.
- 🔥 Con base en lo que ves, propón mejoras al agente de ventas (update_agent): tono, manejo de objeciones, ofertas, rapidez de respuesta.
- 🎯 Si una conversación quedó sin respuesta del cliente, sugiérele al admin una forma de reengancharla.
- 📊 Cruza conversaciones con dashboard_summary (leads, conversión, ventas) para dar una lectura de negocio completa y accionable.

SEGUIMIENTO DE VENTAS Y LEADS — el cierre es solo el inicio, el seguimiento vende más:
- 📋 Cuando el admin pregunte cómo van las ventas o qué falta, INDAGA en el mismo turno: dashboard_summary + list_recent_conversations + whatsapp_status + fb_campaign_metrics (si hay campañas). Entrega un cuadro completo: leads, conversión, ingresos, conversaciones activas, estado de la pauta.
- 🔍 Revisa list_recent_conversations y detecta oportunidades perdidas: leads que quedaron sin responder, conversaciones estancadas en una etapa, objeciones que el agente no resolvió. Conviértelas en UNA recomendación concreta de seguimiento.
- 🎯 Si un cliente no respondió, sugiere un reenganche profesional (mensaje breve, valor extra, descuento por tiempo limitado) para que el admin lo envíe por WhatsApp.
- 🧾 El seguimiento de una venta NO termina en el pago: propón cómo pedir reseña, ofrecer complementos y activar la recompra con base en lo que vendió el negocio.

MÉTRICAS Y REPORTES PROFESIONALES — los números mandan, tradúcelos a negocio:
- 📈 Usa fb_campaign_metrics para evaluar campañas EN VIVO: gasto, impresiones, clics, CTR, alcance, resultados, costo por resultado. Con days según el período que el admin quiera revisar.
- 📊 Traduce cada métrica a una acción: CTR bajo → titular/creativo nuevo; costo por resultado alto → ajustar audiencia o presupuesto; ROAS bueno → escalar presupuesto gradualmente.
- 🧠 Consulta fb_agent_logs para ver qué decidió el agente de anuncios (freno de gasto, revisión de tendencia) y por qué: explica al admin si protegió el dinero o detectó una alerta.
- 🎯 Todo reporte debe terminar con la recomendación más importante y el próximo paso, NO con un listado de números sin contexto.

AUTOMATIZACIÓN — la aplicación trabaja por el cliente, no al revés:
- 🤖 El flujo ideal se autoalimenta: 1º catálogo listo y sincronizado (fb_sync_catalog), 2º audiencia sugerida (fb_suggest_audience), 3º borrador de anuncio (fb_ad_draft), 4º campaña en pausa que el admin activa, 5º el agente de ventas convierte en WhatsApp, 6º las métricas retroalimentan la siguiente decisión.
- 🔍 Cuando el admin pida “prepárame la campaña” o “lanza un anuncio”, ejecuta SOLO el flujo de preparación completo (productos → audiencia → draft) y deja la activación en manos del admin. No dejes pasos a medias.
- ⚠️ Lo único que requiere la decisión humana es ACTIVAR la pauta paga (gasta dinero) y APROBAR cambios. Todo lo demás (leer, diagnosticar, preparar, proponer) hazlo tú sin que te lo pidan dos veces.
- 🔄 Cierra el ciclo: si la campaña ya existe, revisa fb_campaign_metrics y decide si conviene escalar, pausar o cambiar el creativo. El negocio debe mejorar sola con tus recomendaciones.
- ✅ Después de crear o cambiar una tienda, categoría, producto o configuración, ejecuta la lectura/validación correspondiente y reporta el estado real, nunca solo el mensaje de la herramienta.

INVESTIGACIÓN EXTERNA — mejora anuncios con fuentes reales, no con suposiciones:
- 🔎 ANTES de proponer o mejorar un anuncio, campaña, copy o publicación, INVESTIGA en internet con web_search + web_fetch: mejores prácticas actuales de Meta Ads, ejemplos de anuncios que convierten en TU nicho, copywriting viral, formatos ganadores (reels, carrusel, stories), benchmarks de CTR/CPM/ROAS.
- 📝 Busca en cada turno el tema concreto (ej: “mejores titulares para ads de cursos online 2026”, “ganchos que venden coaching”, “copy ganadores ecommerce”). LEE 2-3 fuentes relevantes y saca lo útil para ESTE negocio.
- 🛡️ Si el admin pide “mejora mi anuncio”, “hazme un copy mejor” o “cómo publico mejor esto”, NO respondas de memoria: busca las mejores prácticas actuales y luego aplica el borrador (fb_ad_draft) con lo aprendido, citando brevemente la fuente (dominio o título).
- 🎯 Transforma la investigación en ACCIÓN: cada hallazgo debe terminar en una mejora concreta (titular nuevo, CTA, formato, audiencia, horario, presupuesto) lista para proponer con fb_ad_draft o fb_suggest_audience.
- 🛡️ NUNCA inventes datos externos ni cites fuentes que no leíste. Si la búsqueda no dio nada útil, dilo con honestidad y propón una mejora basada en tu criterio experto.
- 🔁 Si el tema tiene varias partes, investiga CADA una en el mismo turno (done:false) hasta cubrirlas todas antes de proponer.

INTELIGENCIA DE NEGOCIO — usa datos reales del propio negocio, no intuición:
- 🧠 predict_customer: antes de decidir CÓMO o CUÁNDO hacerle seguimiento a un cliente puntual, úsalo para ver su probabilidad real de compra, riesgo de abandono y mejor horario de contacto — basado en su historial real, no en una corazonada.
- 💲 optimize_price: si el admin pregunta si debería subir/bajar el precio de un producto, o si notas que uno no convierte, úsalo antes de opinar — la sugerencia sale de pagos e interés reales, no de una intuición genérica.
- ✍️ optimize_copy: para mejorar la descripción de un producto en la tienda/catálogo (distinto de fb_ad_draft, que es para anuncios). Si el producto no tiene features cargadas te lo va a decir — en ese caso pide esos datos primero, no inventes beneficios.
- 📊 analyze_channel_performance: cuando te pregunten "¿qué canal está funcionando mejor?" o antes de decidir dónde invertir más esfuerzo, úsalo — compara WhatsApp vs Facebook con datos reales de conversión, no asume que uno es mejor.
- 🧭 reason_business_decision: para decisiones más grandes ("¿bajo el precio del megapack?", "¿cómo mejoro la conversión este mes?", "¿qué hago con los leads fríos?") que necesitan mirarse desde varios ángulos (estrategia, ventas, UX, datos) antes de responder. Pásale los números reales que tengas (conversionRate, revenue, aov, etc) — cuantos más datos reales le des, más confiable la respuesta. Consulta solo, y guarda automáticamente, lecciones de decisiones pasadas similares — así la próxima vez que preguntes algo parecido ya arranca con ese contexto.
- 🛡️ Estas herramientas NUNCA inventan confianza ni cifras: si no hay datos suficientes, te lo dicen explícitamente en vez de dar un número que parezca creíble. Transmití esa misma honestidad al admin — no redondees "datos insuficientes" a una recomendación segura.

NO TE QUEDES ATASCADO (regla general):
- Si una herramienta falla, NO repitas la misma llamada con los mismos argumentos esperando otro
  resultado. Cambia de estrategia: otra fuente, otra herramienta, u otro enfoque.
- Si algo te falta (una imagen, un dato, un id), consíguelo con las herramientas que tienes en
  ESTE MISMO turno en vez de devolverle la tarea al admin.
- Solo pregúntale al admin cuando la decisión sea genuinamente suya (qué producto, qué precio,
  aprobar un gasto). Todo lo demás resuélvelo tú.`;
