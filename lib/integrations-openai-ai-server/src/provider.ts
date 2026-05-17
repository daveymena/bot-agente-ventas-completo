import OpenAI from "openai";

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultHeaders?: Record<string, string>;
}

export function getProviderConfig(provider: string): AIProviderConfig | null {
  switch (provider) {
    case "opencode":
      return {
        baseUrl: process.env.OPENCODE_API_URL || "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1",
        apiKey: process.env.OPENCODE_API_KEY || "dummy",
        model: process.env.OPENCODE_MODEL || "opencode/deepseek-v4-flash-free",
      };
    case "github_copilot_internal":
      const copilotToken = process.env.GITHUB_COPILOT_TOKEN || process.env.GITHUB_TOKEN;
      if (!copilotToken) return null;
      return {
        baseUrl: "https://api.githubcopilot.com",
        apiKey: copilotToken,
        model: process.env.GITHUB_MODEL || "gpt-4o",
        defaultHeaders: {
          "Editor-Version": "vscode/1.96.0",
          "Editor-Plugin-Version": "copilot/1.250.0",
          "Openai-Organization": "github-copilot",
          "Copilot-Integration-Id": "vscode-chat",
        }
      };
    case "github":
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: ghToken,
        model: process.env.GITHUB_MODEL || "gpt-4o-mini",
      };
    case "nvidia":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
      };
    case "nvidia_fast":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL_FAST || "meta/llama-3.1-8b-instruct",
      };
    case "github_claude":
      const ghcToken = process.env.GITHUB_TOKEN;
      if (!ghcToken) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: ghcToken,
        model: process.env.GITHUB_MODEL_CLAUDE || "Claude-3.5-Sonnet",
      };
    case "ollama_local":
      if (!process.env.OLLAMA_LOCAL_URL) return null;
      return {
        baseUrl: process.env.OLLAMA_LOCAL_URL + (process.env.OLLAMA_LOCAL_URL.endsWith("/v1") ? "" : "/v1"),
        apiKey: "ollama",
        model: process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
      };
    case "bridge_local":
      // Puente local (LMArenaBridge / G4F) corriendo en localhost
      if (!process.env.BRIDGE_LOCAL_URL) return null;
      return {
        baseUrl: process.env.BRIDGE_LOCAL_URL,
        apiKey: process.env.BRIDGE_LOCAL_API_KEY || "no-key",
        model: process.env.BRIDGE_LOCAL_MODEL || "gpt-4o-mini",
      };
    case "github_haiku":
      // Claude Haiku 4.5 via GitHub Models — GRATUITO y desbloqueado
      const ghHaikuToken = process.env.GITHUB_TOKEN;
      if (!ghHaikuToken) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: ghHaikuToken,
        model: "claude-haiku-4-5",
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
  nvidiaApiKey?: string | null;
  nvidiaModel?: string;
  ollamaUrl?: string | null;
  ollamaModel?: string;
}): AIProviderConfig | null {
  // Si no hay proveedor configurado en DB, retornar null para que el caller use su propio fallback
  const provider = settings.aiProvider;
  if (!provider) return null;

  if (provider === "opencode") {
    return {
      baseUrl: process.env.OPENCODE_API_URL || "https://tecnovariedades-provedor-ia.er7iaf.easypanel.host/v1",
      apiKey: process.env.OPENCODE_API_KEY || "dummy",
      model: settings.githubModel || process.env.OPENCODE_MODEL || "opencode/deepseek-v4-flash-free",
    };
  }

  if (provider === "github_copilot_internal") {
    const token = settings.githubToken || process.env.GITHUB_COPILOT_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return null;
    return {
      baseUrl: "https://api.githubcopilot.com",
      apiKey: token,
      model: settings.githubModel || process.env.GITHUB_MODEL || "gpt-4o",
      defaultHeaders: {
        "Editor-Version": "vscode/1.96.0",
        "Editor-Plugin-Version": "copilot/1.250.0",
        "Openai-Organization": "github-copilot",
        "Copilot-Integration-Id": "vscode-chat",
      }
    };
  }

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
    const token = settings.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    if (!token) return null;
    return {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: token,
      model: settings.nvidiaModel || process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
    };
  }

  if (provider === "ollama_local") {
    const url = settings.ollamaUrl || process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return {
      baseUrl: url + (url.endsWith("/v1") ? "" : "/v1"),
      apiKey: "ollama",
      model: settings.ollamaModel || process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
    };
  }

  // Proveedor desconocido o no soportado
  return null;
}

export function createAIClient(config: AIProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    dangerouslyAllowBrowser: true,
    timeout: 60000, // 60 segundos de timeout para evitar que se quede pegado
    maxRetries: 1,
  });
}
