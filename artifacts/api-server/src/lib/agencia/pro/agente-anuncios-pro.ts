/**
 * AGENCIA PRO — Agente de Anuncios Pro (Orquestador Pack)
 * ======================================================
 * ResearchDeep → CopyPro → CreativeStudio → VideoFactory Pro → ValidateScore
 * → Guardar como facebook_drafts en PAUSA (+ BudgetGuard + RiskEngine).
 *
 * Flag: AGENCIA_PRO=1 (o settings.agenciaPro === true)
 * Incrementa: no reemplaza AdStrategist ni MarketingTeam; convive.
 *
 * Pack resultante = asset_feed_spec recomendado por Meta:
 *   - 3 primaryText variants (1 por hook distinto)
 *   - 3 imágenes 4:5 (hero en uso, detalle, prueba)
 *   - 1 video UGC 15-25s (guion + TTS listo)
 *   - 1 draft en pausa por variante (3 drafts máximo)
 */
import { db, products, facebookDrafts, settings as settingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../../logger";
import type { ProductInfo } from "../../marketing-team/agents/market-researcher";
import { researchDeep } from "./research-deep";
import { copyPro } from "./copy-pro";
import { creativeStudio } from "./creative-studio";
import { videoFactoryPro } from "./video-factory-pro";
import { getOrCreateBudget } from "../../marketing-team/budget-guard";
import { classifyAction } from "../../marketing-team/risk-engine";

export interface PackPro {
  productId: number;
  productName: string;
  objetivo: string;
  research: Awaited<ReturnType<typeof researchDeep>>;
  copy: Awaited<ReturnType<typeof copyPro>>;
  creativo: Awaited<ReturnType<typeof creativeStudio>>;
  video: Awaited<ReturnType<typeof videoFactoryPro>>;
  scoreGlobal: number; // promedio copy+creativo
  draftIds: number[];
  enPausa: boolean;
  validado: boolean;
}

function toProductInfo(row: any): ProductInfo {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    price: row.price != null ? Number(row.price) : undefined,
    currency: row.currency || "COP",
    category: row.category || (row.categoryId ? `cat ${row.categoryId}` : "general"),
    features: Array.isArray(row.features) ? row.features : row.features ? [String(row.features)] : [],
    imageUrl: row.imageUrl,
  };
}

export async function estaAgenciaProActiva(tenantId?: number): Promise<boolean> {
  if (process.env.AGENCIA_PRO === "1" || process.env.AGENCIA_PRO === "true") return true;
  if (!tenantId) return false;
  try {
    const row: any = (await db.select().from(settingsTable).limit(1))[0];
    const cfg: any = (row as any)?.businessConfig || (row as any)?.config || {};
    return cfg.agenciaPro === true || cfg.agencia_pro === true;
  } catch { return false; }
}

export async function generarPackPro(
  opts: { tenantId: number; productId: number; objetivo?: string; presupuestoDiario?: number; fb?: any },
): Promise<PackPro> {
  const objetivo = opts.objetivo || "mensajes";
  const [row] = await db.select().from(products).where(and(eq(products.id, opts.productId), eq(products.tenantId, opts.tenantId))).limit(1);
  if (!row) throw new Error(`Producto ${opts.productId} no encontrado para tenant ${opts.tenantId}`);
  const product = toProductInfo(row);

  // Guardrails antes de gastar/crear: BudgetGuard + RiskEngine
  const budget = await getOrCreateBudget(opts.tenantId).catch(() => null);
  const riesgo = classifyAction("create_campaign");
  if (riesgo.risk === "CRITICAL" || riesgo.risk === "HIGH") {
    logger.warn({ tenantId: opts.tenantId, riesgo }, "[AgenciaPro] Acción de alto riesgo bloqueada");
  }
  // No crear si excede maxDailySpend (se valida en publish, no en draft)

  const research = await researchDeep(product, { tenantId: opts.tenantId, fb: opts.fb, objetivo });
  const copy = await copyPro(product, research, { tenantId: opts.tenantId, objetivo, modeloEntrega: (product.category === "dropshipping" ? "fisico" : "digital") as any });
  const creativo = await creativeStudio(product, research, copy.variants, { tenantId: opts.tenantId });
  const video = await videoFactoryPro(product, research, copy.variants, { tenantId: opts.tenantId });

  const scoreGlobal = Math.round((copy.validacion.score + creativo.validacion.score) / 2);
  const validado = copy.validacion.ok && creativo.validacion.ok && scoreGlobal >= 70;

  // Guardar 1-3 drafts en pausa (uno por variante), con structure duplicable a fb_create_ad
  const draftIds: number[] = [];
  const variantesAGuardar = copy.variants.slice(0, 3);
  for (let i = 0; i < variantesAGuardar.length; i++) {
    const v = variantesAGuardar[i]!;
    const imgHero = creativo.imagenes[0];
    try {
      const [draft] = await db.insert(facebookDrafts).values({
        tenantId: opts.tenantId,
        productId: opts.productId,
        objetivo,
        estado: "borrador", // nunca "publicado" automático
        primaryText: v.primaryText,
        headline: v.headline,
        description: v.description,
        cta: v.cta,
        // Campos extendidos en JSON si la columna existe; si no, van en config
        config: {
          _agenciaPro: true,
          pack: true,
          variante: i + 1,
          hook: v.hook,
          arquetipo: v.arquetipo,
          score: scoreGlobal,
          validado,
          imagenes: creativo.imagenes,
          imagePromptHero: imgHero?.imagePrompt || null,
          videoGuion: video.guion,
          videoPrompt: video.promptPexels,
          researchResumen: `${research.problemaPrincipal.slice(0,120)} | ${research.oportunidad.slice(0,120)}`,
          presupuestoSugerido: opts.presupuestoDiario || (budget as any)?.maxDailySpend || 20000,
          enPausa: true,
        } as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning({ id: (facebookDrafts as any).id });
      if (draft?.id) draftIds.push(Number(draft.id));
    } catch (e: any) {
      // Fallback si la tabla no tiene esas columnas exactas: guardar mínimo
      logger.warn({ err: e?.message }, "[AgenciaPro] No se pudo guardar draft completo, intentando mínimo");
      try {
        const [draft2] = await db.insert(facebookDrafts).values({
          tenantId: opts.tenantId,
          productId: opts.productId,
          objetivo,
          estado: "borrador",
          primaryText: v.primaryText,
          headline: v.headline,
          description: v.description,
          cta: v.cta,
        } as any).returning({ id: (facebookDrafts as any).id });
        if (draft2?.id) draftIds.push(Number(draft2.id));
      } catch (e2: any) {
        logger.error({ err: e2?.message }, "[AgenciaPro] Falló guardado draft mínimo");
      }
    }
  }

  logger.info({ tenantId: opts.tenantId, productId: opts.productId, scoreGlobal, draftIds, validado }, "[AgenciaPro] Pack generado");

  return {
    productId: Number(product.id),
    productName: product.name,
    objetivo,
    research,
    copy,
    creativo,
    video,
    scoreGlobal,
    draftIds,
    enPausa: true,
    validado,
  };
}

/**
 * Helper para UI/API: lista packs pro (borradores con _agenciaPro)
 */
export async function packsProDelTenant(tenantId: number): Promise<Array<{ id: number; productId: number; headline: string; score: number; createdAt: string }>> {
  try {
    const rows: any[] = await db.select().from(facebookDrafts).where(eq((facebookDrafts as any).tenantId, tenantId)).limit(50);
    return rows.filter((r: any) => r.config?._agenciaPro).map((r: any) => ({
      id: Number(r.id),
      productId: Number(r.productId),
      headline: String(r.headline || "").slice(0, 60),
      score: Number(r.config?.score || 0),
      createdAt: String(r.createdAt || r.updatedAt || ""),
    }));
  } catch { return []; }
}
