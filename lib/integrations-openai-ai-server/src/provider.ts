import OpenAI from "openai";

export interface AIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  defaultHeaders?: Record<string, string>;
}

const ZEN_DIRECT_BASE_URL = "https://api.freemodel.dev/v1";
const ZEN_DEFAULT_FREE_MODEL = "gpt-5.6-luna";

/**
 * Orden de rotación de los modelos gratuitos de OpenCode Zen.
 *
 * La cuota gratuita se agota POR MODELO (devuelve 429 FreeUsageLimitError),
 * no por cuenta: cuando uno se acaba, otro sigue respondiendo. Antes solo se
 * usaba OPENCODE_MODEL, así que al agotarse se caía al siguiente proveedor
 * entero pudiendo seguir dentro de Zen.
 *
 * Barrido completo del catálogo el 2026-07-26 con max_tokens=2000: los 7
 * modelos gratuitos responden. Orden por tiempo de respuesta medido.
 *
 * ⚠️ Los "de razonamiento" (north-mini-code-free, deepseek-v4-flash-free)
 * NO están rotos: con max_tokens bajo (20-30) gastan el presupuesto pensando
 * y devuelven content vacío. Con 2000+ responden bien.
 */
const ZEN_ROTATION = [
  "gpt-5.6-luna",
  "gpt-5.6-sol",
  "gpt-5.6-terra"
];

/** Modelos de Zen a probar, en orden: primero el configurado, luego el resto. */
export function getOpenCodeRotation(): AIProviderConfig[] {
  const preferido = normalizeZenModelId(process.env.OPENCODE_MODEL || ZEN_DEFAULT_FREE_MODEL);
  const extra = (process.env.OPENCODE_ROTATION || "")
    .split(",")
    .map((m) => normalizeZenModelId(m.trim()))
    .filter(Boolean);
  const orden = [preferido, ...extra, ...ZEN_ROTATION].filter(
    (m, i, arr) => m && arr.indexOf(m) === i, // sin duplicados, conserva el orden
  );
  return orden
    .map((m) => resolveOpenCodeConfig(m))
    .filter((c): c is AIProviderConfig => c !== null);
}

function isZenDirectApi(baseUrl: string): boolean {
  return baseUrl.includes("opencode.ai/zen");
}

/** Zen API uses model ids without the opencode/ prefix (e.g. deepseek-v4-flash-free). */
export function normalizeZenModelId(model: string): string {
  return model.startsWith("opencode/") ? model.slice("opencode/".length) : model;
}

function resolveOpenCodeConfig(modelOverride?: string): AIProviderConfig | null {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) return null;

  const baseUrl = process.env.OPENCODE_API_URL || ZEN_DIRECT_BASE_URL;
  const rawModel = modelOverride || process.env.OPENCODE_MODEL || ZEN_DEFAULT_FREE_MODEL;
  const model = isZenDirectApi(baseUrl) ? normalizeZenModelId(rawModel) : rawModel;

  return { baseUrl, apiKey, model };
}

/**
 * Modelos de OpenCode Go que sirven para atender a un cliente, en orden de
 * velocidad medida.
 *
 * Medido con el trabajo real (mensaje de cliente en espanol pidiendo precio),
 * no con un ping: de los 26 que expone /models, SOLO 4 sirven. La medicion
 * anterior decia "20 contestan" porque miraba el HTTP; mirando el CONTENIDO,
 * la mayoria no sirve:
 *
 *   - 8 devuelven HTTP 200 con el contenido VACIO (glm-5, glm-5.1, glm-5.2,
 *     glm-5.3, minimax-m2.5, hy3, kimi-k2.7-code, kimi-k3). Un 200 vacio es
 *     peor que un error: el bot se queda mudo y nada avisa que fallo.
 *   - kimi-k2.5, kimi-k2.6 y minimax-m3 mandan su RAZONAMIENTO como respuesta
 *     ("El usuario me pide que actue como vendedor...") e incluso inventan
 *     precios ("Tenemos desde $49", "esta en $XX"). Eso llegando a un cliente
 *     es peor que no responder.
 *   - deepseek-v4: 403 RegionError. qwen y grok-4.5: 503. hy3-preview,
 *     mimo-v2-omni, mimo-v2-pro: 400.
 *
 * Si alguno mejora, se agrega aca; el orden es el que se rota.
 */
export const MODELOS_GO_UTILES = [
  "gpt-5.6-luna",   // 2299 ms
  "minimax-m2.7",   // 3224 ms
  "mimo-v2.5-pro",  // 3493 ms
  "mimo-v2.5",      // 4445 ms
];

/**
 * Modelos que Go LISTA pero que NO sirven (ver el detalle arriba). Se listan
 * para no gastar un turno del cliente descubriendolo en vivo.
 */
const MODELOS_GO_ROTOS = new Set([
  // no responden
  "deepseek-v4-flash", "deepseek-v4-pro", "grok-4.5", "hy3-preview",
  "mimo-v2-omni", "mimo-v2-pro",
  "qwen3.5-plus", "qwen3.6-plus", "qwen3.7-plus", "qwen3.7-max", "qwen3.8-max",
  // responden 200 pero con el contenido vacio
  "glm-5", "glm-5.1", "glm-5.2", "glm-5.3", "hy3", "kimi-k3",
  "kimi-k2.7-code", "minimax-m2.5",
  // filtran su razonamiento al cliente e inventan precios
  "kimi-k2.5", "kimi-k2.6", "minimax-m3",
]);

/**
 * Todos los modelos utiles de Go, para rotar dentro del proveedor.
 *
 * Antes Go era un solo modelo (Luna): si Luna fallaba o se quedaba sin cuota,
 * se abandonaba el proveedor entero y se pasaba al siguiente, desperdiciando
 * los otros modelos pagos que si funcionan.
 */
export function getOpenCodeGoRotation(): AIProviderConfig[] {
  const goKey = process.env.OPENCODE_GO_API_KEY;
  if (!goKey) return [];
  const baseUrl = process.env.OPENCODE_GO_API_URL || "https://opencode.ai/zen/go/v1";
  const preferido = process.env.OPENCODE_GO_MODEL || MODELOS_GO_UTILES[0]!;
  const extra = (process.env.OPENCODE_GO_ROTATION || "").split(",").map((m) => m.trim()).filter(Boolean);
  const orden = [preferido, ...extra, ...MODELOS_GO_UTILES]
    .filter((m) => m && !MODELOS_GO_ROTOS.has(m))
    .filter((m, i, arr) => arr.indexOf(m) === i);
  return orden.map((model) => ({ baseUrl, apiKey: goKey, model }));
}

/**
 * Modelos de reserva por proveedor, EN ORDEN.
 *
 * Por qué existe: la cuota se agota POR MODELO, no por cuenta -- medido en
 * producción el 2026-08-16, con la misma clave un modelo devolvía 429 mientras
 * otro respondía en 832ms. OpenCode Zen y Go ya rotaban entre sus modelos por
 * eso mismo; el resto de los proveedores iba con UNO fijo, así que cuando ese
 * caía se perdía el proveedor entero aunque los demás respondieran.
 *
 * Los de acá abajo están MEDIDOS contra la API real el 2026-08-19, no elegidos
 * a ojo. Varios de los que "deberían" andar no andan: en Groq,
 * `llama-3.3-70b-versatile`, `llama-3.1-8b-instant` y `kimi-k2-instruct` dan
 * 404, y `gemma2-9b-it` está dado de baja -- el único que respondió fue
 * `openai/gpt-oss-20b`, en 299ms.
 *
 * Un modelo se agrega acá solo después de verlo contestar. Para descubrirlos
 * está `probarModelosDe()` (artifacts/api-server/src/lib/probar-modelos.ts),
 * que los prueba con un mensaje real de cliente y mira el CONTENIDO, no el
 * código HTTP: hay modelos que devuelven 200 con el cuerpo vacío y otros que
 * mandan su razonamiento al cliente.
 */
const MODELOS_DE_RESERVA: Record<string, string[]> = {
  // Medido contra la cuenta real el 2026-08-22 con `test_ai_models`:
  //   deepseek-v4-flash            responde bien, 293 ms
  //   deepseek-v4-pro              responde bien, 294 ms
  //   deepseek-v4-flash-vision-exp CONTESTA VACÍO — el bot se queda mudo
  // Los dos buenos van de reserva para que, si el modelo configurado en el
  // panel es el vision-exp (o cualquier otro que se caiga), la rotación
  // igual encuentre uno que responde en vez de dejar al cliente esperando.
  // `deepseek-chat` queda último: es el nombre de la API oficial de DeepSeek,
  // sirve si alguna vez se apunta ahí en vez de al gateway.
  // ⚠️ Acá había `["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"]`,
  // y los dos primeros NO EXISTEN en la API de DeepSeek: son nombres del
  // catálogo de OpenCode Zen, que es otro proveedor. La API propia de DeepSeek
  // (api.deepseek.com) solo tiene `deepseek-chat` y `deepseek-reasoner`.
  //
  // Consecuencia: al cargar saldo, el primer fallo de `deepseek-chat` mandaba
  // a dos modelos inexistentes y se gastaba el turno descubriéndolo -- el
  // mismo bug de los modelos muertos de Groq, en otro proveedor.
  //
  // `deepseek-reasoner` queda FUERA a propósito: es de razonamiento, y este
  // proyecto ya los excluye por regla (ver NO_SIRVEN en cadena-modelos.ts)
  // porque gastan el presupuesto de tokens en `reasoning_content` y devuelven
  // `content` vacío. Sin reserva es mejor que con una reserva que no responde.
  deepseek: ["deepseek-chat"],
  openai: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
  // ── Rotación escalonada de Groq ────────────────────────────────────────
  //
  // Groq limita por TOKENS POR MINUTO, no por día: se agota en un pico de
  // tráfico y se recupera solo al minuto siguiente. Por eso no conviene
  // saltar de Groq al primer 429 -- conviene BAJAR de modelo dentro de Groq,
  // que sigue siendo mejor que irse a otro proveedor mas chico.
  //
  // De mayor a menor, verificados contra su API el 2026-08-27 (los nombres
  // viejos ya no existen: llama-3.3-70b y llama-3.1-8b salieron del catalogo,
  // asi que apuntar ahi era un 404 silencioso).
  //
  // El 120b y el qwen se probaron con la pregunta trampa ("tengo una
  // panaderia, me sirve?"): los dos contestaron en colombiano y NINGUNO
  // invento capacidades del curso -- que es justo lo que hacia el modelo que
  // atendia hasta hoy.
  groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "groq/compound-mini"],
  mistral: ["codestral-latest", "mistral-large-latest"],
  nvidia: ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct"],
  nvidia_nim: ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct"],
  openrouter: [
    "nvidia/nemotron-3-nano-30b-a3b:free",
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "poolside/laguna-xs-2.1:free",
  ],
  github_copilot_internal: ["gpt-4o", "gpt-4o-mini"],
};

/**
 * Todos los modelos que vale la pena intentar de un proveedor, en orden: el
 * configurado primero, después los que el admin haya puesto en
 * `<PROVEEDOR>_ROTATION`, y al final los de reserva medidos.
 *
 * Devuelve una config por modelo, para que la cola de respaldo pueda tratar
 * cada uno como un candidato propio en vez de perder el proveedor completo al
 * primer fallo.
 */
export function getProviderRotation(provider: string): AIProviderConfig[] {
  const base = getProviderConfig(provider);
  if (!base) return [];
  const extra = (process.env[`${provider.toUpperCase()}_ROTATION`] || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const orden = [base.model, ...extra, ...(MODELOS_DE_RESERVA[provider] || [])]
    .filter((m): m is string => !!m)
    .filter((m, i, arr) => arr.indexOf(m) === i);
  return orden.map((model) => ({ ...base, model }));
}

/**
 * La misma configuración de un proveedor, pero con una clave INYECTADA en vez
 * de leerla del entorno.
 *
 * Existe por el aislamiento entre clientes: `getProviderConfig()` saca la clave
 * de `process.env`, que es global al proceso, así que no sirve para atender a
 * dos clientes con claves distintas en el mismo servidor. Acá la clave viaja
 * como argumento y nunca se escribe en ningún lado.
 *
 * Es a propósito una lista corta y explícita: los proveedores que un cliente
 * puede traer con su propia cuenta. Los que viven en infraestructura nuestra
 * (opencode, opencode_go, los puentes) no entran -- ahí la clave es del
 * sistema, no del cliente, y devolver null es la respuesta correcta.
 */
export function getProviderConfigConClave(
  provider: string,
  apiKey: string,
  model?: string,
): AIProviderConfig | null {
  if (!apiKey) return null;
  const m = (porDefecto: string) => model || porDefecto;
  switch (provider) {
    case "deepseek":
      return { baseUrl: "https://api.deepseek.com/v1", apiKey, model: m("deepseek-chat") };
    case "openai":
      return { baseUrl: "https://api.openai.com/v1", apiKey, model: m("gpt-5.6-luna") };
    case "anthropic":
      return { baseUrl: "https://api.anthropic.com/v1", apiKey, model: m("claude-sonnet-5") };
    case "groq":
      // El GRANDE de Groq. Estaba en el de 20B, que es el que no sostiene una
      // instruccion larga. Verificado contra su API el 2026-08-27: de los que
      // ofrecen hoy, este es el mayor.
      return { baseUrl: "https://api.groq.com/openai/v1", apiKey, model: m("openai/gpt-oss-120b") };
    case "openrouter":
      return { baseUrl: "https://openrouter.ai/api/v1", apiKey, model: m("nvidia/nemotron-3-nano-30b-a3b:free") };
    case "mistral":
      return { baseUrl: "https://api.mistral.ai/v1", apiKey, model: m("mistral-large-latest") };
    case "nvidia":
    case "nvidia_nim":
      return { baseUrl: "https://integrate.api.nvidia.com/v1", apiKey, model: m("meta/llama-3.1-70b-instruct") };
    case "together":
      return { baseUrl: "https://api.together.xyz/v1", apiKey, model: m("meta-llama/Llama-3.3-70B-Instruct-Turbo") };
    case "cerebras":
      return { baseUrl: "https://api.cerebras.ai/v1", apiKey, model: m("llama-3.3-70b") };
    case "xai":
      return { baseUrl: "https://api.x.ai/v1", apiKey, model: m("grok-4.5") };
    case "google_ai_studio":
      return { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey, model: m("gemini-2.5-flash") };
    case "github_copilot_internal":
      return {
        baseUrl: "https://api.githubcopilot.com",
        apiKey,
        model: m("gpt-4o"),
        defaultHeaders: {
          "Editor-Version": process.env.COPILOT_EDITOR_VERSION || "vscode/1.104.1",
          "Editor-Plugin-Version": "copilot/1.250.0",
          "Openai-Organization": "github-copilot",
          "Copilot-Integration-Id": "vscode-chat",
        },
      };
    case "ollama_cloud": {
      // La clave que el admin carga desde el panel (tenants.apiKeys) tiene
      // que servir: antes caía al default null y la configuración no hacía
      // nada. El modelo lo elige el admin o OLLAMA_CLOUD_MODEL.
      if (!apiKey) return null;
      return {
        baseUrl: process.env.OLLAMA_CLOUD_URL || "https://ollama.com/v1",
        apiKey,
        model: model || process.env.OLLAMA_CLOUD_MODEL || "gemma3:27b",
      };
    }
    default:
      return null;
  }
}

export function getProviderConfig(provider: string): AIProviderConfig | null {
  switch (provider) {
    // ─── PROVEEDORES EXISTENTES ───────────────────────────────────────────────
    case "opencode":
      return resolveOpenCodeConfig();
    // Nivel de pago de OpenCode. Endpoint distinto del gratuito y clave
    // propia, para que convivan: el free se queda sin cuota a mitad del día
    // y Go sigue respondiendo.
    case "opencode_go": {
      const goKey = process.env.OPENCODE_GO_API_KEY;
      if (!goKey) return null;
      const pedido = process.env.OPENCODE_GO_MODEL || "gpt-5.6-luna";
      return {
        baseUrl: process.env.OPENCODE_GO_API_URL || "https://opencode.ai/zen/go/v1",
        apiKey: goKey,
        // Si el modelo pedido es uno de los que Go lista pero NO responde, se
        // cae al de referencia en vez de gastar el turno en un 403/400. Ver
        // MODELOS_GO_ROTOS.
        model: MODELOS_GO_ROTOS.has(pedido) ? "gpt-5.6-luna" : pedido,
      };
    }
    case "github_copilot_internal":
      const rawCopilotToken = process.env.GITHUB_COPILOT_TOKEN || process.env.GITHUB_TOKEN;
      if (!rawCopilotToken) return null;
      return {
        baseUrl: "https://api.githubcopilot.com",
        apiKey: rawCopilotToken,
        model: process.env.GITHUB_MODEL || "gpt-4o",
        defaultHeaders: {
          "Editor-Version": process.env.COPILOT_EDITOR_VERSION || "vscode/1.104.1",
          "Editor-Plugin-Version": "copilot/1.250.0",
          "Openai-Organization": "github-copilot",
          "Copilot-Integration-Id": "vscode-chat",
        }
      };
    case "github":
      const ghToken = process.env.GITHUB_TOKEN;
      if (!ghToken) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: ghToken,
        model: process.env.GITHUB_MODEL || "gpt-4o-mini",
      };
    case "nvidia":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
      };
    case "nvidia_fast":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_MODEL_FAST || "meta/llama-3.1-8b-instruct",
      };
    case "github_claude":
      const ghcToken = process.env.GITHUB_TOKEN;
      if (!ghcToken) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: ghcToken,
        model: process.env.GITHUB_MODEL_CLAUDE || "Claude-3.5-Sonnet",
      };
    // ── Ollama CLOUD ── https://ollama.com/settings/keys
    //
    // No confundir con `ollama_local`, que apunta a un Ollama corriendo en una
    // máquina propia. Este es el servicio en la nube: los modelos corren del
    // lado de ellos, así que no consume RAM del servidor -- que es justo el
    // motivo por el que NO se instaló Ollama local en el VPS (15 servicios
    // corriendo, y un modelo de 7B se come 8 GB mientras responde).
    //
    // La capa compatible con OpenAI vive en /v1, no en /api. Da acceso a
    // modelos grandes (gpt-oss:120b, deepseek-v3.1:671b, qwen3-coder:480b)
    // con una capa gratuita de uso diario.
    //
    // OJO con la capa gratis: es por CUOTA de uso, no por token. Cuando se
    // agota, corta hasta que rota la ventana -- así que sirve de respaldo o
    // para tareas puntuales, no como proveedor principal de las ventas.
    case "ollama_cloud":
      if (!process.env.OLLAMA_CLOUD_API_KEY) return null;
      return {
        baseUrl: process.env.OLLAMA_CLOUD_URL || "https://ollama.com/v1",
        apiKey: process.env.OLLAMA_CLOUD_API_KEY,
        model: process.env.OLLAMA_CLOUD_MODEL || "gemma3:27b",
      };

    case "ollama_local":
      if (!process.env.OLLAMA_LOCAL_URL) return null;
      return {
        baseUrl: process.env.OLLAMA_LOCAL_URL + (process.env.OLLAMA_LOCAL_URL.endsWith("/v1") ? "" : "/v1"),
        apiKey: "ollama",
        model: process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
      };
    case "bridge_local":
      if (!process.env.BRIDGE_LOCAL_URL) return null;
      return {
        baseUrl: process.env.BRIDGE_LOCAL_URL,
        apiKey: process.env.BRIDGE_LOCAL_API_KEY || "no-key",
        model: process.env.BRIDGE_LOCAL_MODEL || "gpt-4o-mini",
      };
    case "github_haiku":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: "claude-haiku-4-5",
      };
    case "openai_default":
      if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
      return {
        baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        model: "gpt-4o",
      };

    // ─── FREE PROVIDERS (cheahjs/free-llm-api-resources) ──────────────────────
    // 🔗 https://github.com/cheahjs/free-llm-api-resources

    // ── GROQ (Rápido y gratuito) ── 30 req/min · 6k req/día
    case "groq":
      if (!process.env.GROQ_API_KEY) return null;
      return {
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: process.env.GROQ_API_KEY,
        // `llama-3.1-8b-instant` NO EXISTE: Groq lo dio de baja junto con
        // llama-3.3-70b-versatile y gemma2-9b-it (comprobado contra su API el
        // 2026-08-27, commit e0c7423). Ese commit arreglo el default de
        // getProviderConfigConClave (arriba) y dejo ESTE sin tocar -- y este es
        // justo el que usa el bot de ventas de WhatsApp (agent.ts:1939).
        //
        // Medido en produccion el 2026-08-28: a "que incluye el curso de piano
        // y cuanto sale?" el bot contesto "Te confirmo lo que incluye y el
        // precio. Te parece bien?" -- no respondio nada. Es el sintoma del
        // modelo chico atendiendo.
        //
        // Verificado en vivo el mismo dia: gpt-oss-120b responde en 442ms.
        model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      };

    // ── XIAOMI MiMo ── API propia, independiente de OpenCode Zen.
    // Compatible con el formato de OpenAI. Sirve para no depender de la cuota
    // gratuita de Zen, que se agota (FreeUsageLimitError).
    // Clave: https://platform.xiaomimimo.com/#/console/api-keys  (formato sk-)
    // Con plan de tokens la base es https://token-plan-cn.xiaomimimo.com/v1
    case "mimo":
      if (!process.env.MIMO_API_KEY) return null;
      return {
        baseUrl: process.env.MIMO_API_URL || "https://api.xiaomimimo.com/v1",
        apiKey: process.env.MIMO_API_KEY,
        model: process.env.MIMO_MODEL || "mimo-v2.5-pro",
      };

    // ─── PROVEEDORES COMERCIALES (compatibles con el formato de OpenAI) ──────
    // Todos exponen /v1/chat/completions al estilo OpenAI, así que funcionan
    // con el mismo cliente. Los ids de modelo NO se fijan aquí a propósito:
    // se descubren en vivo desde /v1/models (ver ruta /api/ai/models).

    // ── OpenAI (ChatGPT) ── https://platform.openai.com/api-keys
    case "openai":
      if (!process.env.OPENAI_API_KEY) return null;
      return {
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      };

    // ── Anthropic (Claude) ── capa compatible con OpenAI
    case "anthropic":
      if (!process.env.ANTHROPIC_API_KEY) return null;
      return {
        baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
      };

    // ── DeepSeek ── https://platform.deepseek.com · muy barato
    case "deepseek":
      if (!process.env.DEEPSEEK_API_KEY) return null;
      return {
        baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      };

    // ── Mistral ── https://console.mistral.ai · tiene capa gratuita
    case "mistral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        baseUrl: process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      };

    // ── xAI (Grok) ── https://console.x.ai
    case "xai":
      if (!process.env.XAI_API_KEY) return null;
      return {
        baseUrl: process.env.XAI_BASE_URL || "https://api.x.ai/v1",
        apiKey: process.env.XAI_API_KEY,
        model: process.env.XAI_MODEL || "grok-2-latest",
      };

    // ── Together AI ── https://api.together.ai · créditos gratis al registrarse
    case "together":
      if (!process.env.TOGETHER_API_KEY) return null;
      return {
        baseUrl: process.env.TOGETHER_BASE_URL || "https://api.together.xyz/v1",
        apiKey: process.env.TOGETHER_API_KEY,
        model: process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      };

    // ── Perplexity ── https://www.perplexity.ai/settings/api · busca en la web
    case "perplexity":
      if (!process.env.PERPLEXITY_API_KEY) return null;
      return {
        baseUrl: process.env.PERPLEXITY_BASE_URL || "https://api.perplexity.ai",
        apiKey: process.env.PERPLEXITY_API_KEY,
        model: process.env.PERPLEXITY_MODEL || "sonar",
      };

    // ── Fireworks AI ── https://fireworks.ai/account/api-keys
    case "fireworks":
      if (!process.env.FIREWORKS_API_KEY) return null;
      return {
        baseUrl: process.env.FIREWORKS_BASE_URL || "https://api.fireworks.ai/inference/v1",
        apiKey: process.env.FIREWORKS_API_KEY,
        model: process.env.FIREWORKS_MODEL || "accounts/fireworks/models/llama-v3p3-70b-instruct",
      };

    // ── DeepInfra ── https://deepinfra.com/dash/api_keys · muy barato
    case "deepinfra":
      if (!process.env.DEEPINFRA_API_KEY) return null;
      return {
        baseUrl: process.env.DEEPINFRA_BASE_URL || "https://api.deepinfra.com/v1/openai",
        apiKey: process.env.DEEPINFRA_API_KEY,
        model: process.env.DEEPINFRA_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── Moonshot (Kimi) ── https://platform.moonshot.ai · contexto enorme
    case "moonshot":
      if (!process.env.MOONSHOT_API_KEY) return null;
      return {
        baseUrl: process.env.MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1",
        apiKey: process.env.MOONSHOT_API_KEY,
        model: process.env.MOONSHOT_MODEL || "kimi-k2-0905-preview",
      };

    // ── Zhipu (GLM) ── https://open.bigmodel.cn
    case "zhipu":
      if (!process.env.ZHIPU_API_KEY) return null;
      return {
        baseUrl: process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZHIPU_API_KEY,
        model: process.env.ZHIPU_MODEL || "glm-4-plus",
      };

    // ── Alibaba Qwen (DashScope) ── https://dashscope.console.aliyun.com
    case "qwen":
      if (!process.env.QWEN_API_KEY) return null;
      return {
        baseUrl: process.env.QWEN_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        apiKey: process.env.QWEN_API_KEY,
        model: process.env.QWEN_MODEL || "qwen-plus",
      };

    // ── Nebius ── https://studio.nebius.com · créditos de prueba
    case "nebius":
      if (!process.env.NEBIUS_API_KEY) return null;
      return {
        baseUrl: process.env.NEBIUS_BASE_URL || "https://api.studio.nebius.com/v1",
        apiKey: process.env.NEBIUS_API_KEY,
        model: process.env.NEBIUS_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── SambaNova ── https://cloud.sambanova.ai · muy rápido
    case "sambanova":
      if (!process.env.SAMBANOVA_API_KEY) return null;
      return {
        baseUrl: process.env.SAMBANOVA_BASE_URL || "https://api.sambanova.ai/v1",
        apiKey: process.env.SAMBANOVA_API_KEY,
        model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
      };

    // ── CEREBRAS ── gratis: 5 req/min · 1M tokens/hora · clave en cloud.cerebras.ai
    case "cerebras":
      if (!process.env.CEREBRAS_API_KEY) return null;
      return {
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY,
        model: process.env.CEREBRAS_MODEL || "gpt-oss-120b",
      };

    // ── COHERE ── gratis: 20 req/min · 1.000 req/mes · clave en dashboard.cohere.com
    case "cohere":
      if (!process.env.COHERE_API_KEY) return null;
      return {
        baseUrl: "https://api.cohere.ai/compatibility/v1",
        apiKey: process.env.COHERE_API_KEY,
        model: process.env.COHERE_MODEL || "command-a-03-2025",
      };

    // ── Google AI Studio ── 500 req/día · 250k tokens/min
    case "google_ai_studio":
      if (!process.env.GOOGLE_API_KEY) return null;
      return {
        // Ruta /openai/: es la capa compatible con OpenAI. La anterior
        // (/v1beta a secas) es la API nativa de Gemini y el cliente de OpenAI
        // no puede hablar con ella.
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
        apiKey: process.env.GOOGLE_API_KEY,
        model: process.env.GOOGLE_MODEL || "gemini-2.5-flash",
      };

    // ── NVIDIA NIM ── 40 req/min · requiere verificación de teléfono
    case "nvidia_nim":
      if (!process.env.NVIDIA_API_KEY) return null;
      return {
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: process.env.NVIDIA_API_KEY,
        model: process.env.NVIDIA_NIM_MODEL || "meta/llama-3.1-70b-instruct",
      };

    // ── NVIDIA NIM BRIDGE (Local Proxy) ── Modelos gratuitos vía ia.escarper
    //    Corre en http://localhost:3000/v1, requiere tener el bridge ejecutándose
    case "nvidia_nim_bridge":
      return {
        baseUrl: process.env.NVIDIA_NIM_BRIDGE_URL || "http://localhost:3000/v1",
        apiKey: process.env.NVIDIA_NIM_BRIDGE_API_KEY || "no-key-required",
        model: process.env.NVIDIA_NIM_BRIDGE_MODEL || "moonshotai/kimi-k2.6",
      };

    // ── Mistral (La Plateforme) ── 1M tokens/mes · requiere verificación tel
    case "mistral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        baseUrl: "https://api.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        model: process.env.MISTRAL_MODEL || "mistral-small-latest",
      };

    // ── Mistral Codestral ── 2,000 req/día · 30 req/min
    case "mistral_codestral":
      if (!process.env.MISTRAL_API_KEY) return null;
      return {
        baseUrl: "https://codestral.mistral.ai/v1",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "codestral-latest",
      };

    // ── HuggingFace Inference ── $0.10/mes créditos
    case "huggingface":
      if (!process.env.HUGGINGFACE_API_KEY) return null;
      return {
        baseUrl: `https://api-inference.huggingface.co/v1`,
        apiKey: process.env.HUGGINGFACE_API_KEY,
        model: process.env.HUGGINGFACE_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── Vercel AI Gateway ── $5/mes
    case "vercel_ai":
      if (!process.env.VERCEL_AI_GATEWAY_TOKEN) return null;
      return {
        baseUrl: "https://ai-gateway.vercel.sh/api/v1",
        apiKey: process.env.VERCEL_AI_GATEWAY_TOKEN,
        model: process.env.VERCEL_AI_MODEL || "openai/gpt-4o-mini",
      };

    // ── OpenCode Zen ── free tier
    case "opencode_zen":
      if (!process.env.OPENCODE_ZEN_API_KEY) return null;
      return {
        baseUrl: "https://opencode.ai/zen/v1",
        apiKey: process.env.OPENCODE_ZEN_API_KEY,
        model: process.env.OPENCODE_ZEN_MODEL || "deepseek-v4-flash-free",
      };

    // ── Cerebras ── 1M tokens/día
    case "cerebras":
      if (!process.env.CEREBRAS_API_KEY) return null;
      return {
        baseUrl: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY,
        model: process.env.CEREBRAS_MODEL || "llama-3.1-8b-instruct",
      };

    // ── OpenRouter ── Modelos gratis/free · Acceso a múltiples proveedores
    case "openrouter":
      if (!process.env.OPENROUTER_API_KEY) return null;
      
      // Modelos free funcionales en OpenRouter
      const freeModels = [
        "meta-llama/llama-2-7b-chat",
        "meta-llama/llama-3-8b-instruct",
        "mistralai/mistral-7b-instruct",
        "nousresearch/nous-hermes-2-mixtral-8x7b-dpo",
        "openchat/openchat-3.5",
        "gryphe/mythomist-7b",
        "meta-llama/llama-3.1-8b-instruct",
        "meta-llama/llama-3.1-70b-instruct",
        "mistralai/mistral-large",
        "openrouter/auto"
      ];
      
      // Seleccionar modelo: usar el configurado o rotar entre free
      const selectedModel = process.env.OPENROUTER_MODEL || freeModels[Math.floor(Math.random() * freeModels.length)];
      
      return {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY,
        model: selectedModel,
        defaultHeaders: {
          "HTTP-Referer": "https://tecnovariedades.com",
          "X-Title": "TecnoVariedades Sales Bot"
        }
      };

    // ── Cohere ── 1,000 req/mes
    case "cohere":
      if (!process.env.COHERE_API_KEY) return null;
      return {
        baseUrl: "https://api.cohere.ai/v2",
        apiKey: process.env.COHERE_API_KEY,
        model: process.env.COHERE_MODEL || "command-a-03-2025",
      };

    // ── Cloudflare Workers AI ── 10,000 neuronas/día
    case "cloudflare_workers":
      if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) return null;
      return {
        baseUrl: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run`,
        apiKey: process.env.CLOUDFLARE_API_TOKEN,
        model: process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        defaultHeaders: { "Accept-Encoding": "gzip, deflate" },
      };

    // ── GitHub Models ── según suscripción Copilot
    case "github_models":
      if (!process.env.GITHUB_TOKEN) return null;
      return {
        baseUrl: "https://models.inference.ai.azure.com",
        apiKey: process.env.GITHUB_TOKEN,
        model: process.env.GITHUB_MODEL || "meta-llama/llama-3.3-70b-instruct",
      };

    // ─── TRIAL CREDITS ────────────────────────────────────────────────────────

    // ── Fireworks ── $1 crédito
    case "fireworks":
      if (!process.env.FIREWORKS_API_KEY) return null;
      return {
        baseUrl: "https://api.fireworks.ai/inference/v1",
        apiKey: process.env.FIREWORKS_API_KEY,
        model: process.env.FIREWORKS_MODEL || "accounts/fireworks/models/llama-v3p1-70b-instruct",
      };

    // ── Baseten ── $30 crédito
    case "baseten":
      if (!process.env.BASETEN_API_KEY) return null;
      return {
        baseUrl: process.env.BASETEN_BASE_URL || "https://api.baseten.co",
        apiKey: process.env.BASETEN_API_KEY,
        model: process.env.BASETEN_MODEL || "model-qKN1DlpX",
        defaultHeaders: { "X-Agent-Title": "Agent-Sales-Bot" },
      };

    // ── AI21 ── $10 / 3 meses
    case "ai21":
      if (!process.env.AI21_API_KEY) return null;
      return {
        baseUrl: "https://api.ai21.com/studio/v1",
        apiKey: process.env.AI21_API_KEY,
        model: process.env.AI21_MODEL || "jamba-1.5-large",
      };

    // ── Upstage ── $10 / 3 meses
    case "upstage":
      if (!process.env.UPSTAGE_API_KEY) return null;
      return {
        baseUrl: "https://api.upstage.ai/v1/solar",
        apiKey: process.env.UPSTAGE_API_KEY,
        model: process.env.UPSTAGE_MODEL || "solar-pro2",
      };

    // ── Novita ── $0.50 / 1 año
    case "novita":
      if (!process.env.NOVITA_API_KEY) return null;
      return {
        baseUrl: "https://api.novita.ai/v3",
        apiKey: process.env.NOVITA_API_KEY,
        model: process.env.NOVITA_MODEL || "meta-llama/llama-3.1-70b-instruct",
      };

    // ── Nebius ── $1 crédito
    case "nebius":
      if (!process.env.NEBIUS_API_KEY) return null;
      return {
        baseUrl: "https://api.studio.nebius.com/v1",
        apiKey: process.env.NEBIUS_API_KEY,
        model: process.env.NEBIUS_MODEL || "meta-llama/llama-3.3-70b-instruct",
      };

    // ── Alibaba Cloud ── 1M tokens/modelo
    case "alibaba":
      if (!process.env.ALIBABA_API_KEY) return null;
      return {
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: process.env.ALIBABA_API_KEY,
        model: process.env.ALIBABA_MODEL || "qwen-plus",
      };

    // ── Hyperbolic ── $1 crédito
    case "hyperbolic":
      if (!process.env.HYPERBOLIC_API_KEY) return null;
      return {
        baseUrl: "https://api.hyperbolic.xyz/v1",
        apiKey: process.env.HYPERBOLIC_API_KEY,
        model: process.env.HYPERBOLIC_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── SambaNova Cloud ── $5 / 3 meses
    case "sambanova":
      if (!process.env.SAMBANOVA_API_KEY) return null;
      return {
        baseUrl: "https://api.sambanova.ai/v1",
        apiKey: process.env.SAMBANOVA_API_KEY,
        model: process.env.SAMBANOVA_MODEL || "Meta-Llama-3.3-70B-Instruct",
      };

    // ── NLP Cloud ── $15 crédito
    case "nlp_cloud":
      if (!process.env.NLP_CLOUD_API_KEY) return null;
      return {
        baseUrl: "https://api.nlpcloud.io/v1/gpu/",
        apiKey: process.env.NLP_CLOUD_API_KEY,
        model: process.env.NLP_CLOUD_MODEL || "meta-llama-3.1-70b-instruct",
      };

    // ── Modal ── $5/mes (+$30 con método de pago)
    case "modal":
      if (!process.env.MODAL_TOKEN_ID || !process.env.MODAL_TOKEN_SECRET) return null;
      const modalKey = `${process.env.MODAL_TOKEN_ID}:${process.env.MODAL_TOKEN_SECRET}`;
      return {
        baseUrl: process.env.MODAL_BASE_URL || "https://api.modal.com/v1",
        apiKey: modalKey,
        model: process.env.MODAL_MODEL || "meta-llama/Llama-3.3-70B-Instruct",
      };

    // ── Inference.net ── $1 (+$25 por encuesta)
    case "inference_net":
      if (!process.env.INFERENCE_NET_API_KEY) return null;
      return {
        baseUrl: "https://api.inference.net/v1",
        apiKey: process.env.INFERENCE_NET_API_KEY,
        model: process.env.INFERENCE_NET_MODEL || "llama-3.3-70b-instruct",
      };

    // ── Scaleway Generative APIs ── 1M tokens gratis
    case "scaleway":
      if (!process.env.SCALEWAY_API_KEY) return null;
      return {
        baseUrl: "https://api.scaleway.com/generative-api/v1",
        apiKey: process.env.SCALEWAY_API_KEY,
        model: process.env.SCALEWAY_MODEL || "llama-3.3-70b-instruct",
      };

    // ─── ADDITIONAL FREE PROVIDERS ────────────────────────────────────────────

    // ── DeepSeek (open source) ──
    case "deepseek":
      if (!process.env.DEEPSEEK_API_KEY) return null;
      return {
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      };

    // ── Together AI ── $5 gratis al registro
    case "together":
      if (!process.env.TOGETHER_API_KEY) return null;
      return {
        baseUrl: "https://api.together.xyz/v1",
        apiKey: process.env.TOGETHER_API_KEY,
        model: process.env.TOGETHER_MODEL || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
      };

    // ── Perplexity ── $5 gratis al registro
    case "perplexity":
      if (!process.env.PERPLEXITY_API_KEY) return null;
      return {
        baseUrl: "https://api.perplexity.ai",
        apiKey: process.env.PERPLEXITY_API_KEY,
        model: process.env.PERPLEXITY_MODEL || "sonar-pro",
      };

    // ── OpenPipe ── free tier
    case "openpipe":
      if (!process.env.OPENPIPE_API_KEY) return null;
      return {
        baseUrl: "https://api.openpipe.ai/v1",
        apiKey: process.env.OPENPIPE_API_KEY,
        model: process.env.OPENPIPE_MODEL || "openai/gpt-4o-mini",
      };

    // ── G4F (gpt4free) ── 111+ proveedores gratuitos, manejado internamente
    case "g4f":
      return { baseUrl: "__g4f__", apiKey: "__g4f__", model: "__g4f__" };

    default:
      return null;
  }
}

export function getProviderConfigFromSettings(settings: {
  aiProvider?: string;
  githubToken?: string | null;
  githubModel?: string;
  nvidiaApiKey?: string | null;
  nvidiaModel?: string;
  ollamaUrl?: string | null;
  ollamaModel?: string;
  opencodeModel?: string;
}): AIProviderConfig | null {
  // Si no hay proveedor configurado en DB, retornar null para que el caller use su propio fallback
  const provider = settings.aiProvider;
  if (!provider) return null;

  if (provider === "opencode") {
    // Se pasa el modelo guardado en la pantalla de Configuración. Antes se
    // llamaba sin argumento, así que la elección del usuario se ignoraba y
    // siempre mandaba OPENCODE_MODEL del entorno.
    return resolveOpenCodeConfig(settings.opencodeModel || settings.githubModel || undefined);
  }

  if (provider === "mimo") {
    return getProviderConfig("mimo");
  }

  if (provider === "github_copilot_internal") {
    const token = settings.githubToken || process.env.GITHUB_COPILOT_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) return null;
    return {
      baseUrl: "https://api.githubcopilot.com",
      apiKey: token,
      model: settings.githubModel || process.env.GITHUB_MODEL || "gpt-4o",
      defaultHeaders: {
        "Editor-Version": "vscode/1.96.0",
        "Editor-Plugin-Version": "copilot/1.250.0",
        "Openai-Organization": "github-copilot",
        "Copilot-Integration-Id": "vscode-chat",
      }
    };
  }

  if (provider === "github" || provider === "github_claude") {
    const token = settings.githubToken || process.env.GITHUB_TOKEN;
    if (!token) return null;
    return {
      baseUrl: "https://models.inference.ai.azure.com",
      apiKey: token,
      model: settings.githubModel || process.env.GITHUB_MODEL || "gpt-4o-mini",
    };
  }

  if (provider === "nvidia") {
    const token = settings.nvidiaApiKey || process.env.NVIDIA_API_KEY;
    if (!token) return null;
    return {
      baseUrl: "https://integrate.api.nvidia.com/v1",
      apiKey: token,
      model: settings.nvidiaModel || process.env.NVIDIA_MODEL || "meta/llama-3.1-70b-instruct",
    };
  }

  if (provider === "ollama_local") {
    const url = settings.ollamaUrl || process.env.OLLAMA_LOCAL_URL;
    if (!url) return null;
    return {
      baseUrl: url + (url.endsWith("/v1") ? "" : "/v1"),
      apiKey: "ollama",
      model: settings.ollamaModel || process.env.OLLAMA_LOCAL_MODEL || "hermes3:8b",
    };
  }

  if (provider === "openai_default") {
    if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || !process.env.AI_INTEGRATIONS_OPENAI_API_KEY) return null;
    return {
      baseUrl: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      model: settings.githubModel || "gpt-4o",
    };
  }

  // Fallback: intentar con getProviderConfig (soporta 30+ proveedores via env vars)
  const genericConfig = getProviderConfig(provider);
  if (genericConfig) return genericConfig;

  // Proveedor no soportado
  return null;
}

/**
 * Los GPT-5+/Luna de OpenAI son estrictos con los parametros y rechazan con
 * 400 cosas que antes andaban:
 *   - `max_tokens`            -> hay que mandar `max_completion_tokens`
 *   - `temperature` distinta de 1 -> "Unsupported value"
 *   - `presence_penalty` / `frequency_penalty` -> "Unsupported parameter"
 * Medido en vivo el 2026-10-05 contra la clave de production: el chat del bot
 * manda temperature+penalties y decenas de rutas mandan `max_tokens`, asi que
 * sin este saneado TODO call a OpenAI volvia 400 aunque clave y modelo fueran
 * correctos (y ahi rotaba al siguiente proveedor y parecia "400 de OpenAI").
 */
function modeloNuevosGpt(modelo: string): boolean {
  return /gpt-[5-9]|gpt-6|luna/i.test(modelo || "");
}

export function sanearParamsOpenAI(modelo: string, body: any): any {
  if (!body || !modeloNuevosGpt(modelo)) return body;
  const b: any = { ...body };
  if ("max_tokens" in b && !("max_completion_tokens" in b)) {
    b.max_completion_tokens = b.max_tokens;
    delete b.max_tokens;
  }
  if ("presence_penalty" in b) delete b.presence_penalty;
  if ("frequency_penalty" in b) delete b.frequency_penalty;
  if ("temperature" in b && b.temperature !== 1) delete b.temperature;
  return b;
}

/** Sanea proactivamente y, si aun asi la API reclama un parametro, lo saca y reintenta una vez. */
function createSanitized(client: OpenAI): OpenAI {
  const completions = (client as any).chat?.completions;
  if (completions && typeof completions.create === "function") {
    const original = completions.create.bind(completions);
    completions.create = async (body: any, ...rest: any[]) => {
      const saneado = sanearParamsOpenAI(String(body?.model || ""), body);
      try {
        return await original(saneado, ...rest);
      } catch (e: any) {
        const msg = String(e?.message || "");
        if (e?.status === 400 && /Unsupported parameter|Unsupported value|not supported/i.test(msg)) {
          const m = msg.match(/Unsupported parameter: '([^']+)'/i) || msg.match(/Unsupported value: '([^']+)'/i);
          const clave = m?.[1];
          if (clave && clave in saneado) {
            delete saneado[clave];
            return await original(saneado, ...rest);
          }
        }
        throw e;
      }
    };
  }
  return client;
}

export function createAIClient(config: AIProviderConfig): OpenAI {
  return createSanitized(
    new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      defaultHeaders: config.defaultHeaders,
      dangerouslyAllowBrowser: true,
      timeout: 60000, // 60s timeout para prompts con historial extenso
      maxRetries: 1,
    }),
  );
}
