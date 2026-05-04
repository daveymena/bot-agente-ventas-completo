import { logger } from "./logger";

export interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
}

/**
 * Verifica un GitHub PAT haciendo una llamada real a GitHub Models.
 * Si funciona, devuelve el token como "sesión válida".
 */
export async function getCopilotSessionToken(githubPat: string): Promise<CopilotTokenResponse | null> {
  try {
    logger.info("[Copilot] Verificando token con GitHub Models...");

    // Hacer un request directo a la API de GitHub Models para verificar el token
    const response = await fetch("https://models.inference.ai.azure.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${githubPat}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Responde solo: OK" }],
        max_tokens: 5,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.choices?.[0]?.message?.content) {
        logger.info("[Copilot] ✅ Token verificado correctamente con GitHub Models!");
        return {
          token: githubPat,
          expires_at: Date.now() + 86400 * 1000,
          refresh_in: 86400,
        };
      }
    }

    const errorText = await response.text().catch(() => "unknown");
    logger.error({ status: response.status, body: errorText }, "[Copilot] Token inválido o sin acceso");
    return null;
  } catch (error: any) {
    logger.error({ err: error.message }, "[Copilot] Error de red al verificar token");
    return null;
  }
}