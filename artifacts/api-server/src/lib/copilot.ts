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
