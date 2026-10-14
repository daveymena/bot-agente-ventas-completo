import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { all, get, run, nowIso, parseJson } from "../db/client";
import { config } from "../config";
import { h, parse, badRequest, notFound, forbidden, pageParams } from "../lib/http";
import { requireUser, requireRole, findUserById, toUserDto } from "../lib/auth";
import { ASSET_FROM, ASSET_SELECT, getAssetRow, keywordsText, normalizeKeywords, toDetail, toSummary, type AssetRow } from "../lib/assets";
import { ingestAsset, deleteAssetFiles } from "../lib/ingest";
import { aiEnabled, autoTagImage, autoTagFromText } from "../lib/ai";
import { requestPayout } from "../lib/commerce";
import { loadImage } from "../lib/media";
import type { ContributorStats } from "../../shared/types";

export const contributorRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.max(config.upload.maxVideoBytes, config.upload.maxImageBytes), files: 3 } });

/** Convertirse en colaborador: acepta el contrato y define nombre público. */
contributorRouter.post("/join", requireUser, h(async (req, res) => {
  const body = parse(z.object({ displayName: z.string().min(2).max(60), bio: z.string().max(400).optional(), website: z.string().max(200).optional(), acceptTerms: z.literal(true) }), req.body);
  const prev = parseJson<any>(req.user!.contributor_profile, {});
  const profile = { ...prev, displayName: body.displayName.trim(), bio: body.bio?.trim() || null, website: body.website?.trim() || null, acceptedTermsAt: prev.acceptedTermsAt || nowIso() };
  await run(`UPDATE users SET role = CASE WHEN role='admin' THEN 'admin' ELSE 'contributor' END, contributor_profile=? WHERE id=?`, [JSON.stringify(profile), req.user!.id]);
  res.json(toUserDto((await findUserById(req.user!.id))!));
}));

contributorRouter.patch("/profile", requireRole("contributor"), h(async (req, res) => {
  const body = parse(z.object({ displayName: z.string().min(2).max(60).optional(), bio: z.string().max(400).nullable().optional(), website: z.string().max(200).nullable().optional(), payoutMethod: z.enum(["paypal", "payoneer", "nequi", "bancolombia", "transferencia"]).nullable().optional(), payoutAccount: z.string().max(120).nullable().optional() }), req.body);
  const prev = parseJson<any>(req.user!.contributor_profile, {});
  const profile = { ...prev, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
  await run(`UPDATE users SET contributor_profile=? WHERE id=?`, [JSON.stringify(profile), req.user!.id]);
  res.json(toUserDto((await findUserById(req.user!.id))!));
}));

const boolish = z.preprocess((v) => v === "true" || v === true || v === "1", z.boolean());
const uploadSchema = z.object({
  title: z.string().min(4).max(140),
  description: z.string().max(2000).optional().default(""),
  keywords: z.preprocess((v) => (typeof v === "string" ? (v.trim().startsWith("[") ? JSON.parse(v) : v.split(",")) : v), z.array(z.string()).default([])),
  type: z.enum(["photo", "illustration", "vector", "video", "audio", "template", "3d"]).optional(),
  categorySlug: z.string().max(60).optional(),
  isEditorial: boolish.default(false), isAiGenerated: boolish.default(false), hasPeople: boolish.default(false), peopleCount: z.coerce.number().int().min(0).max(50).default(0),
  modelRelease: boolish.default(false), propertyRelease: boolish.default(false), isFree: boolish.default(false), mature: boolish.default(false),
  seriesId: z.string().max(80).optional(),
  submit: boolish.default(true),
  clientMeta: z.preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), z.object({ durationSec: z.number().optional(), width: z.number().optional(), height: z.number().optional(), fps: z.number().optional(), waveform: z.array(z.number()).optional() }).optional()),
});

/** Carga: `file` (obligatorio), `poster` (vídeo, opcional), `cover` (plantilla/3D/audio, opcional) + campos. */
contributorRouter.post("/upload", requireRole("contributor"), upload.fields([{ name: "file", maxCount: 1 }, { name: "poster", maxCount: 1 }, { name: "cover", maxCount: 1 }]), h(async (req, res) => {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.file?.[0];
  if (!file) throw badRequest("Falta el archivo (campo `file`).");
  const body = parse(uploadSchema, req.body);
  if (body.hasPeople && !body.modelRelease && !body.isEditorial) {
    // Igual que Adobe: con personas reconocibles hace falta autorización de modelo o marcar como editorial.
    throw badRequest("Si aparecen personas reconocibles necesitás autorización de modelo (model release) o marcarlo como editorial.");
  }
  const id = await ingestAsset({
    buffer: file.buffer, filename: file.originalname, mimetype: file.mimetype, type: body.type, title: body.title, description: body.description,
    keywords: body.keywords, categorySlug: body.categorySlug || null, contributorId: req.user!.id, status: body.submit ? "pending" : "draft",
    isEditorial: body.isEditorial, isAiGenerated: body.isAiGenerated, hasPeople: body.hasPeople, peopleCount: body.peopleCount, modelRelease: body.modelRelease,
    propertyRelease: body.propertyRelease, isFree: body.isFree, mature: body.mature, seriesId: body.seriesId || null,
    poster: files?.poster?.[0]?.buffer || null, cover: files?.cover?.[0]?.buffer || null, clientMeta: body.clientMeta || null,
  });
  res.status(201).json(await toDetail((await getAssetRow(id))!, req.user!.id));
}));

/** Etiquetado automático con IA: imagen adjunta (`image`) o nombre+descripción (`text`). */
contributorRouter.post("/autotag", requireRole("contributor"), upload.single("image"), h(async (req, res) => {
  if (!aiEnabled()) return res.json({ enabled: false, tags: null, message: "La IA no está configurada en este servidor (STOCK_AI_API_KEY)." });
  const hint = typeof req.body?.hint === "string" ? req.body.hint.slice(0, 300) : undefined;
  let tags = null;
  if (req.file) {
    const small = await loadImage(req.file.buffer).resize(768, 768, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    tags = await autoTagImage(`data:image/jpeg;base64,${small.toString("base64")}`, hint);
  } else if (typeof req.body?.text === "string" && req.body.text.trim()) {
    tags = await autoTagFromText(req.body.text.slice(0, 500));
  } else throw badRequest("Adjuntá una imagen o un texto.");
  res.json({ enabled: true, tags });
}));

contributorRouter.get("/assets", requireRole("contributor"), h(async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : null;
  const { page, perPage, offset } = pageParams(req.query as any, { perPage: 40, max: 100 });
  const where = `a.contributor_id = ? ${status ? "AND a.status = ?" : ""}`;
  const args = status ? [req.user!.id, status] : [req.user!.id];
  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM assets a WHERE ${where}`, args))?.n || 0);
  const rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE ${where} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`, [...args, perPage, offset]);
  const items = [];
  for (const r of rows) items.push(await toDetail(r, req.user!.id));
  res.json({ items, total, page, perPage });
}));

async function ownAsset(id: number, userId: number, isAdmin: boolean) {
  const row = await getAssetRow(id);
  if (!row) throw notFound("Recurso no encontrado");
  if (row.contributor_id !== userId && !isAdmin) throw forbidden();
  return row;
}

const patchSchema = z.object({
  title: z.string().min(4).max(140).optional(), description: z.string().max(2000).optional(), keywords: z.array(z.string()).optional(), categorySlug: z.string().max(60).nullable().optional(),
  type: z.enum(["photo", "illustration", "vector", "video", "audio", "template", "3d"]).optional(),
  isEditorial: z.boolean().optional(), isAiGenerated: z.boolean().optional(), hasPeople: z.boolean().optional(), peopleCount: z.number().int().min(0).max(50).optional(),
  modelRelease: z.boolean().optional(), propertyRelease: z.boolean().optional(), isFree: z.boolean().optional(), mature: z.boolean().optional(), seriesId: z.string().max(80).nullable().optional(),
  submit: z.boolean().optional(),
});

contributorRouter.patch("/assets/:id", requireRole("contributor"), h(async (req, res) => {
  const row = await ownAsset(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  const body = parse(patchSchema, req.body);
  const sets: string[] = []; const args: any[] = [];
  const set = (col: string, v: any) => { sets.push(`${col}=?`); args.push(v); };
  if (body.title != null) set("title", body.title.trim());
  if (body.description != null) set("description", body.description.trim());
  if (body.keywords) { const k = normalizeKeywords(body.keywords); set("keywords", JSON.stringify(k)); set("keywords_text", keywordsText(k)); }
  if (body.categorySlug !== undefined) { const c = body.categorySlug ? await get<{ id: number }>(`SELECT id FROM categories WHERE slug=?`, [body.categorySlug]) : null; set("category_id", c?.id ?? null); }
  if (body.type) set("type", body.type);
  for (const [k, col] of [["isEditorial", "is_editorial"], ["isAiGenerated", "is_ai_generated"], ["hasPeople", "has_people"], ["modelRelease", "model_release"], ["propertyRelease", "property_release"], ["isFree", "is_free"], ["mature", "mature"]] as const) {
    if ((body as any)[k] != null) set(col, (body as any)[k] ? 1 : 0);
  }
  if (body.peopleCount != null) set("people_count", body.peopleCount);
  if (body.seriesId !== undefined) set("series_id", body.seriesId || null);
  if (body.submit) {
    if (row.status === "approved") throw badRequest("Este recurso ya está aprobado.");
    const kws = body.keywords ? normalizeKeywords(body.keywords) : parseJson<string[]>(row.keywords, []);
    if (kws.length < 5) throw badRequest("Agregá al menos 5 palabras clave antes de enviar a revisión.");
    set("status", "pending"); set("rejection_reason", null);
  } else if (row.status === "approved" && sets.length) {
    // Editar metadatos de un recurso aprobado lo manda de nuevo a revisión (como Adobe).
    set("status", "pending");
  }
  set("updated_at", nowIso());
  await run(`UPDATE assets SET ${sets.join(", ")} WHERE id=?`, [...args, row.id]);
  res.json(await toDetail((await getAssetRow(row.id))!, req.user!.id));
}));

contributorRouter.delete("/assets/:id", requireRole("contributor"), h(async (req, res) => {
  const row = await ownAsset(Number(req.params.id), req.user!.id, req.user!.role === "admin");
  const licensed = await get(`SELECT 1 FROM licenses WHERE asset_id=? LIMIT 1`, [row.id]);
  if (licensed) {
    // Con licencias vendidas no se borra: se retira del catálogo (los compradores conservan su descarga).
    await run(`UPDATE assets SET status='disabled', updated_at=? WHERE id=?`, [nowIso(), row.id]);
    return res.json({ ok: true, disabled: true });
  }
  await run(`DELETE FROM assets WHERE id=?`, [row.id]);
  await deleteAssetFiles(row);
  res.json({ ok: true, deleted: true });
}));

contributorRouter.get("/stats", requireRole("contributor"), h(async (req, res) => {
  const uid = req.user!.id;
  const t = await get<any>(`SELECT count(*) AS assets, sum(status='approved') AS approved, sum(status='pending') AS pending, sum(status='rejected') AS rejected, coalesce(sum(views),0) AS views, coalesce(sum(downloads),0) AS downloads, coalesce(sum(licenses_count),0) AS licenses FROM assets WHERE contributor_id=?`, [uid]);
  const e = await get<any>(`SELECT coalesce(sum(amount_cents),0) AS total, coalesce(sum(CASE WHEN status='paid' THEN amount_cents ELSE 0 END),0) AS paid FROM earnings WHERE contributor_id=?`, [uid]);
  const since = new Date(Date.now() - 29 * 86400e3).toISOString().slice(0, 10);
  const views = await all<any>(`SELECT ev.day, sum(ev.kind='view') AS views, sum(ev.kind='license') AS licenses FROM asset_events ev JOIN assets a ON a.id = ev.asset_id WHERE a.contributor_id=? AND ev.day >= ? GROUP BY ev.day`, [uid, since]);
  const earn = await all<any>(`SELECT substr(created_at,1,10) AS day, sum(amount_cents) AS cents FROM earnings WHERE contributor_id=? AND created_at >= ? GROUP BY day`, [uid, since]);
  const byDay: ContributorStats["byDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10);
    const v = views.find((x) => x.day === day); const en = earn.find((x) => x.day === day);
    byDay.push({ day, views: Number(v?.views || 0), licenses: Number(v?.licenses || 0), earningsCents: Number(en?.cents || 0) });
  }
  const top = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE a.contributor_id=? AND a.status='approved' ORDER BY a.licenses_count DESC, a.views DESC LIMIT 6`, [uid]);
  const stats: ContributorStats = {
    totals: { assets: Number(t.assets), approved: Number(t.approved || 0), pending: Number(t.pending || 0), rejected: Number(t.rejected || 0), views: Number(t.views), downloads: Number(t.downloads), licenses: Number(t.licenses), earningsCents: Number(e.total), paidCents: Number(e.paid), availableCents: req.user!.earnings_cents },
    byDay, topAssets: top.map((r) => ({ ...toSummary(r), views: r.views, licenses: r.licenses_count })),
  };
  res.json(stats);
}));

contributorRouter.get("/earnings", requireRole("contributor"), h(async (req, res) => {
  const rows = await all<any>(`SELECT e.*, a.title, l.type AS license_type, l.certificate_no FROM earnings e JOIN assets a ON a.id = e.asset_id JOIN licenses l ON l.id = e.license_id WHERE e.contributor_id=? ORDER BY e.created_at DESC LIMIT 300`, [req.user!.id]);
  res.json(rows.map((r) => ({ id: r.id, assetId: r.asset_id, title: r.title, licenseType: r.license_type, amountCents: r.amount_cents, rate: r.rate, status: r.status, createdAt: r.created_at })));
}));

contributorRouter.get("/payouts", requireRole("contributor"), h(async (req, res) => {
  const rows = await all<any>(`SELECT * FROM payouts WHERE contributor_id=? ORDER BY requested_at DESC`, [req.user!.id]);
  res.json(rows.map((r) => ({ id: r.id, amountCents: r.amount_cents, method: r.method, account: r.account, status: r.status, note: r.note, requestedAt: r.requested_at, resolvedAt: r.resolved_at })));
}));

contributorRouter.post("/payouts", requireRole("contributor"), h(async (req, res) => {
  const body = parse(z.object({ method: z.string().min(2).max(40), account: z.string().min(3).max(120) }), req.body);
  const id = await requestPayout(req.user!, body.method, body.account);
  res.status(201).json({ id, user: toUserDto((await findUserById(req.user!.id))!) });
}));
