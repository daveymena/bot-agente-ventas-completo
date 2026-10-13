/**
 * Claves de proveedores de IA guardadas desde la pantalla de Configuración.
 *
 * Dos problemas que resuelve:
 *
 * 1. QUE FUNCIONEN. Todo el código de proveedores lee `process.env`. Una clave
 *    guardada en la base no serviría de nada por sí sola, así que al arrancar
 *    (y tras cada guardado) se vuelcan al entorno del proceso. Así los
 *    proveedores existentes funcionan sin tocarlos.
 *
 * 2. QUE ESTÉN PROTEGIDAS. No se guardan en claro: se cifran con AES-256-GCM
 *    usando una clave derivada de COOKIE_SECRET. Si alguien lee la base, no
 *    obtiene las claves. Y nunca se devuelven al frontend (solo "tiene clave:
 *    sí/no").
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { db, settings } from "@workspace/db";
import { logger } from "./logger";

const PREFIJO = "enc:v1:";

/** Variable de entorno que espera cada proveedor. */
export const ENV_POR_PROVEEDOR: Record<string, string> = {
  opencode: "OPENCODE_API_KEY",
  // Nivel PAGO de OpenCode, separado del gratuito a propósito: el free se
  // queda sin cuota a mitad del día (FreeUsageLimitError) y deja al bot sin
  // responder. Teniéndolos como proveedores distintos, el admin puede poner
  // Go de respaldo y que el corte de cuota no lo saque de servicio.
  opencode_go: "OPENCODE_GO_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google_ai_studio: "GOOGLE_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  cohere: "COHERE_API_KEY",
  nvidia_nim: "NVIDIA_API_KEY",
  // Ollama en la NUBE, no el local: los modelos corren del lado de ellos.
  ollama_cloud: "OLLAMA_CLOUD_API_KEY",
  github: "GITHUB_TOKEN",
  mimo: "MIMO_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  together: "TOGETHER_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  deepinfra: "DEEPINFRA_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  zhipu: "ZHIPU_API_KEY",
  qwen: "QWEN_API_KEY",
  nebius: "NEBIUS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  // Puente Excelnt del dueño (2026-10-06): gateway https://excelnt.ai/v1, la
  // key se crea en la extensión de VS Code y aparece en su dashboard.
  excelnt: "EXCELNT_API_KEY",
};

/** Variable del MODELO de cada proveedor (para que la elección también aplique). */
export const ENV_MODELO_POR_PROVEEDOR: Record<string, string> = {
  opencode: "OPENCODE_MODEL",
  // Faltaba: opencode_go tenía mapeada su CLAVE pero no su MODELO, así que
  // elegir el modelo desde el panel no tenía ningún efecto -- se guardaba en
  // la base y nunca llegaba al entorno. Es el proveedor de pago y hoy es el
  // primero de la cadena, o sea el que responde casi todos los mensajes.
  opencode_go: "OPENCODE_GO_MODEL",
  groq: "GROQ_MODEL",
  openrouter: "OPENROUTER_MODEL",
  ollama_cloud: "OLLAMA_CLOUD_MODEL",
  google_ai_studio: "GOOGLE_MODEL",
  cerebras: "CEREBRAS_MODEL",
  cohere: "COHERE_MODEL",
  nvidia_nim: "NVIDIA_NIM_MODEL",
  github: "GITHUB_MODEL",
  mimo: "MIMO_MODEL",
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  deepseek: "DEEPSEEK_MODEL",
  mistral: "MISTRAL_MODEL",
  xai: "XAI_MODEL",
  together: "TOGETHER_MODEL",
  perplexity: "PERPLEXITY_MODEL",
  fireworks: "FIREWORKS_MODEL",
  deepinfra: "DEEPINFRA_MODEL",
  moonshot: "MOONSHOT_MODEL",
  zhipu: "ZHIPU_MODEL",
  qwen: "QWEN_MODEL",
  nebius: "NEBIUS_MODEL",
  sambanova: "SAMBANOVA_MODEL",
  excelnt: "EXCELNT_MODEL",
};

/**
 * Lee businessConfig como objeto.
 *
 * La columna está declarada como json pero su valor por defecto quedó
 * DOBLEMENTE codificado en la base (el valor crudo es `"{}"`), así que un solo
 * JSON.parse devuelve la cadena "{}" en vez de un objeto. Se parsea hasta
 * obtener un objeto, con tope para no quedar en bucle.
 */
export function leerBusinessConfig(valor: unknown): Record<string, any> {
  let v: any = valor;
  for (let i = 0; i < 3 && typeof v === "string"; i++) {
    try {
      v = JSON.parse(v || "{}");
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function claveMaestra(): Buffer {
  // COOKIE_SECRET ya es obligatorio para las sesiones; se reutiliza como raíz.
  const secreto = process.env.COOKIE_SECRET || "clave-de-desarrollo-no-usar-en-produccion";
  return scryptSync(secreto, "ai-keys-v1", 32);
}

export function cifrar(texto: string): string {
  try {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", claveMaestra(), iv);
    const dato = Buffer.concat([c.update(texto, "utf8"), c.final()]);
    const tag = c.getAuthTag();
    return PREFIJO + Buffer.concat([iv, tag, dato]).toString("base64");
  } catch (e: any) {
    logger.error({ err: e?.message }, "[AIKeys] no se pudo cifrar");
    return texto;
  }
}

export function descifrar(valor: string): string | null {
  if (!valor) return null;
  if (!valor.startsWith(PREFIJO)) return valor; // guardada antes de cifrar
  try {
    const buf = Buffer.from(valor.slice(PREFIJO.length), "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const dato = buf.subarray(28);
    const d = createDecipheriv("aes-256-gcm", claveMaestra(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(dato), d.final()]).toString("utf8");
  } catch {
    // Ocurre si cambió COOKIE_SECRET: la clave guardada ya no se puede leer.
    logger.warn("[AIKeys] no se pudo descifrar una clave (¿cambió COOKIE_SECRET?)");
    return null;
  }
}

/** Lee las claves guardadas y las expone al proceso para que los proveedores las usen. */
export async function cargarClavesEnEntorno(): Promise<number> {
  try {
    const [row] = await db.select().from(settings).limit(1);
    if (!row) return 0;
    const cfg = leerBusinessConfig(row.businessConfig);
    const guardados = cfg.aiProviders || {};

    let aplicadas = 0;
    for (const [proveedor, datos] of Object.entries<any>(guardados)) {
      const envKey = ENV_POR_PROVEEDOR[proveedor];
      if (envKey && datos?.apiKey) {
        const plana = descifrar(datos.apiKey);
        // La clave guardada desde Configuración GANA sobre la del .env, no al
        // revés. Antes era "si el .env ya trae la clave, no se pisa": para
        // opencode/groq/github -- los únicos tres proveedores que además
        // vienen con clave puesta de fábrica en el .env de este deploy -- eso
        // hacía que la pantalla de "Modelos de pago" guardara la clave nueva
        // en la base (cifrada, con éxito aparente) pero NUNCA se usara en
        // ningún lado: ni el Arquitecto, ni el botón "Probar conexión" (que
        // también resuelve vía getProviderConfig(), o sea vía process.env).
        // settings es una fila única de este deploy, no algo compartido entre
        // negocios -- no hay ninguna razón real para que el admin no pueda
        // reemplazar la clave que trae el servidor por una propia.
        if (plana) {
          process.env[envKey] = plana;
          aplicadas++;
        }
      }
      const envModelo = ENV_MODELO_POR_PROVEEDOR[proveedor];
      if (envModelo && datos?.model) process.env[envModelo] = datos.model;
    }
    // ── El token de GitHub vive en DOS lugares y solo uno llegaba al entorno ──
    // `settings.githubToken` es donde escribe la conexión de Copilot (el flujo
    // de código de dispositivo, routes/settings.ts), mientras que el bucle de
    // arriba solo mira `businessConfig.aiProviders`, que es donde escribe la
    // pantalla de "Modelos de pago". Son dos pantallas distintas guardando en
    // dos campos distintos.
    //
    // Consecuencia real, medida el 2026-08-19: el admin volvió a conectar su
    // cuenta de Copilot, el intercambio de token funcionó y quedó guardado con
    // 24h de vigencia... y aun así toda llamada a Copilot fallaba, porque
    // `getProviderConfig("github_copilot_internal")` lee
    // `process.env.GITHUB_TOKEN` y ahí seguía el token VIEJO. Autenticarse de
    // nuevo no arreglaba nada y no había forma de darse cuenta.
    //
    // Gana el de la conexión de Copilot, y no al revés: el otro consumidor de
    // GITHUB_TOKEN era GitHub Models, que GitHub está RETIRANDO (verificado el
    // 2026-08-19: 404 en el endpoint viejo y 410 "retirement brownout" en el
    // nuevo). O sea que el token de "Modelos de pago" ya no sirve para nada,
    // mientras que el de Copilot es el que el admin acaba de autorizar a mano.
    if ((row as any).githubToken) {
      process.env.GITHUB_TOKEN = String((row as any).githubToken);
      logger.info("[AIKeys] token de GitHub tomado de la conexión de Copilot");

      // Y se le pasa a OpenCode, que es de donde Atlas saca sus modelos.
      //
      // Va acá además de en el momento de vincular, y no es redundante: el
      // admin ya tiene su cuenta vinculada desde antes de que esto existiera, y
      // sin este empujón al arrancar habría que pedirle que la vuelva a
      // vincular para nada. También cubre que OpenCode se reinicie y pierda su
      // configuración, que ya pasó antes con las otras claves.
      const expira = (row as any).copilotSessionExpiresAt;
      void import("./opencode-provider-sync")
        .then(({ sincronizarCopilotConOpencode }) =>
          sincronizarCopilotConOpencode({
            refresh: String((row as any).githubToken),
            access: (row as any).copilotSessionToken || null,
            expiraEnMs: expira ? new Date(expira).getTime() : null,
          }),
        )
        .catch(() => {});
    }

    // VARIAS cuentas de Copilot. El admin tiene varias propias y activas, y la
    // idea es que cuando una se queda sin cuota siga la siguiente: la rotación
    // ya aparta 1 hora al que devuelve "cuota agotada", solo faltaba que
    // hubiera más de un candidato que rotar (ver copilot-cuentas.ts).
    //
    // Va al entorno, como el resto de las claves, porque la cadena se arma en
    // un contexto sincrónico y una consulta a la base por turno para leer algo
    // que ya está en memoria sería puro costo.
    const cuentas = (row as any).copilotTokens;
    if (cuentas) {
      try {
        const { normalizarTokensDeCopilot } = await import("./copilot-cuentas");
        const lista = normalizarTokensDeCopilot(cuentas);
        if (lista.length > 0) {
          process.env.COPILOT_TOKENS = JSON.stringify(lista);
          // Cuántas, nunca cuáles: son credenciales.
          logger.info({ cuentas: lista.length }, "[AIKeys] cuentas de Copilot cargadas");
        }
      } catch (e: any) {
        logger.warn({ err: e?.message }, "[AIKeys] no se pudieron leer las cuentas de Copilot");
      }
    }

    if (aplicadas > 0) logger.info({ aplicadas }, "[AIKeys] claves guardadas cargadas al entorno");
    return aplicadas;
  } catch (e: any) {
    logger.error({ err: e?.message }, "[AIKeys] error cargando claves guardadas");
    return 0;
  }
}
