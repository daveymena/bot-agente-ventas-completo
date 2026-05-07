import OpenAI from "openai";

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderDbConfig {
  apiKey?: string;
  model?: string;
  enabled?: boolean;
  url?: string; // for ollama
}

// All supported providers with their OpenAI-compatible endpoints
export const PROVIDER_BASE_URLS: Record<string, string> = {
  replit:       "", // dynamic — from AI_INTEGRATIONS_OPENAI_BASE_URL
  github:       "https://models.inference.ai.azure.com",
  openai:       "https://api.openai.com/v1",
  anthropic:    "https://api.anthropic.com/v1",
  gemini:       "https://generativelanguage.googleapis.com/v1beta/openai",
  groq:         "https://api.groq.com/openai/v1",
  mistral:      "https://api.mistral.ai/v1",
  deepseek:     "https://api.deepseek.com/v1",
  openrouter:   "https://openrouter.ai/api/v1",
  together:     "https://api.together.xyz/v1",
  nvidia:       "https://integrate.api.nvidia.com/v1",
  ollama_local: "", // dynamic — from OLLAMA_LOCAL_URL env or DB url field
  ollama_cloud: "", // dynamic — from OLLAMA_CLOUD_URL env or DB url field
};

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  github:       "gpt-4o-mini",
  openai:       "gpt-4o-mini",
  anthropic:    "claude-3-5-haiku-20241022",
  gemini:       "gemini-1.5-flash",
  groq:         "llama-3.1-8b-instant",
  mistral:      "mistral-small-latest",
  deepseek:     "deepseek-chat",
  openrouter:   "openai/gpt-4o-mini",
  together:     "meta-llama/Llama-3-8b-chat-hf",
  nvidia:       "meta/llama-3.1-70b-instruct",
  ollama_local: "llama3.2:3b",
  ollama_cloud: "gpt-oss:20b-cloud",
};

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  replit:       "AI_INTEGRATIONS_OPENAI_API_KEY",
  github:       "GITHUB_TOKEN",
  openai:       "OPENAI_API_KEY",
  anthropic:    "ANTHROPIC_API_KEY",
  gemini:       "GEMINI_API_KEY",
  groq:         "GROQ_API_KEY",
  mistral:      "MISTRAL_API_KEY",
  deepseek:     "DEEPSEEK_API_KEY",
  openrouter:   "OPENROUTER_API_KEY",
  together:     "TOGETHER_API_KEY",
  nvidia:       "NVIDIA_API_KEY",
};

// Resolve the GitHub token from env — GITHUB_TOKEN may contain a placeholder literal;
// fall back to GITHUB_PERSONAL_ACCESS_TOKEN which holds the real token.
function resolveGithubToken(): string | undefined {
  const t = process.env.GITHUB_TOKEN;
  // If the value looks like a placeholder (not starting with "ghp_", "github_pat_", or "gho_"),
  // prefer GITHUB_PERSONAL_ACCESS_TOKEN instead.
  if (t && (t.startsWith("ghp_") || t.startsWith("github_pat_") || t.startsWith("gho_"))) {
    return t;
  }
  const pat = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (pat && (pat.startsWith("ghp_") || pat.startsWith("github_pat_") || pat.startsWith("gho_"))) {
    return pat;
  }
  return t || pat; // last resort: return whatever is set
}

export function getProviderConfig(provider: string): AIProviderConfig | null {
  // Handle legacy specific providers
  if (provider === "github_claude") {
    const apiKey = resolveGithubToken();
    if (!apiKey) return null;
    return {
      baseUrl: PROVIDER_BASE_URLS.github,
      apiKey,
      model: process.env.GITHUB_MODEL_CLAUDE || "Claude-3.5-Sonnet",
    };
  }
  if (provider === "replit") {
    const url = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    if (!url || !apiKey) return null;
    return {
      baseUrl: url,
      apiKey,
      model: process.env.REPLIT_AI_MODEL || "gpt-5-mini",
    };
  }
  if (provider === "ollama_local") {
    const url = process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return {
      baseUrl: url + "/v1",
      apiKey: "ollama",
      model: process.env.OLLAMA_LOCAL_MODEL || "llama3.2:3b",
    };
  }
  if (provider === "ollama_cloud") {
    const url = process.env.OLLAMA_CLOUD_URL || process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return {
      baseUrl: url + "/v1",
      apiKey: "ollama",
      model: process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:20b-cloud",
    };
  }

  const envKey = PROVIDER_ENV_KEYS[provider];
  const baseUrl = PROVIDER_BASE_URLS[provider];
  if (!envKey || !baseUrl) return null;

  // For github provider, use the smart resolver that handles placeholder values
  const apiKey = provider === "github" ? resolveGithubToken() : process.env[envKey];
  if (!apiKey) return null;

  return {
    baseUrl,
    apiKey,
    model: process.env[`${provider.toUpperCase()}_MODEL`] || PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o-mini",
  };
}

/**
 * Resolve provider config from DB-stored config (tenant settings).
 * Falls back to env vars if DB doesn't have the key.
 */
export function getProviderConfigFromDb(
  provider: string,
  dbProviders: Record<string, ProviderDbConfig> = {}
): AIProviderConfig | null {
  const cfg = dbProviders[provider];

  if (provider === "ollama_local" || provider === "ollama_cloud") {
    const defaultEnvUrl = provider === "ollama_cloud"
      ? (process.env.OLLAMA_CLOUD_URL || process.env.OLLAMA_LOCAL_URL)
      : process.env.OLLAMA_LOCAL_URL;
    const url = cfg?.url || defaultEnvUrl;
    if (!url) return null;
    const defaultModel = provider === "ollama_cloud"
      ? (process.env.OLLAMA_CLOUD_MODEL || "gpt-oss:20b-cloud")
      : (process.env.OLLAMA_LOCAL_MODEL || "llama3.2:3b");
    return {
      baseUrl: url + "/v1",
      apiKey: "ollama",
      model: cfg?.model || defaultModel,
    };
  }

  const envKey = PROVIDER_ENV_KEYS[provider];
  const baseUrl = PROVIDER_BASE_URLS[provider];
  if (!baseUrl) return null;

  const apiKey = cfg?.apiKey || (envKey ? process.env[envKey] : undefined);
  if (!apiKey) return null;

  return {
    baseUrl,
    apiKey,
    model: cfg?.model || process.env[`${provider.toUpperCase()}_MODEL`] || PROVIDER_DEFAULT_MODELS[provider] || "gpt-4o-mini",
  };
}

/**
 * Get the first available provider from a priority list.
 * Uses DB config first, then env vars.
 */
export function resolveProvider(
  primaryProvider: string,
  fallbacks: string[],
  dbProviders: Record<string, ProviderDbConfig> = {}
): AIProviderConfig | null {
  const chain = [primaryProvider, ...fallbacks];
  for (const p of chain) {
    const config = getProviderConfigFromDb(p, dbProviders);
    if (config) return config;
  }
  // Final fallback: env-based providers
  for (const p of ["github", "openai", "groq", "deepseek"]) {
    const config = getProviderConfig(p);
    if (config) return config;
  }
  return null;
}

/** Legacy compat — used by existing agent.ts and routes */
export function getProviderConfigFromSettings(settings: {
  aiProvider?: string;
  githubToken?: string | null;
  githubModel?: string;
  ollamaUrl?: string | null;
  ollamaModel?: string;
  aiProvidersConfig?: Record<string, ProviderDbConfig> | null;
}): AIProviderConfig | null {
  const provider = settings.aiProvider || "github";
  const dbProviders = (settings.aiProvidersConfig as Record<string, ProviderDbConfig>) || {};

  if (provider === "github") {
    // Prefer DB-stored token; fall back to the env resolver (handles placeholders)
    const token = (settings.githubToken && settings.githubToken.trim()) ? settings.githubToken.trim() : resolveGithubToken();
    if (!token) return getProviderConfigFromDb("groq", dbProviders) || getProviderConfigFromDb("deepseek", dbProviders) || null;
    return {
      baseUrl: PROVIDER_BASE_URLS.github,
      apiKey: token,
      model: settings.githubModel || process.env.GITHUB_MODEL || "gpt-4o-mini",
    };
  }
  if (provider === "ollama_local") {
    const url = settings.ollamaUrl || process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return { baseUrl: url + "/v1", apiKey: "ollama", model: settings.ollamaModel || "hermes3:8b" };
  }

  return getProviderConfigFromDb(provider, dbProviders) || getProviderConfig(provider);
}

export function createAIClient(config: AIProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });
}
