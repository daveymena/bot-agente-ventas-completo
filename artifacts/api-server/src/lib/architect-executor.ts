import { architectTools } from "./architect-tools";
import { adStrategist } from "./ad-strategist";
import { facebookMarketplaceService as fbMarketplace } from "./facebook-marketplace";
import { logger } from "./logger";

/**
 * ARCHITECT EXECUTOR
 * ------------------
 * Puente entre lo que la IA Arquitecta DECIDE hacer y la ejecución REAL.
 *
 * Antes, el chat del Arquitecto solo devolvía texto ("listo", "ya lo publiqué")
 * pero nunca llamaba a ninguna herramienta: no pasaba nada. Este módulo recibe
 * el arreglo `actions[]` que la IA emite en su JSON y ejecuta cada acción contra
 * los servicios reales que ya existen (productos, anuncios de Facebook,
 * marketplace). Devuelve un reporte VERÍDICO de lo que ocurrió, de modo que la
 * respuesta al usuario refleje la ejecución real y la IA no pueda "mentir".
 */

export interface ArchitectAction {
  /** Nombre de la herramienta a ejecutar (ver ARCHITECT_TOOLS_DOC). */
  tool: string;
  /** Argumentos de la herramienta. */
  args?: Record<string, any>;
}

export interface ActionResult {
  tool: string;
  ok: boolean;
  summary: string;
  data?: any;
  error?: string;
}

/** Verifica que las variables de entorno de Facebook estén configuradas. */
function facebookReady(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!process.env.FB_ACCESS_TOKEN) missing.push("FB_ACCESS_TOKEN");
  if (!process.env.FB_AD_ACCOUNT_ID) missing.push("FB_AD_ACCOUNT_ID");
  return { ok: missing.length === 0, missing };
}

const num = (v: any): number => Number(v?.productId ?? v?.id ?? v);

/**
 * Documentación de herramientas que se inyecta en el prompt de la IA para que
 * sepa exactamente qué puede ejecutar y con qué argumentos.
 */
export const ARCHITECT_TOOLS_DOC = `
HERRAMIENTAS QUE PUEDES EJECUTAR DE VERDAD (colócalas en el arreglo "actions"):

PRODUCTOS:
- { "tool": "analyze_system" }                                        → analiza el estado del negocio
- { "tool": "create_product", "args": { "name": "...", "price": 0, "description": "...", "category": "..." } }
- { "tool": "improve_product", "args": { "productId": 5 } }           → mejora un producto
- { "tool": "improve_all_products", "args": { "limit": 100 } }        → mejora masiva
- { "tool": "set_product_image", "args": { "productId": 5, "imageUrl": "https://..." } }
- { "tool": "delete_product", "args": { "productId": 5 } }            → IRREVERSIBLE, requiere confirmación

FACEBOOK (anuncios y catálogo):
- { "tool": "create_ad_draft", "args": { "productId": 5 } }           → crea borrador de anuncio de UN producto
- { "tool": "create_ad_drafts_all" }                                  → crea borradores para TODOS los productos
- { "tool": "publish_ad_draft", "args": { "draftId": 3 } }            → PUBLICA un anuncio (requiere confirmación)
- { "tool": "create_marketplace_listing", "args": { "productId": 5 } }→ publica un producto en Marketplace
- { "tool": "sync_marketplace" }                                      → sincroniza todo el catálogo (requiere confirmación)
`.trim();

/** Herramientas irreversibles / que publican hacia afuera → exigen confirmación. */
export const CONFIRMATION_REQUIRED = new Set<string>([
  "publish_ad_draft",
  "create_ad_drafts_all",
  "sync_marketplace",
  "delete_product",
]);

/**
 * Ejecuta la lista de acciones que la IA decidió y devuelve un reporte real.
 */
export async function executeArchitectActions(
  actions: ArchitectAction[] | undefined,
  ctx: { tenantId: number },
): Promise<ActionResult[]> {
  const results: ActionResult[] = [];
  if (!Array.isArray(actions) || actions.length === 0) return results;

  for (const action of actions) {
    const tool = String(action?.tool || "").trim();
    const args = (action?.args || {}) as Record<string, any>;
    let result: ActionResult;

    try {
      switch (tool) {
        // ─── PRODUCTOS ──────────────────────────────────────────────────────
        case "analyze_system": {
          const analysis = await architectTools.analyzeSystem();
          result = { tool, ok: true, summary: "Sistema analizado", data: analysis };
          break;
        }
        case "create_product": {
          const product = await architectTools.createProduct({ ...args, tenantId: ctx.tenantId } as any);
          result = { tool, ok: !!product, summary: product ? `Producto creado: ${product.name}` : "No se pudo crear el producto", data: product };
          break;
        }
        case "improve_product": {
          const r = await architectTools.improveProduct(num(args));
          result = { tool, ok: !!r, summary: r ? `Producto mejorado: ${r.name}` : "Producto no encontrado", data: r };
          break;
        }
        case "improve_all_products": {
          const r = await architectTools.bulkImproveProducts(Number(args.limit) || 100);
          result = { tool, ok: true, summary: `${r.improved}/${r.total} productos mejorados`, data: r };
          break;
        }
        case "set_product_image": {
          const ok = await architectTools.setCustomImage(num(args), String(args.imageUrl || ""));
          result = { tool, ok, summary: ok ? `Imagen actualizada (producto #${num(args)})` : "Producto no encontrado" };
          break;
        }
        case "delete_product": {
          const ok = await architectTools.deleteProduct(num(args));
          result = { tool, ok, summary: ok ? `Producto eliminado (#${num(args)})` : "Producto no encontrado" };
          break;
        }

        // ─── FACEBOOK ───────────────────────────────────────────────────────
        case "create_ad_draft": {
          const fb = facebookReady();
          if (!fb.ok) { result = { tool, ok: false, summary: `Faltan variables de Facebook: ${fb.missing.join(", ")}`, error: "fb_not_configured" }; break; }
          const draft = await adStrategist.createDraftAd(process.env.FB_AD_ACCOUNT_ID || "", process.env.FB_ACCESS_TOKEN || "", num(args));
          result = { tool, ok: !!draft, summary: draft ? `Borrador de anuncio creado (producto #${num(args)})` : "No se pudo crear el borrador", data: draft };
          break;
        }
        case "create_ad_drafts_all": {
          const fb = facebookReady();
          if (!fb.ok) { result = { tool, ok: false, summary: `Faltan variables de Facebook: ${fb.missing.join(", ")}`, error: "fb_not_configured" }; break; }
          const r = await adStrategist.createDraftsForAllProducts();
          result = { tool, ok: true, summary: "Borradores de anuncios generados para todos los productos", data: r };
          break;
        }
        case "publish_ad_draft": {
          const fb = facebookReady();
          if (!fb.ok) { result = { tool, ok: false, summary: `Faltan variables de Facebook: ${fb.missing.join(", ")}`, error: "fb_not_configured" }; break; }
          const ok = await adStrategist.publishDraft(num({ id: args.draftId ?? args.id }));
          result = { tool, ok, summary: ok ? `Anuncio publicado en Facebook (borrador #${args.draftId ?? args.id})` : "No se pudo publicar el anuncio" };
          break;
        }
        case "create_marketplace_listing": {
          const listing = await fbMarketplace.createListing(num(args));
          result = { tool, ok: !!listing, summary: listing ? `Publicación de Marketplace creada (producto #${num(args)})` : "No se pudo crear la publicación de Marketplace", data: listing };
          break;
        }
        case "sync_marketplace": {
          const r = await fbMarketplace.syncActiveProducts();
          result = { tool, ok: true, summary: "Catálogo de Marketplace sincronizado", data: r };
          break;
        }

        default:
          result = { tool: tool || "(desconocida)", ok: false, summary: `Herramienta no reconocida: ${tool}`, error: "unknown_tool" };
      }
    } catch (e: any) {
      logger.error({ tool, error: e?.message }, "[ArchitectExecutor] Acción fallida");
      result = { tool, ok: false, summary: `Error al ejecutar ${tool}: ${e?.message || "desconocido"}`, error: e?.message };
    }

    results.push(result);

    // Registrar la acción en el historial (best-effort).
    try {
      await architectTools.logAction(ctx.tenantId, `Arquitecto ejecutó: ${tool}`, result.summary, { tool, args, ok: result.ok });
    } catch {
      /* logging no debe romper la ejecución */
    }
  }

  return results;
}

/** Convierte los resultados en un bloque de texto para mostrar al usuario. */
export function formatExecutionReport(results: ActionResult[]): string {
  if (!results.length) return "";
  const lines = results.map((r) => `${r.ok ? "✅" : "❌"} ${r.summary}`);
  return `\n\n━━━━━━━━━━━━━━━━━━━━\n📋 Resultado real de la ejecución:\n${lines.join("\n")}`;
}
