import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { get, run } from "../db/client";
import { config } from "../config";
import { h, parse, notFound, forbidden } from "../lib/http";
import { requireUser, findUserById, toUserDto } from "../lib/auth";
import { cancelOrder, createOrder, getOrder, handleMercadoPagoWebhook, licenseAsset, listLicenses, listOrders, listPacks, listPlans, quoteLicense, licenseDto } from "../lib/commerce";
import { getAssetRow } from "../lib/assets";
import { originalAbs } from "../lib/media";
import { LICENSE_TEXT } from "../../shared/pricing";

export const billingRouter = Router();
export const licensesRouter = Router();

billingRouter.get("/catalog", h(async (_req, res) => {
  res.json({ plans: await listPlans(), packs: await listPacks(), currency: config.currency, creditValueCents: config.creditValueCents, providers: { mercadopago: !!config.payments.mercadoPagoAccessToken, transfer: !!config.payments.transfer.account || !config.isProd } });
}));

billingRouter.post("/orders", requireUser, h(async (req, res) => {
  const body = parse(z.object({ kind: z.enum(["pack", "subscription"]), referenceId: z.number().int(), billing: z.enum(["monthly", "annual"]).optional(), provider: z.enum(["manual", "mercadopago"]).optional() }), req.body);
  res.status(201).json(await createOrder(req.user!, body));
}));

billingRouter.get("/orders", requireUser, h(async (req, res) => { res.json(await listOrders(req.user!.id)); }));

billingRouter.get("/orders/:id", requireUser, h(async (req, res) => {
  const o = await getOrder(Number(req.params.id), req.user!.role === "admin" ? undefined : req.user!.id);
  if (!o) throw notFound("Pedido no encontrado");
  res.json(o);
}));

billingRouter.post("/orders/:id/cancel", requireUser, h(async (req, res) => { await cancelOrder(Number(req.params.id), req.user!.id); res.json({ ok: true }); }));

/** Webhook público de Mercado Pago (IPN / Webhooks v2). */
billingRouter.post("/webhooks/mercadopago", h(async (req, res) => {
  const r = await handleMercadoPagoWebhook(req.query, req.body);
  res.json(r);
}));
billingRouter.get("/webhooks/mercadopago", h(async (req, res) => {
  const r = await handleMercadoPagoWebhook(req.query, {});
  res.json(r);
}));

// ── Licencias ───────────────────────────────────────────────────────────────

licensesRouter.get("/text", (_req, res) => res.json(LICENSE_TEXT));

licensesRouter.get("/quote", h(async (req, res) => {
  const q = parse(z.object({ assetId: z.coerce.number().int(), type: z.enum(["standard", "extended"]).default("standard") }), req.query);
  const asset = await getAssetRow(q.assetId);
  if (!asset || asset.status !== "approved") throw notFound("Recurso no disponible");
  const [standard, extended] = await Promise.all([quoteLicense(req.user, asset, "standard"), quoteLicense(req.user, asset, "extended")]);
  res.json({ standard, extended, credits: req.user?.credits ?? 0, subscription: req.user ? toUserDto(req.user).subscription : null });
}));

licensesRouter.post("/", requireUser, h(async (req, res) => {
  const body = parse(z.object({ assetId: z.number().int(), type: z.enum(["standard", "extended"]).default("standard") }), req.body);
  const r = await licenseAsset(req.user!, body.assetId, body.type);
  const user = toUserDto((await findUserById(req.user!.id))!);
  res.status(201).json({ ...r, user });
}));

licensesRouter.get("/", requireUser, h(async (req, res) => { res.json(await listLicenses(req.user!.id)); }));

licensesRouter.get("/:id", requireUser, h(async (req, res) => {
  const row = await get<any>(`SELECT * FROM licenses WHERE id=?`, [Number(req.params.id)]);
  if (!row) throw notFound("Licencia no encontrada");
  if (row.user_id !== req.user!.id && req.user!.role !== "admin") throw forbidden();
  res.json(await licenseDto(row));
}));

/** Descarga del archivo original: solo con licencia. */
licensesRouter.get("/:id/download", requireUser, h(async (req, res) => {
  const row = await get<any>(`SELECT * FROM licenses WHERE id=?`, [Number(req.params.id)]);
  if (!row) throw notFound("Licencia no encontrada");
  if (row.user_id !== req.user!.id && req.user!.role !== "admin") throw forbidden();
  const asset = await getAssetRow(row.asset_id);
  if (!asset?.original_path) throw notFound("Archivo no disponible");
  const abs = originalAbs(asset.original_path);
  if (!fs.existsSync(abs)) throw notFound("Archivo no disponible");
  await run(`UPDATE licenses SET downloads_count = downloads_count + 1 WHERE id=?`, [row.id]);
  const safeTitle = asset.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  res.download(abs, `${config.brand.name.toLowerCase().replace(/\s+/g, "")}-${asset.id}-${safeTitle}${path.extname(abs)}`);
}));

/** Certificado de licencia en HTML imprimible. */
licensesRouter.get("/:id/certificate", requireUser, h(async (req, res) => {
  const row = await get<any>(`SELECT * FROM licenses WHERE id=?`, [Number(req.params.id)]);
  if (!row) throw notFound("Licencia no encontrada");
  if (row.user_id !== req.user!.id && req.user!.role !== "admin") throw forbidden();
  const asset = await getAssetRow(row.asset_id);
  const owner = await findUserById(row.user_id);
  const text = LICENSE_TEXT[row.type as "standard" | "extended"];
  const esc = (s: string) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Certificado ${esc(row.certificate_no)}</title>
  <style>body{font-family:Inter,system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;color:#0f172a}h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b;font-size:13px}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px}td:first-child{color:#64748b;width:200px}ul{font-size:14px;line-height:1.6}.brand{font-weight:800;letter-spacing:-.02em;font-size:18px}@media print{button{display:none}}</style></head>
  <body><div class="brand">${esc(config.brand.name)}</div><h1>Certificado de licencia</h1><div class="muted">N.º ${esc(row.certificate_no)} · emitido el ${new Date(row.created_at).toLocaleString("es-CO")}</div>
  <table><tr><td>Titular</td><td>${esc(owner?.name || "")} &lt;${esc(owner?.email || "")}&gt;</td></tr>
  <tr><td>Recurso</td><td>#${asset?.id} · ${esc(asset?.title || "")}</td></tr>
  <tr><td>Colaborador</td><td>${esc(asset?.contributor_name || "—")}</td></tr>
  <tr><td>Tipo de licencia</td><td>${esc(text.name)}</td></tr>
  <tr><td>Formato</td><td>${esc((asset?.file_format || "").toUpperCase())} · ${asset?.width || 0}×${asset?.height || 0}${asset?.duration_sec ? ` · ${Math.round(asset.duration_sec)} s` : ""}</td></tr>
  <tr><td>Pago</td><td>${row.source === "free" ? "Recurso gratuito" : row.source === "subscription" ? "Cuota de suscripción" : `${row.credits_spent} crédito(s)`}</td></tr></table>
  <h3>Alcance</h3><ul>${text.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
  <p class="muted">Licencia perpetua, mundial y no exclusiva otorgada por ${esc(config.brand.name)} en nombre del colaborador. Verificación: ${esc(config.appUrl)}/licencias/${row.id}</p>
  <button onclick="print()">Imprimir / Guardar PDF</button></body></html>`);
}));
