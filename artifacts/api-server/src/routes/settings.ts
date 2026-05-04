import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { db, settings } from "@workspace/db";
import { getCopilotSessionToken } from "../lib/copilot";

const router: IRouter = Router();

router.get("/", async (_req, res, next) => {
  try {
    const row = await getOrCreate();
    return res.json(GetSettingsResponse.parse(serialize(row)));
  } catch (e) {
    return next(e);
  }
});

router.patch("/", async (req, res, next) => {
  try {
    const body = UpdateSettingsBody.parse(req.body);
    const current = await getOrCreate();
    const [updated] = await db
      .update(settings)
      .set(body)
      .where(eq(settings.id, current.id))
      .returning();
    return res.json(UpdateSettingsResponse.parse(serialize(updated!)));
  } catch (e) {
    return next(e);
  }
});

router.post("/copilot-token", async (req, res, next) => {
  try {
    const { githubToken } = req.body;
    if (!githubToken) {
      return res.status(400).json({ error: "Token de GitHub (PAT) requerido" });
    }

    const sessionToken = await getCopilotSessionToken(githubToken);
    if (!sessionToken) {
      return res.status(401).json({ error: "Token inválido. Verifica tu PAT e intenta de nuevo." });
    }

    return res.json({ 
      success: true, 
      token: sessionToken.token,
      expires_at: sessionToken.expires_at 
    });
  } catch (e) {
    return next(e);
  }
});

async function getOrCreate() {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({}).returning();
  return created!;
}

function serialize(row: typeof settings.$inferSelect) {
  return {
    businessName: row.businessName,
    businessDescription: row.businessDescription,
    timezone: row.timezone,
    workingHoursStart: row.workingHoursStart,
    workingHoursEnd: row.workingHoursEnd,
    autoReplyEnabled: row.autoReplyEnabled,
    offHoursMessage: row.offHoursMessage,
    escalationKeywords: row.escalationKeywords ?? [],
    aiProvider: row.aiProvider,
    githubToken: row.githubToken,
    githubModel: row.githubModel,
    ollamaUrl: row.ollamaUrl,
    ollamaModel: row.ollamaModel,
  };
}

export default router;
