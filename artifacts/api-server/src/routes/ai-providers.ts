import { Router } from "express";
import { z } from "zod";
import { db, settings } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createAIClient,
  getProviderConfigFromDb,
  PROVIDER_BASE_URLS,
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_ENV_KEYS,
  type ProviderDbConfig,
} from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";
import type { TenantRequest } from "../lib/tenantManager";

const router = Router();

const ALL_PROVIDERS = [
  "github", "openai", "anthropic", "gemini",
  "groq", "mistral", "deepseek", "openrouter",
  "together", "nvidia", "ollama_local", "ollama_cloud",
];

async function getOrCreateSettings() {
  const [row] = await db.select().from(settings).limit(1);
  if (row) return row;
  const [created] = await db.insert(settings).values({}).returning();
  return created!;
}

/** GET /api/ai-providers — returns all provider statuses (keys masked) */
router.get("/", async (_req, res, next) => {
  try {
    const s = await getOrCreateSettings();
    const dbProviders = (s.aiProvidersConfig as Record<string, ProviderDbConfig>) || {};
    const fallbacks = (s.aiProviderFallbacks as string[]) || ["github", "groq", "deepseek"];
    const primaryProvider = s.aiProvider || "github";

    const providers = ALL_PROVIDERS.map((id) => {
      const cfg = dbProviders[id] || {};
      const envKey = PROVIDER_ENV_KEYS[id];
      const hasEnvKey = !!(envKey && process.env[envKey]);
      const hasDbKey = !!(cfg.apiKey && cfg.apiKey.length > 4);

      // Ollama providers are configured if they have a URL (DB or env) — no API key needed
      const isOllama = id === "ollama_local" || id === "ollama_cloud";
      const ollamaUrl = cfg.url || (id === "ollama_cloud"
        ? (process.env.OLLAMA_CLOUD_URL || process.env.OLLAMA_LOCAL_URL)
        : process.env.OLLAMA_LOCAL_URL);
      const hasOllamaUrl = isOllama && !!ollamaUrl;

      const configured = hasEnvKey || hasDbKey || hasOllamaUrl;
      const effectiveUrl = cfg.url || (isOllama ? ollamaUrl || "" : "");

      return {
        id,
        model: cfg.model
          || (id === "ollama_cloud" ? process.env.OLLAMA_CLOUD_MODEL : undefined)
          || (id === "ollama_local" ? process.env.OLLAMA_LOCAL_MODEL : undefined)
          || process.env[`${id.toUpperCase()}_MODEL`]
          || PROVIDER_DEFAULT_MODELS[id]
          || "gpt-4o-mini",
        enabled: cfg.enabled !== false && configured,
        configured,
        keySource: hasDbKey ? "db" : (hasEnvKey || hasOllamaUrl) ? "env" : "none",
        apiKeyMasked: hasDbKey ? cfg.apiKey!.slice(0, 6) + "••••••••••••"
          : hasOllamaUrl ? "(URL desde .env)" : hasEnvKey ? "(desde .env)" : "",
        url: effectiveUrl,
      };
    });

    return res.json({
      providers,
      primaryProvider,
      fallbacks,
    });
  } catch (e) { return next(e); }
});

const saveSchema = z.object({
  providerId: z.string(),
  apiKey: z.string().optional(),
  model: z.string().optional(),
  enabled: z.boolean().optional(),
  url: z.string().optional(),
});

/** POST /api/ai-providers/save — save a provider config */
router.post("/save", async (req: TenantRequest, res, next) => {
  try {
    const { providerId, apiKey, model, enabled, url } = saveSchema.parse(req.body);
    const s = await getOrCreateSettings();
    const current = (s.aiProvidersConfig as Record<string, ProviderDbConfig>) || {};

    const updated: ProviderDbConfig = { ...current[providerId] };
    if (apiKey !== undefined) updated.apiKey = apiKey || undefined;
    if (model !== undefined) updated.model = model || undefined;
    if (enabled !== undefined) updated.enabled = enabled;
    if (url !== undefined) updated.url = url || undefined;

    const newConfig = { ...current, [providerId]: updated };
    await db.update(settings).set({ aiProvidersConfig: newConfig }).where(eq(settings.id, s.id));

    logger.info({ providerId }, "[AI Providers] Provider config saved");
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

/** POST /api/ai-providers/set-primary — change primary/fallback chain */
router.post("/set-primary", async (req, res, next) => {
  try {
    const { primaryProvider, fallbacks } = req.body;
    const s = await getOrCreateSettings();
    await db.update(settings).set({
      aiProvider: primaryProvider || s.aiProvider,
      aiProviderFallbacks: fallbacks || s.aiProviderFallbacks,
    }).where(eq(settings.id, s.id));
    return res.json({ ok: true });
  } catch (e) { return next(e); }
});

/** POST /api/ai-providers/test — test a provider connection */
router.post("/test", async (req, res, next) => {
  try {
    const { providerId, apiKey, model, url } = req.body as {
      providerId: string; apiKey?: string; model?: string; url?: string;
    };

    const s = await getOrCreateSettings();
    const dbProviders = (s.aiProvidersConfig as Record<string, ProviderDbConfig>) || {};
    const testCfg: ProviderDbConfig = {
      apiKey: apiKey || dbProviders[providerId]?.apiKey,
      model: model || dbProviders[providerId]?.model || PROVIDER_DEFAULT_MODELS[providerId],
      url: url || dbProviders[providerId]?.url,
      enabled: true,
    };

    const config = getProviderConfigFromDb(providerId, { [providerId]: testCfg });
    if (!config) {
      return res.status(400).json({ ok: false, error: "Sin API Key o URL configurada para este proveedor" });
    }

    const client = createAIClient(config);
    const start = Date.now();

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: "user", content: 'Responde solo "OK" en una palabra.' }],
      max_tokens: 10,
      temperature: 0,
    });

    const latency = Date.now() - start;
    const reply = completion.choices[0]?.message?.content?.trim() || "";

    return res.json({
      ok: true,
      latency,
      model: config.model,
      reply: reply.slice(0, 50),
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    logger.warn({ err: msg }, "[AI Providers] Test failed");
    return res.json({ ok: false, error: msg.slice(0, 200) });
  }
});

export default router;
