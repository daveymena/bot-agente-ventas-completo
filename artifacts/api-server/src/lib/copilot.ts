// @ts-nocheck
import { logger } from "./logger";

export interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
}

// VS Code Client ID for unlimited internal copilot API access
const COPILOT_OAUTH_CLIENT_ID = "Iv1.b507a08c87ecfe98";

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
    logger.info({ data, deviceCode: deviceCode.substring(0, 10) + "..." }, "[Copilot] Respuesta de polling de token");
    
    if (data.access_token) {
      return data.access_token;
    }
    
    if (data.error === "authorization_pending") {
      return "pending";
    }

    if (data.error === "slow_down") {
      return "pending"; // GitHub asks to poll less frequently, but we treat it as pending
    }

    if (data.error) {
      logger.warn({ error: data.error, description: data.error_description }, "[Copilot] Error en polling de token");
      throw new Error(data.error_description || data.error);
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Verifica un GitHub PAT y obtiene el token de sesión interno de Copilot (v2)
 */
export async function getCopilotSessionToken(githubPat: string): Promise<CopilotTokenResponse | null> {
  try {
    logger.info("[Copilot] Obteniendo token de sesión interno de Copilot...");

    const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
      method: "GET",
      headers: {
        "Authorization": `token ${githubPat}`,
        "Accept": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        logger.info("[Copilot] ✅ Token interno de Copilot obtenido correctamente!");
        return {
          token: data.token, // This is the actual token that needs to be used for the AI calls
          expires_at: data.expires_at ? data.expires_at * 1000 : Date.now() + 1800 * 1000,
          refresh_in: 1800,
        };
      }
    }

    const errorText = await response.text().catch(() => "unknown");
    logger.error({ status: response.status, body: errorText }, "[Copilot] Error al obtener el token interno de Copilot");
    return null;
  } catch (error: any) {
    logger.error({ err: error.message }, "[Copilot] Error de red al obtener token");
    return null;
  }
}