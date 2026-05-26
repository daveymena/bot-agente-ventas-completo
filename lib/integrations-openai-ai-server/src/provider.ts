import OpenAI from "openai";

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultHeaders?: Record<string, string>;
}

const ZEN_DIRECT_BASE_URL = "https://opencode.ai/zen/v1";
const ZEN_DEFAULT_FREE_MODEL = "deepseek-v4-flash-free";

function isZenDirectApi(baseUrl: string): boolean {
  return baseUrl.includes("opencode.ai/zen");
}

/** Zen API uses model ids without the opencode/ prefix (e.g. deepseek-v4-flash-free). */
export function normalizeZenModelId(model: string): string {
  return model.startsWith("opencode/") ? model.slice("opencode/".length) : model;
}

function resolveOpenCodeConfig(modelOverride?: string): AIProviderConfig | null {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENCODE_API_URL || ZEN_DIRECT_BASE_URL;
  const rawModel = modelOverride || process.env.OPENCODE_MODEL || ZEN_DEFAULT_FREE_MODEL;
  const model = isZenDirectApi(baseUrl) ? normalizeZenModelId(rawModel) : rawModel;

  return { baseUrl, apiKey, model };
}

export function getProviderConfig(provider: string): AIProviderConfig | null {
  switch (provider) {
    // ─── PROVEEDORES EXISTENTES ───────────────────────────────────────────────
    case "opencode":
      return resolveOpenCodeConfig();
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
      if (!process.env.BRIDGE_LOCAL_URL) return null;
      return {
        baseUrl: process.env.BRIDGE_LOCAL_URL,
        apiKey: process.env.BRIDGE_LOCAL_API_KEY || "no-key",
        model: process.env.BRIDGE_LOCAL_MODEL || "gpt-4o-mini",
      };
    case "github_haiku":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: "claude-haiku-4-5",
      };
    case "openai_default":
      if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
      return {
        baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        model: "gpt-4o",
      };

    // ─── FREE PROVIDERS (cheahjs/free-llm-api-resources) ──────────────────────
    // 🔗 https://github.com/cheahjs/free-llm-api-resources

    // ── Google AI Studio ── 500 req/día · 250k tokens/min
    case "google_ai_studio":
      if (!process.env.GOOGLE_API_KEY) return null;
      return {
        baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GOOGLE_MODEL || "gemini-2.5-flash",
      };

    // ── NVIDIA NIM ── 40 req/min · requiere verificación de teléfono
    case "nvidia_nim":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
      };

    // ── Mistral (La Plateforme) ── 1M tokens/mes · requiere verificación tel
    case "mistral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      };

    // ── Mistral Codestral ── 2,000 req/día · 30 req/min
    case "mistral_codestral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        baseUrl: "https://codestral.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "codestral-latest",
      };

    // ── HuggingFace Inference ── $0.10/mes créditos
    case "huggingface":
      if (!process.env.HUGGINGFACE_API_KEY) return null;
      return {
        baseUrl: `https://api-inference.huggingface.co/v1`,
        apiKey: process.env.HUGGINGFACE_API_KEY,
        model: process.env.HUGGINGFACE_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── Vercel AI Gateway ── $5/mes
    case "vercel_ai":
      if (!process.env.VERCEL_AI_GATEWAY_TOKEN) return null;
      return {
        baseUrl: "https://ai-gateway.vercel.sh/api/v1",
        apiKey: process.env.VERCEL_AI_GATEWAY_TOKEN,
        model: process.env.VERCEL_AI_MODEL || "openai/gpt-4o-mini",
      };

    // ── OpenCode Zen ── free tier
    case "opencode_zen":
      if (!process.env.OPENCODE_ZEN_API_KEY) return null;
      return {
        baseUrl: "https://opencode.ai/zen/v1",
        apiKey: process.env.OPENCODE_ZEN_API_KEY,
        model: process.env.OPENCODE_ZEN_MODEL || "deepseek-v4-flash-free",
      };

    // ── Cerebras ── 1M tokens/día
    case "cerebras":
      if (!process.env.CEREBRAS_API_KEY) return null;
      return {
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY,
        model: process.env.CEREBRAS_MODEL || "llama-3.1-8b-instruct",
      };

    // ── OpenRouter ── Modelos gratis/free · Acceso a múltiples proveedores
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) return null;
      
      // Modelos free funcionales en OpenRouter
      const freeModels = [
        "meta-llama/llama-2-7b-chat",
        "meta-llama/llama-3-8b-instruct",
        "mistralai/mistral-7b-instruct",
        "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
        "openchat/openchat-3.5",
        "gryphe/mythomist-7b",
        "meta-llama/llama-3.1-8b-instruct",
        "meta-llama/llama-3.1-70b-instruct",
        "mistralai/mistral-large",
        "openrouter/auto"
      ];
      
      // Seleccionar modelo: usar el configurado o rotar entre free
      const selectedModel = process.env.OPENROUTER_MODEL || freeModels[Math.floor(Math.random() * freeModels.length)];
      
      return {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        model: selectedModel,
        defaultHeaders: {
          "HTTP-Referer": "https://tecnovariedades.com",
          "X-Title": "TecnoVariedades Sales Bot"
        }
      };

    // ── Cohere ── 1,000 req/mes
    case "cohere":
      if (!process.env.COHERE_API_KEY) return null;
      return {
        baseUrl: "https://api.cohere.ai/v2",
        apiKey: process.env.COHERE_API_KEY,
        model: process.env.COHERE_MODEL || "command-a-03-2025",
      };

    // ── Cloudflare Workers AI ── 10,000 neuronas/día
    case "cloudflare_workers":
      if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) return null;
      return {
        baseUrl: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run`,
        apiKey: process.env.CLOUDFLARE_API_TOKEN,
        model: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        defaultHeaders: { "Accept-Encoding": "gzip, deflate" },
      };

    // ── GitHub Models ── según suscripción Copilot
    case "github_models":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: process.env.GITHUB_MODEL || "meta-llama/llama-3.3-70b-instruct",
      };

    // ─── TRIAL CREDITS ────────────────────────────────────────────────────────

    // ── Fireworks ── $1 crédito
    case "fireworks":
      if (!process.env.FIREWORKS_API_KEY) return null;
      return {
        baseUrl: "https://api.fireworks.ai/inference/v1",
        apiKey: process.env.FIREWORKS_API_KEY,
        model: process.env.FIREWORKS_MODEL || "accounts/fireworks/models/llama-v3p1-70b-instruct",
      };

    // ── Baseten ── $30 crédito
    case "baseten":
      if (!process.env.BASETEN_API_KEY) return null;
      return {
        baseUrl: process.env.BASETEN_BASE_URL || "https://api.baseten.co",
        apiKey: process.env.BASETEN_API_KEY,
        model: process.env.BASETEN_MODEL || "model-qKN1DlpX",
        defaultHeaders: { "X-Agent-Title": "Agent-Sales-Bot" },
      };

    // ── AI21 ── $10 / 3 meses
    case "ai21":
      if (!process.env.AI21_API_KEY) return null;
      return {
        baseUrl: "https://api.ai21.com/studio/v1",
        apiKey: process.env.AI21_API_KEY,
        model: process.env.AI21_MODEL || "jamba-1.5-large",
      };

    // ── Upstage ── $10 / 3 meses
    case "upstage":
      if (!process.env.UPSTAGE_API_KEY) return null;
      return {
        baseUrl: "https://api.upstage.ai/v1/solar",
        apiKey: process.env.UPSTAGE_API_KEY,
        model: process.env.UPSTAGE_MODEL || "solar-pro2",
      };

    // ── Novita ── $0.50 / 1 año
    case "novita":
      if (!process.env.NOVITA_API_KEY) return null;
      return {
        baseUrl: "https://api.novita.ai/v3",
        apiKey: process.env.NOVITA_API_KEY,
        model: process.env.NOVITA_MODEL || "meta-llama/llama-3.1-70b-instruct",
      };

    // ── Nebius ── $1 crédito
    case "nebius":
      if (!process.env.NEBIUS_API_KEY) return null;
      return {
        baseUrl: "https://api.studio.nebius.com/v1",
        apiKey: process.env.NEBIUS_API_KEY,
        model: process.env.NEBIUS_MODEL || "meta-llama/llama-3.3-70b-instruct",
      };

    // ── Alibaba Cloud ── 1M tokens/modelo
    case "alibaba":
      if (!process.env.ALIBABA_API_KEY) return null;
      return {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: process.env.ALIBABA_API_KEY,
        model: process.env.ALIBABA_MODEL || "qwen-plus",
      };

    // ── Hyperbolic ── $1 crédito
    case "hyperbolic":
      if (!process.env.HYPERBOLIC_API_KEY) return null;
      return {
        baseUrl: "https://api.hyperbolic.xyz/v1",
        apiKey: process.env.HYPERBOLIC_API_KEY,
        model: process.env.HYPERBOLIC_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── SambaNova Cloud ── $5 / 3 meses
    case "sambanova":
      if (!process.env.SAMBANOVA_API_KEY) return null;
      return {
        baseUrl: "https://api.sambanova.ai/v1",
        apiKey: process.env.SAMBANOVA_API_KEY,
        model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
      };

    // ── NLP Cloud ── $15 crédito
    case "nlp_cloud":
      if (!process.env.NLP_CLOUD_API_KEY) return null;
      return {
        baseUrl: "https://api.nlpcloud.io/v1/gpu/",
        apiKey: process.env.NLP_CLOUD_API_KEY,
        model: process.env.NLP_CLOUD_MODEL || "meta-llama-3.1-70b-instruct",
      };

    // ── Modal ── $5/mes (+$30 con método de pago)
    case "modal":
      if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) return null;
      const modalKey = `${process.env.MODAL_TOKEN_ID}:${process.env.MODAL_TOKEN_SECRET}`;
      return {
        baseUrl: process.env.MODAL_BASE_URL || "https://api.modal.com/v1",
        apiKey: modalKey,
        model: process.env.MODAL_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── Inference.net ── $1 (+$25 por encuesta)
    case "inference_net":
      if (!process.env.INFERENCE_NET_API_KEY) return null;
      return {
        baseUrl: "https://api.inference.net/v1",
        apiKey: process.env.INFERENCE_NET_API_KEY,
        model: process.env.INFERENCE_NET_MODEL || "llama-3.3-70b-instruct",
      };

    // ── Scaleway Generative APIs ── 1M tokens gratis
    case "scaleway":
      if (!process.env.SCALEWAY_API_KEY) return null;
      return {
        baseUrl: "https://api.scaleway.com/generative-api/v1",
        apiKey: process.env.SCALEWAY_API_KEY,
        model: process.env.SCALEWAY_MODEL || "llama-3.3-70b-instruct",
      };

    // ─── ADDITIONAL FREE PROVIDERS ────────────────────────────────────────────

    // ── DeepSeek (open source) ──
    case "deepseek":
      if (!process.env.DEEPSEEK_API_KEY) return null;
      return {
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      };

    // ── Together AI ── $5 gratis al registro
    case "together":
      if (!process.env.TOGETHER_API_KEY) return null;
      return {
        baseUrl: "https://api.together.xyz/v1",
        apiKey: process.env.TOGETHER_API_KEY,
        model: process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      };

    // ── Perplexity ── $5 gratis al registro
    case "perplexity":
      if (!process.env.PERPLEXITY_API_KEY) return null;
      return {
        baseUrl: "https://api.perplexity.ai",
        apiKey: process.env.PERPLEXITY_API_KEY,
        model: process.env.PERPLEXITY_MODEL || "sonar-pro",
      };

    // ── OpenPipe ── free tier
    case "openpipe":
      if (!process.env.OPENPIPE_API_KEY) return null;
      return {
        baseUrl: "https://api.openpipe.ai/v1",
        apiKey: process.env.OPENPIPE_API_KEY,
        model: process.env.OPENPIPE_MODEL || "openai/gpt-4o-mini",
      };

    // ── G4F (gpt4free) ── 111+ proveedores gratuitos, manejado internamente
    case "g4f":
      return { baseUrl: "__g4f__", apiKey: "__g4f__", model: "__g4f__" };

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
    return resolveOpenCodeConfig(settings.githubModel || undefined);
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

  if (provider === "openai_default") {
    if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
    return {
      baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      model: settings.githubModel || "gpt-4o",
    };
  }

  // Fallback: intentar con getProviderConfig (soporta 30+ proveedores via env vars)
  const genericConfig = getProviderConfig(provider);
  if (genericConfig) return genericConfig;

  // Proveedor no soportado
  return null;
}

export function createAIClient(config: AIProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
    dangerouslyAllowBrowser: true,
    timeout: 60000, // 60s timeout para prompts con historial extenso
    maxRetries: 1,
  });
}
