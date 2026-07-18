import { logger } from "./logger";

interface CopilotCacheEntry {
  apiToken: string;
  expiresAt: number;
}

const cache = new Map<string, CopilotCacheEntry>();
const REFRESH_MARGIN_MS = 120_000;
const EXCHANGE_URL = "https://api.github.com/copilot_internal/v2/token";

const COPILOT_HEADERS = {
  "Editor-Version": "vscode/1.104.1",
  "User-Agent": "VentasPro/1.0",
  "Copilot-Integration-Id": "vscode-chat",
  "Openai-Intent": "conversation-edits",
};

function fingerprint(token: string): string {
  const { createHash } = require("crypto");
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

async function exchangeCopilotToken(rawToken: string): Promise<{ apiToken: string; expiresAt: number }> {
  const fp = fingerprint(rawToken);
  const cached = cache.get(fp);
  if (cached) {
    const remaining = cached.expiresAt - Date.now();
    if (remaining > REFRESH_MARGIN_MS) {
      logger.debug("[CopilotAuth] Using cached token");
      return cached;
    }
  }

  const resp = await fetch(EXCHANGE_URL, {
    method: "GET",
    headers: {
      Authorization: `token ${rawToken}`,
      Accept: "application/json",
      ...COPILOT_HEADERS,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Copilot token exchange failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as { token: string; expires_at?: number };
  if (!data.token) throw new Error("Copilot token exchange returned empty token");

  const expiresAt = data.expires_at ? data.expires_at * 1000 : Date.now() + 1800_000;
  cache.set(fp, { apiToken: data.token, expiresAt });

  logger.debug("[CopilotAuth] Token exchanged successfully");
  return { apiToken: data.token, expiresAt };
}

async function getCopilotApiToken(rawToken: string): Promise<string> {
  if (!rawToken) return rawToken;
  try {
    const { apiToken } = await exchangeCopilotToken(rawToken);
    return apiToken;
  } catch (err) {
    logger.warn({ err }, "[CopilotAuth] Exchange failed, using raw token");
    return rawToken;
  }
}

function resolveCopilotToken(): string {
  const envVars = ["GITHUB_COPILOT_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"];
  for (const envVar of envVars) {
    const val = process.env[envVar]?.trim();
    if (val && val.length > 10 && !val.includes("your_") && !val.includes("tu-")) {
      return val;
    }
  }
  return "";
}

function copilotRequestHeaders(isAgentTurn = true, isVision = false): Record<string, string> {
  return {
    "Editor-Version": "vscode/1.104.1",
    "User-Agent": "VentasPro/1.0",
    "Copilot-Integration-Id": "vscode-chat",
    "Openai-Intent": "conversation-edits",
    "x-initiator": isAgentTurn ? "agent" : "user",
    ...(isVision ? { "Copilot-Vision-Request": "true" } : {}),
  };
}

async function ensureCopilotToken(): Promise<string | null> {
  const rawToken = resolveCopilotToken();
  if (!rawToken) {
    logger.warn("[CopilotAuth] No GitHub token found in env");
    return null;
  }
  return getCopilotApiToken(rawToken);
}

export {
  exchangeCopilotToken,
  getCopilotApiToken,
  resolveCopilotToken,
  copilotRequestHeaders,
  ensureCopilotToken,
};
