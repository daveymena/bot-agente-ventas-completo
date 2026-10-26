import { Router } from "express";
import { connectFigma, disconnectFigma, figmaStatus, readFigmaFile, readFigmaNode } from "../lib/figma-connector";
export const figmaRouter = Router();
const endpoint = (run: (req: any, res: any, tenantId: number) => Promise<unknown>) => async (req: any, res: any) => {
  const tid = req.tenant?.id || Number(req.signedCookies?.tenant_id);
  if (!Number.isSafeInteger(tid) || tid < 1) return res.status(401).json({ error: "Sin sesión" });
  try { await run(req, res, tid); } catch (e: any) { res.status(e.status === 401 ? 409 : e.status >= 400 && e.status < 500 ? e.status : 502).json({ error: e.message || "No se pudo completar la consulta de Figma" }); }
};
figmaRouter.get("/estado", endpoint(async (_req, res, tid) => res.json(await figmaStatus(tid))));
figmaRouter.post("/conectar", endpoint(async (req, res, tid) => res.json(await connectFigma(tid, String(req.body.token || ""), String(req.body.source || "")))));
figmaRouter.delete("/desconectar", endpoint(async (_req, res, tid) => { await disconnectFigma(tid); res.json({ ok: true }); }));
figmaRouter.get("/archivo", endpoint(async (req, res, tid) => res.json(await readFigmaFile(tid, String(req.query.source || "")))));
figmaRouter.get("/nodo", endpoint(async (req, res, tid) => res.json(await readFigmaNode(tid, String(req.query.source || ""), String(req.query.nodeId || ""), true))));
