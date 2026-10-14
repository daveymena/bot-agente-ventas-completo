import { Router } from "express";
import { z } from "zod";
import { all, get, insert, run, nowIso } from "../db/client";
import { h, notFound, parse, forbidden, pageParams, conflict } from "../lib/http";
import { requireUser } from "../lib/auth";
import { ASSET_FROM, ASSET_SELECT, toSummary, mediaUrl, type AssetRow } from "../lib/assets";
import type { CollectionDto } from "../../shared/types";

export const collectionsRouter = Router();

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "coleccion";

export async function collectionDtos(where: string, args: any[], limit = 100, offset = 0): Promise<CollectionDto[]> {
  const rows = await all<any>(`
    SELECT c.*, (SELECT count(*) FROM collection_items ci JOIN assets a ON a.id = ci.asset_id WHERE ci.collection_id = c.id AND a.status='approved') AS n,
      (SELECT a.card_path FROM assets a WHERE a.id = c.cover_asset_id) AS cover_path
    FROM collections c WHERE ${where} ORDER BY c.sort_order, c.updated_at DESC LIMIT ? OFFSET ?`, [...args, limit, offset]);
  const out: CollectionDto[] = [];
  for (const r of rows) {
    const previews = await all<{ card_path: string | null; thumb_path: string | null }>(
      `SELECT a.card_path, a.thumb_path FROM collection_items ci JOIN assets a ON a.id = ci.asset_id WHERE ci.collection_id=? AND a.status='approved' AND a.thumb_path IS NOT NULL ORDER BY ci.added_at DESC LIMIT 4`, [r.id]);
    out.push({
      id: r.id, slug: r.slug, title: r.title, description: r.description, isPublic: !!r.is_public, isCurated: !!r.is_curated, ownerId: r.user_id,
      coverUrl: mediaUrl(r.cover_path) || mediaUrl(previews[0]?.card_path || null), previews: previews.map((p) => mediaUrl(p.thumb_path)!).filter(Boolean),
      count: Number(r.n), createdAt: r.created_at, updatedAt: r.updated_at,
    });
  }
  return out;
}

/** Colecciones públicas curadas. */
collectionsRouter.get("/", h(async (req, res) => {
  const { perPage, offset } = pageParams(req.query as any, { perPage: 24, max: 60 });
  res.json(await collectionDtos(`c.is_public = 1 AND c.is_curated = 1`, [], perPage, offset));
}));

/** Mis bibliotecas. */
collectionsRouter.get("/mine", requireUser, h(async (req, res) => {
  res.json(await collectionDtos(`c.user_id = ?`, [req.user!.id], 200));
}));

const createSchema = z.object({ title: z.string().min(2).max(80), description: z.string().max(400).optional(), isPublic: z.boolean().optional(), assetId: z.number().int().optional() });

collectionsRouter.post("/", requireUser, h(async (req, res) => {
  const body = parse(createSchema, req.body);
  let slug = slugify(body.title) + "-" + Math.random().toString(36).slice(2, 7);
  const id = await insert(`INSERT INTO collections(slug, user_id, title, description, is_public, is_curated) VALUES (?,?,?,?,?,0)`,
    [slug, req.user!.id, body.title.trim(), body.description?.trim() || null, body.isPublic ? 1 : 0]);
  if (body.assetId) await run(`INSERT OR IGNORE INTO collection_items(collection_id, asset_id) VALUES (?,?)`, [id, body.assetId]);
  res.status(201).json((await collectionDtos(`c.id = ?`, [id]))[0]);
}));

async function ownedCollection(id: number, userId: number, isAdmin: boolean) {
  const c = await get<any>(`SELECT * FROM collections WHERE id=?`, [id]);
  if (!c) throw notFound("Colección no encontrada");
  if (c.user_id !== userId && !isAdmin) throw forbidden();
  return c;
}

collectionsRouter.patch("/:id", requireUser, h(async (req, res) => {
  const c = await ownedCollection(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  const body = parse(createSchema.partial().extend({ coverAssetId: z.number().int().nullable().optional() }), req.body);
  await run(`UPDATE collections SET title=coalesce(?, title), description=coalesce(?, description), is_public=coalesce(?, is_public), cover_asset_id=coalesce(?, cover_asset_id), updated_at=? WHERE id=?`,
    [body.title?.trim() ?? null, body.description?.trim() ?? null, body.isPublic == null ? null : body.isPublic ? 1 : 0, body.coverAssetId ?? null, nowIso(), c.id]);
  res.json((await collectionDtos(`c.id = ?`, [c.id]))[0]);
}));

collectionsRouter.delete("/:id", requireUser, h(async (req, res) => {
  const c = await ownedCollection(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  await run(`DELETE FROM collections WHERE id=?`, [c.id]);
  res.json({ ok: true });
}));

collectionsRouter.post("/:id/items", requireUser, h(async (req, res) => {
  const c = await ownedCollection(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  const { assetId } = parse(z.object({ assetId: z.number().int() }), req.body);
  const a = await get(`SELECT id FROM assets WHERE id=? AND status='approved'`, [assetId]);
  if (!a) throw notFound("Recurso no disponible");
  const r = await run(`INSERT OR IGNORE INTO collection_items(collection_id, asset_id) VALUES (?,?)`, [c.id, assetId]);
  if (!r.rowsAffected) throw conflict("Ya estaba guardado en esta colección.");
  await run(`UPDATE collections SET updated_at=? WHERE id=?`, [nowIso(), c.id]);
  res.status(201).json({ ok: true });
}));

collectionsRouter.delete("/:id/items/:assetId", requireUser, h(async (req, res) => {
  const c = await ownedCollection(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  await run(`DELETE FROM collection_items WHERE collection_id=? AND asset_id=?`, [c.id, Number(req.params.assetId)]);
  res.json({ ok: true });
}));

/** Detalle por slug (pública, o propia). */
collectionsRouter.get("/:slug", h(async (req, res) => {
  const c = await get<any>(`SELECT * FROM collections WHERE slug=?`, [String(req.params.slug)]);
  if (!c) throw notFound("Colección no encontrada");
  if (!c.is_public && c.user_id !== req.user?.id && req.user?.role !== "admin") throw notFound("Colección no encontrada");
  const { page, perPage, offset } = pageParams(req.query as any, { perPage: 40, max: 100 });
  const items = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} JOIN collection_items ci ON ci.asset_id = a.id WHERE ci.collection_id=? AND a.status='approved' ORDER BY ci.added_at DESC LIMIT ? OFFSET ?`, [c.id, perPage, offset]);
  const dto = (await collectionDtos(`c.id = ?`, [c.id]))[0];
  res.json({ collection: dto, items: items.map(toSummary), page, perPage, total: dto?.count ?? 0 });
}));
