import { Router } from "express";
import { z } from "zod";
import { all, get, insert, run, nowIso } from "../db/client";
import { config } from "../config";
import { h, parse, badRequest, notFound, forbidden } from "../lib/http";
import { requireUser } from "../lib/auth";
import { aiEnabled, generateImage, autoTagFromText } from "../lib/ai";
import { ingestAsset } from "../lib/ingest";
import { getAssetRow, toDetail } from "../lib/assets";

export const aiRouter = Router();

aiRouter.get("/status", (_req, res) => {
  res.json({ enabled: aiEnabled(), imageModel: aiEnabled() ? config.ai.imageModel : null, visionModel: aiEnabled() ? config.ai.visionModel : null, sizes: ["1024x1024", "1536x1024", "1024x1536"] });
});

/**
 * Genera una imagen y la guarda como recurso PRIVADO del usuario (status draft,
 * marcado como IA). Si después la publica, pasa por moderación como cualquier
 * otro recurso — igual que el contenido generativo en Adobe Stock.
 */
aiRouter.post("/generate", requireUser, h(async (req, res) => {
  if (!aiEnabled()) throw badRequest("La generación con IA no está configurada en este servidor (STOCK_AI_API_KEY).");
  const body = parse(z.object({ prompt: z.string().min(4).max(1000), size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024") }), req.body);
  const genId = await insert(`INSERT INTO ai_generations(user_id, prompt, model, size, status) VALUES (?,?,?,?,'done')`, [req.user!.id, body.prompt, config.ai.imageModel, body.size]);
  let img;
  try {
    img = await generateImage(body.prompt, body.size);
    if (!img) throw new Error("El proveedor no devolvió imagen.");
  } catch (e: any) {
    await run(`UPDATE ai_generations SET status='failed', error=? WHERE id=?`, [String(e?.message || e).slice(0, 300), genId]);
    throw badRequest(`No se pudo generar la imagen: ${String(e?.message || e).slice(0, 200)}`);
  }
  const tags = await autoTagFromText(`Imagen generada con IA a partir de: ${body.prompt}`).catch(() => null);
  const keywords = tags?.keywords?.length ? tags.keywords : [...new Set(body.prompt.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3))].slice(0, 20);
  const assetId = await ingestAsset({
    buffer: img.buffer, filename: `ia-${genId}.png`, mimetype: "image/png", type: "illustration",
    title: tags?.title || body.prompt.slice(0, 120), description: tags?.description || `Generada con IA. Indicación: ${body.prompt}`, keywords: [...keywords, "ia", "generado con ia", "ai generated"],
    categorySlug: tags?.category || null, contributorId: req.user!.id, status: "draft", isAiGenerated: true, skipQuality: true,
  });
  await run(`UPDATE ai_generations SET asset_id=? WHERE id=?`, [assetId, genId]);
  res.status(201).json({ generationId: genId, revisedPrompt: img.revisedPrompt || null, asset: await toDetail((await getAssetRow(assetId))!, req.user!.id) });
}));

aiRouter.get("/generations", requireUser, h(async (req, res) => {
  const rows = await all<any>(`SELECT * FROM ai_generations WHERE user_id=? ORDER BY created_at DESC LIMIT 60`, [req.user!.id]);
  const out = [];
  for (const r of rows) {
    const a = r.asset_id ? await getAssetRow(r.asset_id) : null;
    out.push({ id: r.id, prompt: r.prompt, model: r.model, size: r.size, status: r.status, error: r.error, createdAt: r.created_at, asset: a ? await toDetail(a, req.user!.id) : null });
  }
  res.json(out);
}));

/** Publicar una generación en el catálogo: el usuario pasa a colaborador si no lo era y el recurso entra a revisión. */
aiRouter.post("/generations/:id/publish", requireUser, h(async (req, res) => {
  const g = await get<any>(`SELECT * FROM ai_generations WHERE id=?`, [Number(req.params.id)]);
  if (!g || !g.asset_id) throw notFound("Generación no encontrada");
  if (g.user_id !== req.user!.id) throw forbidden();
  if (req.user!.role === "user") {
    await run(`UPDATE users SET role='contributor', contributor_profile=coalesce(contributor_profile, ?) WHERE id=?`, [JSON.stringify({ displayName: req.user!.name, acceptedTermsAt: nowIso() }), req.user!.id]);
  }
  await run(`UPDATE assets SET status='pending', updated_at=? WHERE id=? AND status IN ('draft','rejected')`, [nowIso(), g.asset_id]);
  res.json(await toDetail((await getAssetRow(g.asset_id))!, req.user!.id));
}));
