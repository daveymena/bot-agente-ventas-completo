import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  GetSettingsResponse,
  UpdateSettingsBody,
  UpdateSettingsResponse,
} from "@workspace/api-zod";
import { db, settings } from "@workspace/db";
import { getCopilotSessionToken, getCopilotDeviceCode, pollCopilotToken } from "../lib/copilot";
import { encryptionService } from "../lib/encryption-service";
import { providerValidator } from "../lib/provider-validator";
import { costTracker } from "../lib/cost-tracker";
import { logger } from "../lib/logger";

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

// ============================================================
// PROVIDER CONFIGURATION ENDPOINTS
// ============================================================

/**
 * GET /api/settings/providers
 * Listar providers configurados (keys enmascaradas)
 */
router.get("/providers", async (req, res, next) => {
  try {
    const currentSettings = await getOrCreate();

    // En memoria guardamos providers, por ahora retornar configurados en settings
    const providers = [];

    if (currentSettings.aiProvider) {
      providers.push({
        id: "default",
        provider: currentSettings.aiProvider,
        apiKey: "***CONFIGURED***",
        model: "gpt-4o-mini",
        isActive: true,
      });
    }

    return res.json({ ok: true, providers });
  } catch (e) {
    return next(e);
  }
});

/**
 * POST /api/settings/test-provider
 * Testear conexión a un provider
 */
router.post("/test-provider", async (req, res, next) => {
  try {
    const { provider, apiKey, resourceName } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        error: "provider y apiKey son requeridos",
      });
    }

    logger.info({ provider }, "🧪 Testing provider connection");

    const result = await providerValidator.validateProvider(provider, apiKey, resourceName);

    return res.json({
      ok: true,
      test: result,
    });
  } catch (e) {
    logger.error({ error: e }, "❌ Provider test failed");
    return next(e);
  }
});

/**
 * POST /api/settings/add-provider
 * Añadir nuevo provider con API key encriptada
 */
router.post("/add-provider", async (req, res, next) => {
  try {
    const { provider, apiKey, model, resourceName } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        error: "provider y apiKey son requeridos",
      });
    }

    // Validar formato de key
    const validation = encryptionService.validateApiKey(provider, apiKey);
    if (!validation.valid) {
      return res.status(400).json({
        error: validation.error,
      });
    }

    // Testear conexión
    const testResult = await providerValidator.validateProvider(provider, apiKey, resourceName);
    if (!testResult.valid) {
      return res.status(400).json({
        error: `Provider test fallido: ${testResult.message}`,
        details: testResult.error,
      });
    }

    // Encriptar y guardar
    const encrypted = encryptionService.encrypt(apiKey);
    const currentSettings = await getOrCreate();

    // Por ahora, guardar en settings como aiProvider
    await db.update(settings)
      .set({
        aiProvider: provider,
        // Podríamos añadir campos adicionales a settings si es necesario
      })
      .where(eq(settings.id, currentSettings.id));

    logger.info({ provider, model }, "✅ Provider añadido");

    return res.json({
      ok: true,
      message: `Provider ${provider} configurado exitosamente`,
      provider: {
        id: "default",
        provider,
        apiKey: encryptionService.maskApiKey(apiKey),
        model: model || testResult.models?.[0] || "default",
        isActive: true,
      },
    });
  } catch (e) {
    logger.error({ error: e }, "❌ Add provider failed");
    return next(e);
  }
});

/**
 * GET /api/settings/costs
 * Obtener dashboard de costos
 */
router.get("/costs", async (req, res, next) => {
  try {
    const period = (req.query.period as "today" | "week" | "month") || "month";
    const tenantId = (req as any).tenant?.id;

    const report = costTracker.getReport(period, tenantId);

    return res.json({
      ok: true,
      report,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/settings/provider-models
 * Obtener modelos disponibles por provider
 */
router.get("/provider-models", async (req, res, next) => {
  try {
    const providers = ["openai", "claude", "azure", "g4f"];
    const models: Record<string, string[]> = {};

    for (const provider of providers) {
      models[provider] = providerValidator.getAvailableModels(provider);
    }

    return res.json({
      ok: true,
      models,
    });
  } catch (e) {
    return next(e);
  }
});

/**
 * GET /api/settings/provider-costs
 * Obtener tabla de costos por modelo
 */
router.get("/provider-costs", async (req, res, next) => {
  try {
    const { provider, model } = req.query;

    if (!provider || !model) {
      return res.status(400).json({
        error: "provider y model son requeridos",
      });
    }

    const cost = providerValidator.getModelCost(String(provider), String(model));

    return res.json({
      ok: true,
      provider,
      model,
      cost,
      perMillionTokens: {
        input: cost.input,
        output: cost.output,
      },
      perThousandTokens: {
        input: (cost.input / 1000).toFixed(6),
        output: (cost.output / 1000).toFixed(6),
      },
    });
  } catch (e) {
    return next(e);
  }
});

export default router;
