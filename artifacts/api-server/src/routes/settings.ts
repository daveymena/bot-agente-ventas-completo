import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { db, settings } from "@workspace/db";
import { getCopilotSessionToken, getCopilotDeviceCode, pollCopilotToken } from "../lib/copilot";

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
    const data = await getCopilotDeviceCode();
    if (!data) {
      return res.status(502).json({ error: "No se pudo generar el código de dispositivo de GitHub" });
    }
    console.log("✅ [BACKEND] Código de dispositivo generado:", data.user_code);
    // El frontend debe mostrar user_code y verification_uri, y luego hacer polling
    return res.json(data);
  } catch (e) {
    console.error("💥 [BACKEND] Error en copilot-device-code:", e);
    return next(e);
  }
});

router.post("/copilot-device-token", async (req, res, next) => {
  try {
    const { device_code } = req.body;
    if (!device_code) return res.status(400).json({ error: "device_code requerido" });

    const result = await pollCopilotToken(device_code);

    if (result.status === "pending") {
      // Aún no autorizado: el frontend debe reintentar según el interval
      return res.status(202).json({ status: "pending" });
    }
    if (result.status === "error" || !result.accessToken) {
      return res.status(400).json({
        status: "error",
        error: result.error || "No se pudo obtener el token (código expirado o denegado).",
      });
    }

    // Autorizado: intercambiar el token OAuth por el token de sesión de Copilot y guardarlo
    const accessToken = result.accessToken;
    const sessionToken = await getCopilotSessionToken(accessToken);

    const currentSettings = await getOrCreate();
    await db.update(settings)
      .set({
        githubToken: accessToken,
        copilotSessionToken: sessionToken?.token || null,
        copilotSessionExpiresAt: sessionToken?.expiresAt
          ? new Date(sessionToken.expiresAt * 1000).toISOString()
          : null,
      })
      .where(eq(settings.id, currentSettings.id));

    console.log("✅ [BACKEND] Copilot autorizado y token guardado");
    return res.json({ status: "authorized", success: true });
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
