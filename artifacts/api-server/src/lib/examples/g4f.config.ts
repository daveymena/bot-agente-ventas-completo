export const AI_FALLBACK_ORDER = [
  "opencode",
  "github_copilot_internal",
  "ollama_local",
  "nvidia",
  "github",
  "g4f"
] as const;

export const AI_FALLBACK_ENABLED = true;

export type AIProvider = typeof AI_FALLBACK_ORDER[number];