import { Router } from "express";
import type { TenantRequest } from "../lib/tenantManager";
import { canvaRequest } from "../lib/canva-connector";
import { catalog, createJob, FIELDS, linkAd, listJobs, productData, registerTemplate, resumeJob, sourceDataset } from "../lib/canva/studio";
import { templates } from "../lib/canva/store";

export const canvaStudioRouter = Router();
const endpoint = (run: (req: any, res: any, tenantId: number) => Promise<unknown>) => async (req: TenantRequest, res: any) => {
  const tenantId = req.tenant?.id || Number((req as any).signedCookies?.tenant_id);
  if (!Number.isSafeInteger(tenantId) || tenantId! < 1) return res.status(401).json({ error: "Sin sesión" });
  try { await run(req, res, tenantId!); } catch (e: any) { res.status(e.status === 401 ? 409 : e.status >= 400 && e.status < 500 ? e.status : 502).json({ error: e.message || "No se pudo completar la operación de Canva", reconnect: e.status === 401 }); }
};
canvaStudioRouter.get("/catalogo", endpoint(async (req, res, tid) => res.json(await catalog(tid, String(req.query.q || ""), String(req.query.continuation || ""), req.query.type === "brand_template" ? "brand_template" : "design"))));
canvaStudioRouter.get("/plantillas", endpoint(async (_req, res, tid) => res.json({ items: await templates(tid), fields: FIELDS })));
canvaStudioRouter.post("/plantillas", endpoint(async (req, res, tid) => res.json(await registerTemplate(tid, req.body))));
canvaStudioRouter.get("/dataset/:type/:id", endpoint(async (req, res, tid) => {
  if (!["design", "brand_template"].includes(req.params.type)) return res.status(400).json({ error: "Tipo de diseño inválido" });
  res.json({ dataset: await sourceDataset(tid, req.params.type, req.params.id) });
}));
canvaStudioRouter.get("/producto/:id", endpoint(async (req, res, tid) => res.json(await productData(tid, Number(req.params.id)))));
canvaStudioRouter.get("/trabajos", endpoint(async (_req, res, tid) => res.json({ items: await listJobs(tid) })));
canvaStudioRouter.post("/trabajos", endpoint(async (req, res, tid) => { const j = await createJob(tid, req.body); res.status(202).json({ id: j.id, state: j.state }); }));
canvaStudioRouter.post("/trabajos/:id/continuar", endpoint(async (req, res, tid) => { const j = await resumeJob(tid, req.params.id); res.json({ id: j.id, state: j.state }); }));
canvaStudioRouter.post("/trabajos/:id/anuncio", endpoint(async (req, res, tid) => { await linkAd(tid, req.params.id, String(req.body.pieceKey || ""), String(req.body.adId || "")); res.json({ ok: true }); }));
canvaStudioRouter.get("/resultados", endpoint(async (_req, res, tid) => {
  const { getAttributionSummary } = await import("../lib/marketing-team/attribution");
  const summary = await getAttributionSummary(tid, 30);
  const bindings = (await listJobs(tid)).flatMap((j) => j.pieces.flatMap((p) => (p.adIds || []).map((adId) => ({ jobId: j.id, pieceKey: p.key, adId }))));
  res.json({ days: 30, items: bindings.map((b) => ({ ...b, attribution: summary.rows.find((r) => r.adId === b.adId) || null })) });
}));
canvaStudioRouter.post("/nuevo", endpoint(async (req, res, tid) => {
  const format = req.body.format === "9:16" ? { width: 1080, height: 1920 } : req.body.format === "1:1" ? { width: 1080, height: 1080 } : { width: 1080, height: 1350 };
  const r = await canvaRequest(tid, "/designs", { design_type: { type: "custom", ...format }, title: "VentasPro · Plantilla editable" });
  res.json({ id: r.design?.id, editUrl: r.design?.urls?.edit_url });
}));
