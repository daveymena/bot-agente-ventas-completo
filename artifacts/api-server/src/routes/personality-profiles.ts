import { Router, type IRouter } from "express";
import { personalityEngine } from "../lib/personality-engine";
import { db, personalityProfiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    const tenantId = _req.query.tenantId
      ? Number(_req.query.tenantId)
      : undefined;
    const profiles = await personalityEngine.listProfiles(tenantId);
    res.json({ ok: true, profiles });
  } catch (e) {
    next(e);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const profile = await personalityEngine.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const profile = await personalityEngine.createProfile({
      name: req.body.name,
      description: req.body.description,
      agentName: req.body.agentName,
      agentRole: req.body.agentRole,
      tone: req.body.tone || "warm_professional",
      language: req.body.language || "es",
      formality: req.body.formality || "tú",
      agentType: req.body.agentType || "general",
      systemPromptCore: req.body.systemPromptCore,
      keywords: req.body.keywords || [],
      brandVoiceOverrides: req.body.brandVoiceOverrides || null,
      tenantId: req.body.tenantId || null,
      isActive: req.body.isActive ?? true,
    });
    return res.status(201).json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const profile = await personalityEngine.updateProfile(
      Number(req.params.id),
      req.body
    );
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, profile });
  } catch (e) {
    return next(e);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const deleted = await personalityEngine.deleteProfile(
      Number(req.params.id)
    );
    if (!deleted)
      return res.status(404).json({ error: "Profile not found" });
    return res.json({ ok: true, message: "Profile deleted" });
  } catch (e) {
    return next(e);
  }
});

router.post("/:id/materialize", async (req, res, next) => {
  try {
    const tenantId = req.body.tenantId || 1;
    const agent = await personalityEngine.materializeAgent(
      Number(req.params.id),
      tenantId
    );
    if (!agent)
      return res.status(404).json({ error: "Profile not found" });
    return res.status(201).json({ ok: true, agent, message: "Agent created from personality profile" });
  } catch (e) {
    return next(e);
  }
});

router.post("/generate", async (req, res, next) => {
  try {
    const { description, agentType, tone, language } = req.body;
    if (!description) {
      return res.status(400).json({ error: "description is required" });
    }
    const generated = personalityEngine.generateAgentFromProfile({
      id: 0,
      tenantId: req.body.tenantId || null,
      name: req.body.agentName || "Agente Personalizado",
      description,
      agentName: req.body.agentName || "Agente Personalizado",
      agentRole: req.body.agentRole || "Asesor Virtual",
      tone: tone || "warm_professional",
      language: language || "es",
      formality: req.body.formality || "tú",
      agentType: agentType || "general",
      systemPromptCore: description,
      keywords: req.body.keywords || [],
      brandVoiceOverrides: req.body.brandVoiceOverrides || null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    return res.json({ ok: true, generated });
  } catch (e) {
    return next(e);
  }
});

export default router;
