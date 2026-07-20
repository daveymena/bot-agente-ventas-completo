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

    // Guardar en DB
    const currentSettings = await getOrCreate();
    await db.update(settings)
      .set({ 
        githubToken,
        copilotSessionToken: sessionToken.token,
        copilotSessionExpiresAt: new Date(sessionToken.expiresAt * 1000).toISOString()
      })
      .where(eq(settings.id, currentSettings.id));

    return res.json({ 
      success: true, 
      token: sessionToken.token,
      expires_at: sessionToken.expiresAt 
    });
  } catch (e) {
    return next(e);
  }
});

router.post("/copilot-device-code", async (_req, res, next) => {
  try {
    // getCopilotDeviceCode no longer exists in the copilot module
    return res.status(501).json({ error: "Device code flow not implemented" });
    if (!data) {
      console.error("❌ [BACKEND] Error: getCopilotDeviceCode devolvió null");
      return res.status(500).json({ error: "Error al generar código de dispositivo" });
    }
    console.log("✅ [BACKEND] Código generado con éxito:", data.user_code);
    return res.json(data);
  } catch (e) {
    console.error("💥 [BACKEND] Error crítico en copilot-device-code:", e);
    return next(e);
  }
});

router.post("/copilot-device-token", async (req, res, next) => {
  try {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: "device_code requerido" });
    // pollCopilotToken no longer exists in the copilot module
    return res.status(501).json({ error: "Device code token polling not implemented" });
    
    return res.status(400).json({ error: "No se pudo obtener el token. Es posible que el código haya expirado." });
  } catch (e: any) {
    console.error("❌ [BACKEND] Error en copilot-device-token:", e.message);
    return res.status(400).json({ error: e.message || "Error al obtener token" });
  }
});

async function getOrCreate() {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({}).returning();
  return created!;
}

function parseKeywords(val: unknown): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return val ? [val] : [];
    }
  }
  return [];
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
    escalationKeywords: parseKeywords(row.escalationKeywords),
    aiProvider: row.aiProvider,
    githubToken: row.githubToken,
    githubModel: row.githubModel,
    copilotSessionToken: row.copilotSessionToken,
    copilotSessionExpiresAt: row.copilotSessionExpiresAt,
    nvidiaApiKey: row.nvidiaApiKey,
    nvidiaModel: row.nvidiaModel,
    ollamaUrl: row.ollamaUrl,
    ollamaModel: row.ollamaModel,
  };
}

export default router;
