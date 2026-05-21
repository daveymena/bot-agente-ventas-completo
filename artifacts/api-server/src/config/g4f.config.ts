/**
 * Configuration for G4F Provider
 * Loads environment variables for g4f integration
 */

export const G4F_ENABLED = process.env.G4F_ENABLED === "true";
export const G4F_PROVIDER = process.env.G4F_PROVIDER || "auto";
export const G4F_MODEL = process.env.G4F_MODEL || "gpt-4-turbo";
export const G4F_TIMEOUT = parseInt(process.env.G4F_TIMEOUT || "30", 10);

// Fallback AI Configuration
export const AI_FALLBACK_ENABLED = process.env.AI_FALLBACK_ENABLED === "true";
export const AI_FALLBACK_ORDER = (process.env.AI_FALLBACK_ORDER || "opencode,github,g4f").split(
  ","
) as Array<"opencode" | "github_copilot_internal" | "ollama_local" | "nvidia" | "github" | "g4f">;

// Validate configuration
if (G4F_ENABLED) {
  console.log(
    `[G4F Config] Enabled: true, Provider: ${G4F_PROVIDER}, Model: ${G4F_MODEL}, Timeout: ${G4F_TIMEOUT}s`
  );
} else {
  console.log("[G4F Config] Disabled - will not be used as fallback");
}

console.log(`[AI Fallback] Order: ${AI_FALLBACK_ORDER.join(" → ")}`);
