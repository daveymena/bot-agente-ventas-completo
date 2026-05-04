// @ts-nocheck
import { logger } from "./logger";

export interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
}

const COPILOT_OAUTH_CLIENT_ID = "Ov23li8tweQw6odWQebz";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

/**
 * Inicia el flujo de código de dispositivo con GitHub
 */
export async function getCopilotDeviceCode(): Promise<DeviceCodeResponse | null> {
  try {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: COPILOT_OAUTH_CLIENT_ID,
        scope: "read:user",
      }).toString(),
    });

    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    logger.error({ err: error.message }, "[Copilot] Error initiating device code flow");
    return null;
  }
}

/**
 * Polls GitHub for the access token using the device code
 */
export async function pollCopilotToken(deviceCode: string): Promise<string | null> {
  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: COPILOT_OAUTH_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }).toString(),
    });

    const data = await response.json();
    
    if (data.access_token) {
      return data.access_token;
    }
    
    if (data.error === "authorization_pending") {
      return "pending";
    }

    return null;
  } catch (error) {
    return null;
  }
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