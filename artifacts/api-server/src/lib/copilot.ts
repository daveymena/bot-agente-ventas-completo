import { createHash } from "crypto";
import { logger } from "./logger";

interface CopilotSession {
  token: string;
  expiresAt: number;
  refreshIn: number;
}

const EXCHANGE_URL = "https://api.github.com/copilot_internal/v2/token";
const cache = new Map<string, { token: string; expiresAt: number }>();
const REFRESH_MARGIN_S = 120;

// Client ID público de GitHub Copilot (usado por editores/OSS para el device flow).
// Se puede sobreescribir por env si se dispone de uno propio.
const GITHUB_CLIENT_ID = process.env.GITHUB_COPILOT_CLIENT_ID || "Iv1.b507a08c87ecfe98";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

/**
 * Paso 1 del device flow: pide a GitHub un código de dispositivo.
 * El usuario abre `verification_uri` e introduce `user_code` para autorizar.
 */
export async function getCopilotDeviceCode(): Promise<DeviceCodeResponse | null> {
  try {
    const resp = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "VentasPro/1.0",
      },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: "read:user" }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, "[Copilot] Device code request failed");
      return null;
    }
    const data = (await resp.json()) as any;
    if (!data.device_code || !data.user_code) return null;
    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri || "https://github.com/login/device",
      interval: data.interval || 5,
      expires_in: data.expires_in || 900,
    };
  } catch (err) {
    logger.warn({ err }, "[Copilot] Device code error");
    return null;
  }
}

/**
 * Paso 2 del device flow: intercambia el device_code por un token OAuth (gho_...).
 * Devuelve { status } para que el frontend haga polling:
 *  - "authorized": incluye accessToken
 *  - "pending":    el usuario aún no autoriza (seguir haciendo polling)
 *  - "error":      código expirado / denegado
 */
export async function pollCopilotToken(
  deviceCode: string
): Promise<{
  status: "authorized" | "pending" | "error";
  accessToken?: string;
  error?: string;
  /** Segundos que GitHub exige esperar antes de volver a preguntar. */
  intervalS?: number;
}> {
  try {
    const resp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "VentasPro/1.0",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await resp.json()) as any;
    if (data.access_token) {
      return { status: "authorized", accessToken: data.access_token };
    }
    if (data.error === "authorization_pending") {
      return { status: "pending" };
    }
    // `slow_down` NO es lo mismo que `authorization_pending`, y tratarlos
    // igual es lo que dejaba la pantalla girando para siempre.
    //
    // GitHub responde `slow_down` cuando se pregunta más seguido que su
    // `interval`, y con cada uno SUBE el intervalo que exige. Medido contra
    // github.com el 2026-09-05 con un código real: pregunta 1 ->
    // authorization_pending; pregunta 2 -> slow_down con interval 10;
    // pregunta 3 -> slow_down con interval 15.
    //
    // Acá se devolvía "pending" descartando ese `interval`, y el panel seguía
    // preguntando cada 5 s fijos. Una vez que se entra en `slow_down` nunca se
    // sale: cada respuesta vuelve a ser `slow_down`, o sea "pending", así que
    // "Sincronizando con GitHub..." no terminaba NUNCA -- ni siquiera después
    // de que el admin autorizara de verdad en github.com/login/device.
    if (data.error === "slow_down") {
      const intervalS = Number(data.interval);
      return { status: "pending", intervalS: Number.isFinite(intervalS) && intervalS > 0 ? intervalS : undefined };
    }
    return { status: "error", error: data.error || "unknown_error" };
  } catch (err: any) {
    logger.warn({ err }, "[Copilot] Poll token error");
    return { status: "error", error: err?.message || "network_error" };
  }
}

function fingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export async function getCopilotSessionToken(rawToken: string): Promise<CopilotSession | null> {
  if (!rawToken || rawToken.length < 10) return null;

  const fp = fingerprint(rawToken);
  const cached = cache.get(fp);
  if (cached) {
    const remaining = cached.expiresAt - Math.floor(Date.now() / 1000);
    if (remaining > REFRESH_MARGIN_S) {
      return { token: cached.token, expiresAt: cached.expiresAt, refreshIn: remaining };
    }
  }

  try {
    const resp = await fetch(EXCHANGE_URL, {
      method: "GET",
      headers: {
        Authorization: `token ${rawToken}`,
        Accept: "application/json",
        "User-Agent": "VentasPro/1.0",
        "Editor-Version": "vscode/1.104.1",
        "Copilot-Integration-Id": "vscode-chat",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status }, "[Copilot] Exchange failed");
      return null;
    }

    const data = await resp.json() as { token?: string; expires_at?: number };
    if (!data.token) return null;

    const expiresAt = data.expires_at || Math.floor(Date.now() / 1000) + 1800;
    cache.set(fp, { token: data.token, expiresAt });

    logger.info("[Copilot] Token exchanged successfully");
    return { token: data.token, expiresAt, refreshIn: expiresAt - Math.floor(Date.now() / 1000) };
  } catch (err) {
    logger.warn({ err }, "[Copilot] Exchange error, using raw token");
    return { token: rawToken, expiresAt: 0, refreshIn: 0 };
  }
}
