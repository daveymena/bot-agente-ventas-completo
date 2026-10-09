/**
 * Reglas ÚNICAS para mostrar y recibir secretos (contraseñas, tokens, claves).
 *
 * Pedido del dueño (07-10-2026): "cualquier contraseña que se vea en la app,
 * en las API de Facebook o de cualquier parte, que solo se vean asteriscos
 * tanto al ingresar como ingresadas".
 *
 * Tres reglas, y todas las rutas usan estas funciones en vez de repetirlas:
 *
 *  1. Un secreto guardado NUNCA vuelve completo al navegador: solo
 *     `{ tiene, ultimos4 }` o la máscara "••••abcd".
 *  2. Lo que llega del navegador vacío o con forma de máscara NO toca lo
 *     guardado. Bug típico: el formulario reenvía "••••abcd" al guardar otro
 *     campo y la máscara pisa la clave real (cifrada, encima: se pierde sin
 *     ningún error a la vista).
 *  3. Nada de esto se imprime en un log: `redactarSecretos` limpia un texto.
 */

/** Caracteres que solo aparecen en una máscara, nunca en una clave real. */
const CARACTERES_DE_MASCARA = /[•●…]|\*{3,}|\.{3}/;

/** Máscaras literales que el servidor devolvió alguna vez. */
const MASCARAS_CONOCIDAS = new Set(["***CONFIGURED***", "configurado", "guardado", "guardada"]);

/** ¿Este valor es una máscara (o un placeholder) en vez de un secreto nuevo? */
export function esValorEnmascarado(valor: unknown): boolean {
  if (typeof valor !== "string") return false;
  const v = valor.trim();
  if (!v) return false;
  if (MASCARAS_CONOCIDAS.has(v.toLowerCase()) || MASCARAS_CONOCIDAS.has(v)) return true;
  return CARACTERES_DE_MASCARA.test(v);
}

/**
 * El secreto NUEVO que mandó el navegador, o null si no hay que tocar lo
 * guardado (no vino, vino vacío o vino la máscara).
 */
export function secretoNuevo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v || esValorEnmascarado(v)) return null;
  return v;
}

/** Los últimos 4 caracteres, o "" si el secreto es tan corto que serían todo. */
export function ultimos4(valor: string | null | undefined): string {
  const v = String(valor || "");
  return v.length > 8 ? v.slice(-4) : "";
}

/** "••••abcd" (o "••••" si es corto); "" si no hay secreto. */
export function enmascararSecreto(valor: string | null | undefined): string {
  const v = String(valor || "");
  if (!v) return "";
  const fin = ultimos4(v);
  return fin ? `••••${fin}` : "••••";
}

/** Lo único que el navegador sabe de un secreto guardado. */
export function resumenSecreto(valor: string | null | undefined): { tiene: boolean; ultimos4: string } {
  return { tiene: !!valor, ultimos4: ultimos4(valor) };
}

/**
 * Limpia secretos de un texto antes de loguearlo o devolverlo en un mensaje
 * de error. No pretende ser perfecto: tapa las formas que este sistema maneja
 * de verdad (URLs con usuario:clave, Bearer, access_token en query, claves de
 * OpenAI/Groq/GitHub/Shopify/Meta, JWT).
 */
export function redactarSecretos(texto: unknown): string {
  let s = typeof texto === "string" ? texto : (() => { try { return JSON.stringify(texto); } catch { return String(texto); } })();
  if (!s) return s;
  return s
    // postgres://usuario:clave@host  ->  postgres://usuario:***@host
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^:\/\s@]+:)[^@\s\/]+@/gi, "$1***@")
    .replace(/(authorization["']?\s*[:=]\s*["']?(?:bearer|basic)\s+)[^\s"',}]+/gi, "$1***")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+\/=-]{12,}/gi, "$1 ***")
    .replace(/([?&](?:access_token|token|key|api_key|apikey|client_secret|password)=)[^&\s"']+/gi, "$1***")
    .replace(/\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]{8,}/g, "$1***")
    .replace(/\b(gsk_|ghp_|gho_|ghu_|ghs_|github_pat_|shpat_|shpss_|xox[bp]-|EAA)[A-Za-z0-9_-]{10,}/g, "$1***")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "eyJ***")
    .replace(/\b\d{8,10}:[A-Za-z0-9_-]{30,}/g, "***telegram***");
}

/** Claves de un objeto que siempre son secretos, en cualquier nivel. */
const CLAVES_SECRETAS = /^(password|passwordHash|pass|smtpPassword|secret|secreto|clientSecret|consumerKey|consumerSecret|appSecret|apiKey|api_key|token|accessToken|userAccessToken|pageAccessToken|messengerPageToken|messengerVerifyToken|webhookVerifyToken|webhookSecret|refresh|refreshToken|botToken|githubToken|copilotSessionToken|nvidiaApiKey|twoFactorSecret|passwordResetCode|emailVerificationCode|activationToken)$/i;

/**
 * Copia profunda de un objeto con cada secreto reemplazado por su máscara.
 * Sirve para devolver estructuras armadas en el servidor (tenant, config) sin
 * tener que acordarse campo por campo.
 */
export function sinSecretos<T>(obj: T, profundidad = 0): T {
  if (profundidad > 8 || obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map((x) => sinSecretos(x, profundidad + 1)) as any;
  if (typeof obj !== "object" || obj instanceof Date) return obj;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj as any)) {
    if (CLAVES_SECRETAS.test(k) && (typeof v === "string" || typeof v === "number")) {
      out[k] = enmascararSecreto(String(v));
    } else if (/^(copilotTokens|apiKeys)$/i.test(k) && v && typeof v === "object") {
      out[k] = Array.isArray(v)
        ? v.map((x: any) => ({ cuenta: x?.cuenta, token: enmascararSecreto(x?.token) }))
        : Object.fromEntries(Object.entries(v).map(([p, d]: [string, any]) => [p, typeof d === "string" ? enmascararSecreto(d) : sinSecretos(d, profundidad + 1)]));
    } else {
      out[k] = sinSecretos(v, profundidad + 1);
    }
  }
  return out as T;
}
