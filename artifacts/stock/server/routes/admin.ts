import { Router } from "express";
import { z } from "zod";
import { all, get, run, insert, nowIso, parseJson } from "../db/client";
import { h, parse, notFound, pageParams, badRequest } from "../lib/http";
import { requireRole, toUserDto, findUserById } from "../lib/auth";
import { ASSET_FROM, ASSET_SELECT, getAssetRow, toDetail, type AssetRow } from "../lib/assets";
import { deleteAssetFiles } from "../lib/ingest";
import { grantCredits, markOrderPaid, resolvePayout, getOrder } from "../lib/commerce";
import { collectionDtos } from "./collections";
import type { AdminStats } from "../../shared/types";

export const adminRouter = Router();
adminRouter.use(requireRole("admin"));

adminRouter.get("/stats", h(async (_req, res) => {
  const t = await get<any>(`SELECT
    (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM users WHERE role IN ('contributor','admin')) AS contributors,
    (SELECT count(*) FROM assets WHERE status='approved') AS assets, (SELECT count(*) FROM assets WHERE status='pending') AS pending_assets,
    (SELECT count(*) FROM licenses) AS licenses, (SELECT coalesce(sum(amount_cents),0) FROM orders WHERE status='paid') AS revenue,
    (SELECT count(*) FROM orders WHERE status='pending') AS pending_orders, (SELECT count(*) FROM payouts WHERE status='requested') AS pending_payouts`);
  const since = new Date(Date.now() - 29 * 86400e3).toISOString().slice(0, 10);
  const lic = await all<any>(`SELECT substr(created_at,1,10) AS day, count(*) AS n FROM licenses WHERE created_at >= ? GROUP BY day`, [since]);
  const rev = await all<any>(`SELECT substr(paid_at,1,10) AS day, sum(amount_cents) AS cents FROM orders WHERE status='paid' AND paid_at >= ? GROUP BY day`, [since]);
  const su = await all<any>(`SELECT substr(created_at,1,10) AS day, count(*) AS n FROM users WHERE created_at >= ? GROUP BY day`, [since]);
  const byDay: AdminStats["byDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10);
    byDay.push({ day, licenses: Number(lic.find((x) => x.day === day)?.n || 0), revenueCents: Number(rev.find((x) => x.day === day)?.cents || 0), signups: Number(su.find((x) => x.day === day)?.n || 0) });
  }
  const stats: AdminStats = { users: Number(t.users), contributors: Number(t.contributors), assets: Number(t.assets), pendingAssets: Number(t.pending_assets), licenses: Number(t.licenses), revenueCents: Number(t.revenue), pendingOrders: Number(t.pending_orders), pendingPayouts: Number(t.pending_payouts), byDay };
  res.json(stats);
}));

// ── Moderación ──────────────────────────────────────────────────────────────

adminRouter.get("/assets", h(async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : "pending";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const { page, perPage, offset } = pageParams(req.query as any, { perPage: 30, max: 100 });
  const where = [`a.status = ?`]; const args: any[] = [status];
  if (q) { where.push(`(a.title LIKE ? OR a.id = ?)`); args.push(`%${q}%`, Number(q) || -1); }
  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM ${ASSET_FROM} WHERE ${where.join(" AND ")}`, args))?.n || 0);
  const rows = await all<AssetRow>(`SELECT ${ASSET_SELECT} FROM ${ASSET_FROM} WHERE ${where.join(" AND ")} ORDER BY a.created_at ASC LIMIT ? OFFSET ?`, [...args, perPage, offset]);
  const items = [];
  for (const r of rows) items.push(await toDetail(r));
  res.json({ items, total, page, perPage });
}));

adminRouter.post("/assets/:id/approve", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row) throw notFound("Recurso no encontrado");
  const body = parse(z.object({ featured: z.boolean().optional(), isPremium: z.boolean().optional(), isFree: z.boolean().optional() }), req.body || {});
  await run(`UPDATE assets SET status='approved', approved_at=coalesce(approved_at, ?), rejection_reason=NULL, featured=coalesce(?, featured), is_premium=coalesce(?, is_premium), is_free=coalesce(?, is_free), updated_at=? WHERE id=?`,
    [nowIso(), body.featured == null ? null : body.featured ? 1 : 0, body.isPremium == null ? null : body.isPremium ? 1 : 0, body.isFree == null ? null : body.isFree ? 1 : 0, nowIso(), row.id]);
  res.json(await toDetail((await getAssetRow(row.id))!));
}));

export const REJECTION_REASONS = [
  { id: "calidad", label: "Problemas de calidad técnica (enfoque, ruido, compresión)" },
  { id: "composicion", label: "Composición o iluminación deficiente" },
  { id: "derechos", label: "Propiedad intelectual: marcas, logos u obras de terceros" },
  { id: "modelo", label: "Falta autorización de modelo o propiedad" },
  { id: "metadatos", label: "Título o palabras clave inexactos / spam" },
  { id: "duplicado", label: "Contenido duplicado o demasiado similar a otro enviado" },
  { id: "valor", label: "Bajo valor comercial para el catálogo" },
  { id: "ia", label: "Contenido generado con IA sin declarar o con artefactos" },
  { id: "normas", label: "Incumple las normas de contenido" },
];

adminRouter.get("/rejection-reasons", (_req, res) => res.json(REJECTION_REASONS));

adminRouter.post("/assets/:id/reject", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row) throw notFound("Recurso no encontrado");
  const body = parse(z.object({ reason: z.string().min(2).max(500) }), req.body);
  const label = REJECTION_REASONS.find((r) => r.id === body.reason)?.label || body.reason;
  await run(`UPDATE assets SET status='rejected', rejection_reason=?, updated_at=? WHERE id=?`, [label, nowIso(), row.id]);
  res.json(await toDetail((await getAssetRow(row.id))!));
}));

adminRouter.patch("/assets/:id", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row) throw notFound("Recurso no encontrado");
  const body = parse(z.object({ featured: z.boolean().optional(), isPremium: z.boolean().optional(), isFree: z.boolean().optional(), status: z.enum(["approved", "pending", "rejected", "disabled"]).optional(), categorySlug: z.string().nullable().optional(), priceCreditsStandard: z.number().int().min(0).nullable().optional(), priceCreditsExtended: z.number().int().min(0).nullable().optional(), mature: z.boolean().optional() }), req.body);
  const sets: string[] = []; const args: any[] = [];
  const set = (c: string, v: any) => { sets.push(`${c}=?`); args.push(v); };
  if (body.featured != null) set("featured", body.featured ? 1 : 0);
  if (body.isPremium != null) set("is_premium", body.isPremium ? 1 : 0);
  if (body.isFree != null) set("is_free", body.isFree ? 1 : 0);
  if (body.mature != null) set("mature", body.mature ? 1 : 0);
  if (body.status) set("status", body.status);
  if (body.priceCreditsStandard !== undefined) set("price_credits_standard", body.priceCreditsStandard);
  if (body.priceCreditsExtended !== undefined) set("price_credits_extended", body.priceCreditsExtended);
  if (body.categorySlug !== undefined) { const c = body.categorySlug ? await get<{ id: number }>(`SELECT id FROM categories WHERE slug=?`, [body.categorySlug]) : null; set("category_id", c?.id ?? null); }
  if (!sets.length) throw badRequest("Nada que actualizar");
  set("updated_at", nowIso());
  await run(`UPDATE assets SET ${sets.join(", ")} WHERE id=?`, [...args, row.id]);
  res.json(await toDetail((await getAssetRow(row.id))!));
}));

adminRouter.delete("/assets/:id", h(async (req, res) => {
  const row = await getAssetRow(Number(req.params.id));
  if (!row) throw notFound("Recurso no encontrado");
  await run(`DELETE FROM assets WHERE id=?`, [row.id]);
  await deleteAssetFiles(row);
  res.json({ ok: true });
}));

// ── Usuarios ────────────────────────────────────────────────────────────────

adminRouter.get("/users", h(async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const role = typeof req.query.role === "string" && req.query.role !== "all" ? req.query.role : null;
  const { page, perPage, offset } = pageParams(req.query as any, { perPage: 40, max: 100 });
  const where: string[] = ["1=1"]; const args: any[] = [];
  if (q) { where.push("(email LIKE ? OR name LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  if (role) { where.push("role = ?"); args.push(role); }
  const total = Number((await get<{ n: number }>(`SELECT count(*) AS n FROM users WHERE ${where.join(" AND ")}`, args))?.n || 0);
  const rows = await all<any>(`SELECT u.*, (SELECT count(*) FROM assets a WHERE a.contributor_id = u.id) AS asset_count, (SELECT count(*) FROM licenses l WHERE l.user_id = u.id) AS license_count FROM users u WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...args, perPage, offset]);
  res.json({ items: rows.map((r) => ({ ...toUserDto(r), status: r.status, assetCount: Number(r.asset_count), licenseCount: Number(r.license_count), lastLoginAt: r.last_login_at })), total, page, perPage });
}));

adminRouter.patch("/users/:id", h(async (req, res) => {
  const id = Number(req.params.id);
  const u = await findUserById(id);
  if (!u) throw notFound("Usuario no encontrado");
  const body = parse(z.object({ role: z.enum(["user", "contributor", "admin"]).optional(), status: z.enum(["active", "blocked"]).optional(), creditsDelta: z.number().int().optional(), note: z.string().max(200).optional() }), req.body);
  if (body.role) await run(`UPDATE users SET role=? WHERE id=?`, [body.role, id]);
  if (body.status) { await run(`UPDATE users SET status=? WHERE id=?`, [body.status, id]); if (body.status === "blocked") await run(`DELETE FROM sessions WHERE user_id=?`, [id]); }
  if (body.creditsDelta) await grantCredits(id, body.creditsDelta, "admin_adjust", { type: "admin", id: req.user!.id }, body.note || "Ajuste manual");
  res.json(toUserDto((await findUserById(id))!));
}));

// ── Pedidos y pagos ─────────────────────────────────────────────────────────

adminRouter.get("/orders", h(async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : "pending";
  const rows = await all<any>(`SELECT o.id, u.email, u.name FROM orders o JOIN users u ON u.id = o.user_id WHERE o.status=? ORDER BY o.created_at DESC LIMIT 200`, [status]);
  const out = [];
  for (const r of rows) { const o = await getOrder(r.id); if (o) out.push({ ...o, user: { email: r.email, name: r.name } }); }
  res.json(out);
}));

adminRouter.post("/orders/:id/paid", h(async (req, res) => {
  const changed = await markOrderPaid(Number(req.params.id), `manual:${req.user!.id}`);
  res.json({ ok: true, changed });
}));

adminRouter.post("/orders/:id/cancel", h(async (req, res) => {
  await run(`UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'`, [Number(req.params.id)]);
  res.json({ ok: true });
}));

adminRouter.get("/payouts", h(async (req, res) => {
  const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : "requested";
  const rows = await all<any>(`SELECT p.*, u.email, u.name, u.contributor_profile FROM payouts p JOIN users u ON u.id = p.contributor_id WHERE p.status=? ORDER BY p.requested_at ASC`, [status]);
  res.json(rows.map((r) => ({ id: r.id, amountCents: r.amount_cents, method: r.method, account: r.account, status: r.status, note: r.note, requestedAt: r.requested_at, resolvedAt: r.resolved_at, contributor: { id: r.contributor_id, email: r.email, name: parseJson<any>(r.contributor_profile, {}).displayName || r.name } })));
}));

adminRouter.post("/payouts/:id/resolve", h(async (req, res) => {
  const body = parse(z.object({ status: z.enum(["paid", "rejected"]), note: z.string().max(300).optional() }), req.body);
  await resolvePayout(Number(req.params.id), body.status, body.note);
  res.json({ ok: true });
}));

// ── Categorías y colecciones curadas ────────────────────────────────────────

adminRouter.post("/categories", h(async (req, res) => {
  const body = parse(z.object({ slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(60), description: z.string().max(300).optional(), sortOrder: z.number().int().optional() }), req.body);
  const id = await insert(`INSERT INTO categories(slug, name, description, sort_order) VALUES (?,?,?,?)`, [body.slug, body.name, body.description || null, body.sortOrder ?? 0]);
  res.status(201).json({ id });
}));

adminRouter.patch("/categories/:id", h(async (req, res) => {
  const body = parse(z.object({ name: z.string().min(2).max(60).optional(), description: z.string().max(300).nullable().optional(), coverAssetId: z.number().int().nullable().optional(), sortOrder: z.number().int().optional() }), req.body);
  await run(`UPDATE categories SET name=coalesce(?, name), description=coalesce(?, description), cover_asset_id=coalesce(?, cover_asset_id), sort_order=coalesce(?, sort_order) WHERE id=?`, [body.name ?? null, body.description ?? null, body.coverAssetId ?? null, body.sortOrder ?? null, Number(req.params.id)]);
  res.json({ ok: true });
}));

adminRouter.delete("/categories/:id", h(async (req, res) => {
  await run(`DELETE FROM categories WHERE id=?`, [Number(req.params.id)]);
  res.json({ ok: true });
}));

adminRouter.get("/collections", h(async (_req, res) => { res.json(await collectionDtos(`c.is_curated = 1`, [], 200)); }));

adminRouter.post("/collections", h(async (req, res) => {
  const body = parse(z.object({ slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/), title: z.string().min(2).max(80), description: z.string().max(400).optional(), isPublic: z.boolean().default(true), sortOrder: z.number().int().optional() }), req.body);
  const id = await insert(`INSERT INTO collections(slug, user_id, title, description, is_public, is_curated, sort_order) VALUES (?,NULL,?,?,?,1,?)`, [body.slug, body.title, body.description || null, body.isPublic ? 1 : 0, body.sortOrder ?? 0]);
  res.status(201).json((await collectionDtos(`c.id = ?`, [id]))[0]);
}));

adminRouter.post("/collections/:id/items", h(async (req, res) => {
  const { assetId } = parse(z.object({ assetId: z.number().int() }), req.body);
  await run(`INSERT OR IGNORE INTO collection_items(collection_id, asset_id) VALUES (?,?)`, [Number(req.params.id), assetId]);
  await run(`UPDATE collections SET updated_at=? WHERE id=?`, [nowIso(), Number(req.params.id)]);
  res.json({ ok: true });
}));

adminRouter.delete("/collections/:id/items/:assetId", h(async (req, res) => {
  await run(`DELETE FROM collection_items WHERE collection_id=? AND asset_id=?`, [Number(req.params.id), Number(req.params.assetId)]);
  res.json({ ok: true });
}));

adminRouter.delete("/collections/:id", h(async (req, res) => {
  await run(`DELETE FROM collections WHERE id=? AND is_curated=1`, [Number(req.params.id)]);
  res.json({ ok: true });
}));

// ── Ajustes ─────────────────────────────────────────────────────────────────

adminRouter.get("/settings", h(async (_req, res) => {
  const rows = await all<{ key: string; value: string }>(`SELECT key, value FROM settings`);
  res.json(Object.fromEntries(rows.map((r) => [r.key, parseJson(r.value, r.value)])));
}));

adminRouter.put("/settings", h(async (req, res) => {
  const body = parse(z.record(z.string(), z.any()), req.body);
  for (const [k, v] of Object.entries(body)) await run(`INSERT INTO settings(key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, [k, JSON.stringify(v), nowIso()]);
  res.json({ ok: true });
}));
