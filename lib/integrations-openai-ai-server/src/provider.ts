import OpenAI from "openai";

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getProviderConfig(provider: string): AIProviderConfig | null {
  switch (provider) {
    case "github":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: process.env.GITHUB_MODEL || "gpt-4o-mini",
      };
    case "nvidia":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
      };
    case "github_claude":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: process.env.GITHUB_MODEL_CLAUDE || "Claude-3.5-Sonnet",
      };
    case "ollama_local":
      if (!process.env.OLLAMA_LOCAL_URL) return null;
      return {
        baseUrl: process.env.OLLAMA_LOCAL_URL + "/v1",
        apiKey: "ollama",
        model: process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
      };
    case "opencode":
      if (!process.env.OPENCODE_API_URL || !process.env.OPENCODE_API_KEY) return null;
      return {
        baseUrl: process.env.OPENCODE_API_URL,
        apiKey: process.env.OPENCODE_API_KEY,
        model: process.env.OPENCODE_MODEL || "opencode/deepseek-v4-flash-free",
      };
    case "g4f":
      if (!process.env.G4F_ENABLED) return null;
      return {
        baseUrl: (process.env.G4F_BASE_URL || "http://localhost:1337") + "/v1",
        apiKey: "g4f",
        model: process.env.G4F_MODEL || "gpt-4-turbo",
      };
    case "openai_default":
      if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
      return {
        baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        model: "gpt-4o",
      };
    default:
      return null;
  }
}

export function getProviderConfigFromSettings(settings: {
  aiProvider?: string;
  githubToken?: string | null;
  githubModel?: string;
  ollamaUrl?: string | null;
  ollamaModel?: string;
}): AIProviderConfig | null {
  const provider = settings.aiProvider || "github";

  if (provider === "github" || provider === "github_claude") {
    const token = settings.githubToken || process.env.GITHUB_TOKEN;
    if (!token) return null;
    return {
      baseUrl: "https://models.inference.ai.azure.com",
      apiKey: token,
      model: settings.githubModel || process.env.GITHUB_MODEL || "gpt-4o-mini",
    };
  }

  if (provider === "nvidia") {
    const token = process.env.NVIDIA_API_KEY;
    if (!token) return null;
    return {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: token,
      model: process.env.NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
    };
  }

  if (provider === "ollama_local") {
    const url = settings.ollamaUrl || process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return {
      baseUrl: url + "/v1",
      apiKey: "ollama",
      model: settings.ollamaModel || process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
    };
  }

  if (provider === "opencode") {
    if (!process.env.OPENCODE_API_URL || !process.env.OPENCODE_API_KEY) return null;
    return {
      baseUrl: process.env.OPENCODE_API_URL,
      apiKey: process.env.OPENCODE_API_KEY,
      model: process.env.OPENCODE_MODEL || "opencode/deepseek-v4-flash-free",
    };
  }

  if (provider === "g4f") {
    if (!process.env.G4F_ENABLED) return null;
    return {
      baseUrl: (process.env.G4F_BASE_URL || "http://localhost:1337") + "/v1",
      apiKey: "g4f",
      model: process.env.G4F_MODEL || "gpt-4-turbo",
    };
  }

  return getProviderConfig("openai_default");
}

export function createAIClient(config: AIProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });
}
