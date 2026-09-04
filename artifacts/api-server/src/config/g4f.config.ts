/**
 * Configuration for G4F Provider
 * Loads environment variables for g4f integration
 */

export const G4F_ENABLED = process.env.G4F_ENABLED === "true";
export const G4F_PROVIDER = process.env.G4F_PROVIDER || "auto";
export const G4F_MODEL = process.env.G4F_MODEL || "gpt-4-turbo";
export const G4F_TIMEOUT = parseInt(process.env.G4F_TIMEOUT || "8", 10);

// Fallback AI Configuration
export const AI_FALLBACK_ENABLED = process.env.AI_FALLBACK_ENABLED === "true";
/**
 * El orden por defecto SOLO trae lo que responde de verdad.
 *
 * Antes era "nvidia_nim_bridge,opencode,nvidia,github": tres de esos cuatro
 * están apagados, y Groq --el único que contesta-- ni siquiera figuraba.
 * Probados uno por uno contra producción el 2026-08-28:
 *
 *   groq        OK, openai/gpt-oss-120b en 442 ms
 *   opencode    parcial: nemotron-3-ultra-free OK, big-pickle 429
 *   nvidia      410, modelo retirado
 *   github      connection error (GitHub Models se está retirando)
 *   openrouter  429, cuota agotada y sin crédito
 *   deepseek    402 · mistral 402 · mimo 402 · anthropic 401 clave inválida
 *   opencode_go la cuenta se dio de baja
 *
 * Por qué importa el ORDEN y no alcanza con la memoria de fallos: la rotación
 * ya aparta al que falla (optimized-rotation.ts: 402 → 6 h, 429 → 1 h), pero
 * esa memoria vive en el proceso. En cada reinicio vuelve a descubrir desde
 * cero que todo está muerto, y ese descubrimiento es lo que se comía el turno
 * --105 s medidos-- antes de llegar a alguien que conteste.
 */
export const AI_FALLBACK_ORDER = (process.env.AI_FALLBACK_ORDER || "groq,opencode").split(
  ","
) as Array<"opencode" | "nvidia" | "github" | "nvidia_nim_bridge" | "groq">;

if (G4F_ENABLED) {
  console.log(`[G4F Config] Enabled: true, Provider: ${G4F_PROVIDER}, Model: ${G4F_MODEL}, Timeout: ${G4F_TIMEOUT}s`);
} else {
  console.log("[G4F Config] Deshabilitado");
}

console.log(`[AI Fallback] Order: ${AI_FALLBACK_ORDER.join(" → ")}`);
