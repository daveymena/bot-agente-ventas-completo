/**
 * GOOGLE OAuth 2.0 / OpenID Connect — login "Continuar con Google".
 *
 * Flujo elegido: AUTHORIZATION CODE (server-side). El navegador va a Google,
 * Google devuelve un `code` al redirect_uri, y SOLO el backend lo cambia por
 * tokens usando el client secret. El id_token se verifica con la librería
 * oficial de Google (firma, `iss`, `aud` y `exp`), nunca se confía en un email
 * que mande el frontend.
 *
 * El client secret vive únicamente acá, en el backend, vía variables de
 * entorno (GOOGLE_CLIENT_SECRET). Nunca en el frontend.
 */
import { OAuth2Client } from "google-auth-library";
import { logger } from "./logger";

export interface GoogleProfile {
  /** `sub` de Google — identificador primario de la cuenta vinculada. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  configured: boolean;
}

let clientCache: OAuth2Client | null = null;

export function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = String(process.env.GOOGLE_REDIRECT_URI || "").trim();
  return {
    clientId,
    clientSecret,
    redirectUri,
    configured: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function googleOAuthClient(): OAuth2Client | null {
  const c = googleOAuthConfig();
  if (!c.configured) return null;
  if (!clientCache) {
    clientCache = new OAuth2Client(c.clientId, c.clientSecret, c.redirectUri);
  }
  return clientCache;
}

/** URL de consentimiento de Google a la que se redirige al usuario. */
export function googleAuthUrl(state: string): string | null {
  const client = googleOAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    include_granted_scopes: true,
    state,
  });
}

/**
 * Intercambia el `code` por tokens y verifica el id_token. Devuelve el perfil
 * limpio (sub/email/email_verified/name/picture) o un código de error para el
 * manejo de fallos del callback.
 */
export async function exchangeCodeForProfile(
  code: string,
): Promise<{ profile: GoogleProfile | null; error?: string }> {
  const client = googleOAuthClient();
  if (!client) return { profile: null, error: "not_configured" };
  const c = googleOAuthConfig();
  try {
    const { tokens } = await client.getToken({ code });
    const idToken = tokens.id_token;
    if (!idToken) return { profile: null, error: "no_id_token" };

    const ticket = await client.verifyIdToken({ idToken, audience: c.clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) return { profile: null, error: "invalid_token" };
    if (!payload.email || payload.email_verified !== true) {
      return { profile: null, error: "email_not_verified" };
    }

    return {
      profile: {
        sub: payload.sub,
        email: payload.email,
        emailVerified: true,
        name: payload.name,
        picture: payload.picture,
      },
    };
  } catch (e: any) {
    logger.warn({ err: e?.message }, "[GoogleAuth] falló el intercambio/verificación del código");
    return { profile: null, error: "oauth_failed" };
  }
}
