import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { all, get, run } from "../db/client";
import { h, notFound, parse, badRequest } from "../lib/http";
import { ASSET_FROM, ASSET_SELECT, bumpViews, getAssetRow, toDetail, toSummary, type AssetRow } from "../lib/assets";
import { searchAssets, similarAssets, visualSearch } from "../lib/search";
import { analyzeImage, originalAbs, publicAbs } from "../lib/media";
import { aiEnabled, describeForSearch } from "../lib/ai";
import { ASSET_TYPES, ORIENTATIONS, type SearchFilters } from "../../shared/types";

export const assetsRouter = Router();

const csv = <T extends string>(allowed: readonly T[]) => z.preprocess((v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v), z.array(z.enum(allowed as unknown as [T, ...T[]])).optional());

const searchSchema = z.object({
  q: z.string().max(120).optional(),
  tab: z.enum(["all", "images", "video", "audio", "template", "3d", "free", "premium"]).optional(),
  types: csv(ASSET_TYPES),
  category: z.string().max(60).optional(),
  orientation: csv(ORIENTATIONS),
  color: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
  price: z.enum(["free", "premium", "all"]).optional(),
  ai: z.enum(["include", "exclude", "only"]).optional(),
  editorial: z.enum(["include", "exclude", "only"]).optional(),
  people: z.enum(["any", "with", "without"]).optional(),
  peopleCount: z.enum(["1", "2", "3+"]).optional(),
  minWidth: z.coerce.number().int().min(0).max(20000).optional(),
  minDuration: z.coerce.number().min(0).optional(),
  maxDuration: z.coerce.number().min(0).optional(),
  resolution: z.enum(["HD", "4K"]).optional(),
  contributor: z.coerce.number().int().optional(),
  series: z.string().max(80).optional(),
  collection: z.string().max(80).optional(),
  safe: z.preprocess((v) => (v === "false" || v === "0" ? false : v === undefined ? undefined : true), z.boolean().optional()),
  period: z.enum(["24h", "7d", "30d", "1y"]).optional(),
  sort: z.enum(["relevance", "recent", "downloads", "undiscovered"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

assetsRouter.get("/search", h(async (req, res) => {
  const f = parse(searchSchema, req.query) as SearchFilters;
  res.json(await searchAssets(f));
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/** Búsqueda visual: subís una imagen y buscamos parecidas por hash perceptual, color y (si hay IA) contenido. */
assetsRouter.post("/search/visual", upload.single("image"), h(async (req, res) => {
  if (!req.file) throw badRequest("Adjuntá una imagen (campo `image`).");
  const a = await analyzeImage(req.file.buffer);
  let keywords: string[] | undefined;
  if (aiEnabled()) {
    const dataUrl = `data:${req.file.mimetype || "image/jpeg"};base64,${req.file.buffer.toString("base64")}`;
    keywords = (await describeForSearch(dataUrl)) || undefined;
  }
  const items = await visualSearch({ dhash: a.dhash, hue: a.hue, saturation: a.saturation, keywords }, 48);
  res.json({ items, keywords: keywords || [], colors: a.colors, aiUsed: !!keywords });
}));

assetsRouter.get("/assets/:id", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row) throw notFound("Recurso no encontrado");
  const isOwner = req.user && (req.user.id === row.contributor_id || req.user.role === "admin");
  if (row.status !== "approved" && !isOwner) throw notFound("Recurso no encontrado");
  if (row.status === "approved") bumpViews(row.id, req.user?.id).catch(() => {});
  res.json(await toDetail(row, req.user?.id));
}));

assetsRouter.get("/assets/:id/similar", h(async (req, res) => {
  res.json(await similarAssets(Number(req.params.id), Math.min(48, Number(req.query.limit) || 24)));
}));

assetsRouter.get("/assets/:id/series", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row?.series_id) return res.json([]);
  const rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.series_id=? AND a.status='approved' AND a.id != ? ORDER BY a.created_at LIMIT 24`, [row.series_id, row.id]);
  res.json(rows.map(toSummary));
}));

assetsRouter.get("/assets/:id/contributor-more", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row?.contributor_id) return res.json([]);
  const rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.contributor_id=? AND a.status='approved' AND a.id != ? ORDER BY a.downloads DESC, a.created_at DESC LIMIT 12`, [row.contributor_id, row.id]);
  res.json(rows.map(toSummary));
}));

/** Descarga de la previsualización con marca de agua (el "comp" de Adobe). Cuenta como evento. */
assetsRouter.get("/assets/:id/comp", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row || row.status !== "approved") throw notFound("Recurso no encontrado");
  const rel = row.type === "video" ? (row.preview_path?.endsWith(".mp4") ? row.preview_path : row.poster_path) : row.preview_path;
  if (!rel) throw notFound("Este recurso no tiene previsualización descargable.");
  await run(`INSERT INTO asset_events(asset_id, user_id, kind, day) VALUES (?,?,?,?)`, [row.id, req.user?.id ?? null, "comp", new Date().toISOString().slice(0, 10)]);
  const abs = publicAbs(rel);
  res.download(abs, `preview-${row.id}${path.extname(abs)}`);
}));

/** Streaming (vídeo sin comp / audio) con soporte de rangos. Solo previsualización; la descarga real va por licencia. */
assetsRouter.get("/assets/:id/stream", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row || row.status !== "approved" || !row.original_path) throw notFound("Recurso no encontrado");
  if (row.type !== "video" && row.type !== "audio") throw notFound("Sin streaming para este tipo");
  const abs = originalAbs(row.original_path);
  if (!fs.existsSync(abs)) throw notFound("Archivo no disponible");
  const stat = fs.statSync(abs);
  const mime = row.type === "video" ? (row.file_format === "webm" ? "video/webm" : "video/mp4") : row.file_format === "wav" ? "audio/wav" : row.file_format === "ogg" ? "audio/ogg" : "audio/mpeg";
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mime);
  res.setHeader("Cache-Control", "private, max-age=3600");
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? Number(m[1]) : 0;
    let end = m && m[2] ? Number(m[2]) : stat.size - 1;
    if (start >= stat.size) { res.status(416).setHeader("Content-Range", `bytes */${stat.size}`); return res.end(); }
    end = Math.min(end, stat.size - 1);
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(abs, { start, end }).pipe(res);
  } else {
    res.setHeader("Content-Length", stat.size);
    fs.createReadStream(abs).pipe(res);
  }
}));

/** Perfil público de un colaborador. */
assetsRouter.get("/contributors/:id", h(async (req, res) => {
  const u = await get<any>(`SELECT id, name, contributor_profile, created_at FROM users WHERE id=? AND role IN ('contributor','admin')`, [Number(req.params.id)]);
  if (!u) throw notFound("Colaborador no encontrado");
  const profile = u.contributor_profile ? JSON.parse(u.contributor_profile) : {};
  const stats = await get<any>(`SELECT count(*) AS assets, coalesce(sum(downloads),0) AS downloads, coalesce(sum(views),0) AS views FROM assets WHERE contributor_id=? AND status='approved'`, [u.id]);
  res.json({ id: u.id, name: profile.displayName || u.name, bio: profile.bio || null, website: profile.website || null, since: u.created_at, stats: { assets: Number(stats.assets), downloads: Number(stats.downloads), views: Number(stats.views) } });
}));
