/**
 * Sincroniza las API keys que el admin guarda en Configuración → "Modelos de
 * pago" (businessConfig.aiProviders, ver ai-catalog.ts) hacia el proveedor de
 * autenticación de OpenCode (contenedor `operato`), vía `PUT /auth/{id}`
 * (`{type:"api", key}` -- endpoint real, confirmado en el SDK vendorizado de
 * OpenCode). Así el cerebro nuevo de Atlas (operator-opencode.ts) puede pedir
 * `model:{providerID, modelID}` usando el MISMO proveedor que el admin ya
 * configuró acá, en vez de quedar pegado a un único modelo gratis fijo.
 *
 * Pedido explícito del usuario (sesión 2026-08-11): "las api que se ingresen
 * deberían quedar en opencode para el uso de sus modelos por rotación".
 *
 * Best-effort a propósito: si operato no está configurado/alcanzable, o un
 * proveedor puntual no existe en el catálogo de OpenCode, se loguea y se
 * sigue -- nunca debe romper el guardado real de la clave en esta app (que
 * ya funciona hoy sin esto).
 */
import { logger } from "./logger";

// Traduce el id de proveedor de ESTA app al id real que usa OpenCode cuando
// difieren. Los que no aparecen acá se mandan tal cual (la mayoría de los 23
// proveedores del catálogo -- openai, anthropic, deepseek, mistral, xai,
// together, perplexity, fireworks, deepinfra, etc. -- ya coinciden con el id
// real de OpenCode/models.dev sin traducción).
const ID_HACIA_OPENCODE: Record<string, string> = {
  google_ai_studio: "google",
  nvidia_nim: "nvidia",
};

// Proveedores que NO se sincronizan: `github` usa un token de GitHub Models
// (PAT), no una API key simple, y el proveedor equivalente en OpenCode
// (github-copilot) requiere su propio flujo OAuth, no PUT /auth/{id} con
// {type:"api"}. `mimo` es la API propia de Xiaomi, no confirmado que exista
// como proveedor conocido en el catálogo de OpenCode -- mejor no intentarlo
// y ensuciar el log con un 404 esperado en cada guardado.
const NO_SINCRONIZABLES = new Set(["github", "mimo"]);

function opencodeConfig(): { host: string; authHeader: string } | null {
  const host = process.env.ATLAS_OPENCODE_HOST;
  const user = process.env.ATLAS_OPENCODE_USER;
  const pass = process.env.ATLAS_OPENCODE_PASS;
  if (!host || !user || !pass) return null;
  return { host: host.replace(/\/+$/, ""), authHeader: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64") };
}

/**
 * Sincroniza UN proveedor (llamado desde ai-catalog.ts justo después de
 * guardar). No lanza -- un fallo acá nunca debe tumbar el guardado real.
 */
export async function sincronizarProveedorConOpencode(proveedorId: string, apiKeyPlana: string): Promise<void> {
  if (NO_SINCRONIZABLES.has(proveedorId)) return;
  const cfg = opencodeConfig();
  if (!cfg) return; // OpenCode no configurado en este deploy -- nada que hacer.

  const idOpencode = ID_HACIA_OPENCODE[proveedorId] || proveedorId;
  try {
    const res = await fetch(`${cfg.host}/auth/${encodeURIComponent(idOpencode)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: cfg.authHeader },
      body: JSON.stringify({ type: "api", key: apiKeyPlana }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.warn({ proveedorId, idOpencode, status: res.status }, "[AtlasMCP] OpenCode rechazó la clave sincronizada (¿id de proveedor no coincide?)");
      return;
    }
    logger.info({ proveedorId, idOpencode }, "[AtlasMCP] Clave sincronizada a OpenCode");
  } catch (err: any) {
    logger.warn({ err: err?.message, proveedorId }, "[AtlasMCP] No se pudo sincronizar la clave a OpenCode (no bloquea el guardado)");
  }
}

/**
 * Sincroniza TODAS las claves ya guardadas -- para el respaldo inicial (las
 * que el admin ya había cargado antes de que existiera esta sincronización)
 * y para volver a alinear todo si operato se reinicia y pierde su config.
 */
export async function sincronizarTodasLasClavesConOpencode(): Promise<{ sincronizadas: number; fallidas: number }> {
  const cfg = opencodeConfig();
  if (!cfg) return { sincronizadas: 0, fallidas: 0 };

  const { db, settings } = await import("@workspace/db");
  const { leerBusinessConfig } = await import("./ai-keys");
  const { descifrar } = await import("./ai-keys");

  const [row] = await db.select().from(settings).limit(1);
  if (!row) return { sincronizadas: 0, fallidas: 0 };
  const guardados = leerBusinessConfig(row.businessConfig).aiProviders || {};

  let sincronizadas = 0;
  let fallidas = 0;
  for (const [proveedorId, datos] of Object.entries<any>(guardados)) {
    if (!datos?.apiKey || NO_SINCRONIZABLES.has(proveedorId)) continue;
    const plana = descifrar(datos.apiKey);
    if (!plana) { fallidas++; continue; }
    await sincronizarProveedorConOpencode(proveedorId, plana);
    sincronizadas++;
  }
  logger.info({ sincronizadas, fallidas }, "[AtlasMCP] Sincronización completa de claves guardadas hacia OpenCode");
  return { sincronizadas, fallidas };
}
