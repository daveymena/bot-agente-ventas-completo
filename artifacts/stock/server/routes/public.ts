import { Router } from "express";
import { all, get } from "../db/client";
import { config } from "../config";
import { h } from "../lib/http";
import { aiEnabled } from "../lib/ai";
import { ASSET_FROM, ASSET_SELECT, toSummary, mediaUrl, type AssetRow } from "../lib/assets";
import { trendingSearches } from "../lib/search";
import { collectionDtos } from "./collections";
import type { BrandInfo, CategoryDto } from "../../shared/types";

export const publicRouter = Router();

const DEFAULT_TRENDING = ["negocios", "fondos", "naturaleza", "tecnología", "comida", "personas", "ciudad", "abstracto", "mascotas", "café", "viajes", "iconos"];

export async function listCategories(): Promise<CategoryDto[]> {
  const rows = await all<any>(`
    SELECT c.*, (SELECT count(*) FROM assets a WHERE a.category_id = c.id AND a.status='approved') AS n,
      (SELECT a.card_path FROM assets a WHERE a.id = c.cover_asset_id) AS cover_from_id,
      (SELECT a.card_path FROM assets a WHERE a.category_id = c.id AND a.status='approved' AND a.card_path IS NOT NULL ORDER BY a.featured DESC, a.downloads DESC, a.id LIMIT 1) AS cover_auto
    FROM categories c ORDER BY c.sort_order, c.name`);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, coverUrl: mediaUrl(r.cover_from_id || r.cover_auto), count: Number(r.n) }));
}

publicRouter.get("/meta", h(async (_req, res) => {
  const stats = await get<any>(`SELECT (SELECT count(*) FROM assets WHERE status='approved') AS assets, (SELECT count(*) FROM users WHERE role IN ('contributor','admin')) AS contributors, (SELECT coalesce(sum(downloads),0) FROM assets) AS downloads`);
  const info: BrandInfo = {
    name: config.brand.name, tagline: config.brand.tagline, currency: config.currency, locale: config.locale, creditValueCents: config.creditValueCents,
    aiEnabled: aiEnabled(),
    paymentsEnabled: { mercadopago: !!config.payments.mercadoPagoAccessToken, transfer: !!config.payments.transfer.account },
    royalty: config.royalty, payoutMinimumCents: config.payoutMinimumCents,
    stats: { assets: Number(stats?.assets || 0), contributors: Number(stats?.contributors || 0), downloads: Number(stats?.downloads || 0) },
  };
  res.json(info);
}));

publicRouter.get("/categories", h(async (_req, res) => { res.json(await listCategories()); }));

publicRouter.get("/trending", h(async (_req, res) => {
  const t = await trendingSearches(12);
  const merged = [...new Set([...t, ...DEFAULT_TRENDING])].slice(0, 12);
  res.json(merged);
}));

/** Todo lo que necesita la portada en una sola llamada. */
publicRouter.get("/home", h(async (_req, res) => {
  const byType = async (where: string, limit: number) => (await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.status='approved' AND ${where} ORDER BY a.featured DESC, a.downloads DESC, a.created_at DESC LIMIT ?`, [limit])).map(toSummary);
  const [featured, videos, vectors, templates, audio, free, recent, categories, trending] = await Promise.all([
    byType("a.featured = 1", 18),
    byType("a.type = 'video'", 10),
    byType("a.type IN ('vector','illustration')", 12),
    byType("a.type = 'template'", 8),
    byType("a.type = 'audio'", 6),
    byType("a.is_free = 1", 12),
    (await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.status='approved' ORDER BY a.created_at DESC LIMIT 12`)).map(toSummary),
    listCategories(),
    trendingSearches(8),
  ]);
  const curated = await collectionDtos(`c.is_curated = 1 AND c.is_public = 1`, [], 8);
  const hero = featured.find((a) => a.type === "photo" && a.orientation !== "vertical") || featured[0] || recent[0] || null;
  res.json({
    hero, featured, videos, vectors, templates, audio, free, recent, categories, curated,
    trending: [...new Set([...trending, ...DEFAULT_TRENDING])].slice(0, 10),
  });
}));
