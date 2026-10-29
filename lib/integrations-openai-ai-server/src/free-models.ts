/**
 * Registro de modelos GRATUITOS con su especialidad.
 *
 * Cada modelo sirve para cosas distintas: unos razonan, otros son rápidos,
 * otros leen imágenes. Este registro permite pedir "el mejor gratis para
 * razonar" en vez de fijar un modelo a mano y que se agote su cuota.
 *
 * ESTADO DE VERIFICACIÓN — importante para no prometer de más:
 *   "verificado"  = probado contra la API real el 2026-07-26 y devolvió texto
 *   "sin probar"  = el proveedor lo documenta pero aquí no hay clave para probarlo
 *   "agotado"     = ese día devolvía 429; la cuota se restablece
 *   "vacio"       = responde 200 pero sin content (modelo de razonamiento puro)
 */

export type Especialidad = "razonar" | "rapido" | "vision" | "codigo" | "general";
export type Estado = "verificado" | "sin probar" | "agotado" | "vacio";

export interface ModeloLibre {
  proveedor: string;      // clave para getProviderConfig()
  modelo: string;         // id tal cual lo espera la API
  especialidad: Especialidad;
  estado: Estado;
  contexto?: number;      // tokens de ventana
  nota?: string;
}

export const MODELOS_LIBRES: ModeloLibre[] = [
  // ── OpenCode Zen (clave OPENCODE_API_KEY) ─────────────────────────────────
  // Barrido completo del catálogo el 2026-07-26 con max_tokens=2000: los 7
  // responden. Tiempos medidos en esa prueba.
  //
  // ⚠️ max_tokens IMPORTA: con 20-30 tokens, los modelos de razonamiento
  // agotan el presupuesto "pensando" y devuelven content vacío. Aparentan
  // estar rotos y no lo están. Pide 2000 o más.
  { proveedor: "opencode", modelo: "gpt-5.6-luna", especialidad: "general", estado: "verificado", nota: "modelo actual disponible" },
  { proveedor: "opencode", modelo: "gpt-5.6-sol", especialidad: "razonar", estado: "verificado", nota: "modelo actual disponible" },
  { proveedor: "opencode", modelo: "gpt-5.6-terra", especialidad: "rapido", estado: "verificado", nota: "modelo actual disponible" },

  // ── Excelnt (puente del dueño, 2026-10-06) ── gateway https://excelnt.ai/v1
  // "GPT 6 Astra" es el recomendado por su propia documentación para código.
  // Estado "sin probar": falta la key (se crea en la extensión de VS Code)
  // para verificar contra la API real y pasarlos a "verificado".
  { proveedor: "excelnt", modelo: "gpt-6-astra", especialidad: "general", estado: "sin probar", nota: "recomendado por Excelnt para código" },

  // ── Groq (clave GROQ_API_KEY, ya configurada) ── 14.400 req/día ────────────
  // ⚠️ Catalogo contrastado contra su API el 2026-08-27: los llama-3.x y
  // gemma2 que habia aca YA NO EXISTEN en Groq. Apuntar ahi era un 404
  // silencioso -- el proveedor "estaba configurado" y no respondia nunca.
  //
  // El 120b y el qwen se probaron con una pregunta trampa de venta: los dos
  // contestaron en colombiano y ninguno invento capacidades del producto.
  { proveedor: "groq", modelo: "openai/gpt-oss-120b", especialidad: "razonar", estado: "verificado", nota: "el mayor de Groq" },
  { proveedor: "groq", modelo: "qwen/qwen3.8-27b", especialidad: "general", estado: "verificado" },
  { proveedor: "groq", modelo: "openai/gpt-oss-20b", especialidad: "rapido", estado: "verificado" },
  { proveedor: "groq", modelo: "groq/compound-mini", especialidad: "rapido", estado: "sin probar" },

  // ── OpenRouter (falta OPENROUTER_API_KEY real) ── 20 req/min · 50 req/día ──
  { proveedor: "openrouter", modelo: "nvidia/nemotron-3-ultra-550b-a55b:free", especialidad: "razonar", estado: "sin probar", contexto: 1000000 },
  { proveedor: "openrouter", modelo: "google/gemma-4-31b-it:free", especialidad: "vision", estado: "sin probar", contexto: 262144 },
  { proveedor: "openrouter", modelo: "nvidia/nemotron-nano-12b-v2-vl:free", especialidad: "vision", estado: "sin probar", contexto: 128000 },
  { proveedor: "openrouter", modelo: "openai/gpt-oss-20b:free", especialidad: "general", estado: "sin probar", contexto: 131072 },
  { proveedor: "openrouter", modelo: "cohere/north-mini-code:free", especialidad: "codigo", estado: "sin probar", contexto: 256000 },
  { proveedor: "openrouter", modelo: "inclusionai/ling-3.0-flash:free", especialidad: "rapido", estado: "sin probar", contexto: 262144 },

  // ── Google AI Studio (falta GOOGLE_API_KEY) ── 250k tokens/min ────────────
  { proveedor: "google_ai_studio", modelo: "gemini-2.5-flash", especialidad: "rapido", estado: "sin probar" },
  { proveedor: "google_ai_studio", modelo: "gemini-2.5-flash", especialidad: "vision", estado: "sin probar", nota: "multimodal" },

  // ── Cerebras (falta CEREBRAS_API_KEY) ── 5 req/min · 1M tokens/hora ───────
  { proveedor: "cerebras", modelo: "gpt-oss-120b", especialidad: "razonar", estado: "sin probar" },
  { proveedor: "cerebras", modelo: "gemma-4-31b", especialidad: "general", estado: "sin probar" },

  // ── Cohere (falta COHERE_API_KEY) ── 20 req/min · 1.000 req/mes ───────────
  { proveedor: "cohere", modelo: "command-a-03-2025", especialidad: "general", estado: "sin probar" },

  // ── NVIDIA NIM (clave NVIDIA_API_KEY) ── 40 req/min ───────────────────────
  { proveedor: "nvidia_nim", modelo: "meta/llama-3.1-70b-instruct", especialidad: "razonar", estado: "sin probar" },

  // ── Ollama Cloud ── modelos grandes con cuota diaria gratis ───────────────
  // Los nombres llevan el sufijo "-cloud": es como los expone su API, y sin el
  // sufijo responde 404.
  //
  // ⚠️ ESTE CATÁLOGO ROTA. La primera versión de esta lista se escribió con los
  // nombres de la documentación (gpt-oss:120b-cloud, deepseek-v3.1:671b-cloud,
  // qwen3-coder:480b-cloud) y al contrastarla contra el servidor el 2026-08-26
  // NINGUNO existía ya: el sufijo "-cloud" desapareció de los ids, y deepseek
  // v3.1 y qwen3-coder salieron de la nube (ahora hay v4 y qwen3.5).
  //
  // Por eso acá se prefieren los nombres SIN etiqueta de versión: los que
  // llevan fecha (":0813") o ":preview" caducan antes. Y por eso la pantalla
  // de Configuración pregunta la lista en vivo -- ver GET /api/ai/models.
  //
  // Ids verificados contra https://ollama.com/v1/models el 2026-08-26.
  // "sin probar" porque responder requiere clave, y todavía no hay una: lo
  // confirmado es que el modelo EXISTE, no cómo responde.
  { proveedor: "ollama_cloud", modelo: "nemotron-3-ultra", especialidad: "razonar", estado: "sin probar" },
  { proveedor: "ollama_cloud", modelo: "gpt-oss:120b", especialidad: "razonar", estado: "sin probar" },
  { proveedor: "ollama_cloud", modelo: "glm-5.3-flash", especialidad: "rapido", estado: "sin probar" },
  { proveedor: "ollama_cloud", modelo: "gpt-oss:20b", especialidad: "rapido", estado: "sin probar" },
  { proveedor: "ollama_cloud", modelo: "kimi-k2.7-code", especialidad: "codigo", estado: "sin probar" },
  { proveedor: "ollama_cloud", modelo: "minimax-m3", especialidad: "general", estado: "sin probar" },

  // ── Xiaomi MiMo (falta MIMO_API_KEY, de pago) ─────────────────────────────
  { proveedor: "mimo", modelo: "mimo-v2.5-pro", especialidad: "codigo", estado: "sin probar", contexto: 1050000 },

  // ═══ PROVEEDORES DE PAGO ═══════════════════════════════════════════════════
  // Lista INICIAL para poder elegir sin tener clave todavía. Los catálogos
  // cambian rápido: en cuanto pongas la clave, usa «descubrir modelos» y la
  // pantalla se queda con los ids reales del proveedor.

  // ── OpenAI (ChatGPT) ──
  { proveedor: "openai", modelo: "gpt-6-astra", especialidad: "razonar", estado: "sin probar", contexto: 1050000 },
  { proveedor: "openai", modelo: "gpt-5.6-sol", especialidad: "general", estado: "sin probar", contexto: 1050000 },
  { proveedor: "openai", modelo: "gpt-5.6-terra", especialidad: "general", estado: "sin probar", contexto: 1050000 },
  { proveedor: "openai", modelo: "gpt-5.6-luna", especialidad: "rapido", estado: "sin probar", contexto: 1050000, nota: "multimodal" },

  // ── Anthropic (Claude) ──
  { proveedor: "anthropic", modelo: "claude-sonnet-4-20250514", especialidad: "razonar", estado: "sin probar", contexto: 200000 },
  { proveedor: "anthropic", modelo: "claude-opus-4-20250514", especialidad: "codigo", estado: "sin probar", contexto: 200000 },
  { proveedor: "anthropic", modelo: "claude-3-5-haiku-20241022", especialidad: "rapido", estado: "sin probar" },

  // ── Google Gemini (de pago; la capa gratis está más arriba) ──
  { proveedor: "google_ai_studio", modelo: "gemini-2.5-pro", especialidad: "razonar", estado: "sin probar", contexto: 1048576 },

  // ── DeepSeek ──
  { proveedor: "deepseek", modelo: "deepseek-chat", especialidad: "general", estado: "sin probar", contexto: 64000 },
  { proveedor: "deepseek", modelo: "deepseek-reasoner", especialidad: "razonar", estado: "sin probar" },

  // ── xAI (Grok) ──
  { proveedor: "xai", modelo: "grok-2-latest", especialidad: "general", estado: "sin probar" },
  { proveedor: "xai", modelo: "grok-2-vision-latest", especialidad: "vision", estado: "sin probar" },

  // ── Mistral ──
  { proveedor: "mistral", modelo: "mistral-large-latest", especialidad: "razonar", estado: "sin probar" },
  { proveedor: "mistral", modelo: "mistral-small-latest", especialidad: "rapido", estado: "sin probar" },
  { proveedor: "mistral", modelo: "codestral-latest", especialidad: "codigo", estado: "sin probar" },

  // ── Together AI ──
  { proveedor: "together", modelo: "meta-llama/Llama-3.3-70B-Instruct-Turbo", especialidad: "general", estado: "sin probar" },
  { proveedor: "together", modelo: "Qwen/Qwen2.5-Coder-32B-Instruct", especialidad: "codigo", estado: "sin probar" },

  // ── Perplexity ── responde citando fuentes de la web
  { proveedor: "perplexity", modelo: "sonar", especialidad: "rapido", estado: "sin probar" },
  { proveedor: "perplexity", modelo: "sonar-pro", especialidad: "razonar", estado: "sin probar" },

  // ── Fireworks / DeepInfra / Nebius / SambaNova (modelos abiertos) ──
  { proveedor: "fireworks", modelo: "accounts/fireworks/models/llama-v3p3-70b-instruct", especialidad: "general", estado: "sin probar" },
  { proveedor: "deepinfra", modelo: "meta-llama/Llama-3.3-70B-Instruct", especialidad: "general", estado: "sin probar" },
  { proveedor: "nebius", modelo: "meta-llama/Llama-3.3-70B-Instruct", especialidad: "general", estado: "sin probar" },
  { proveedor: "sambanova", modelo: "Meta-Llama-3.3-70B-Instruct", especialidad: "rapido", estado: "sin probar" },

  // ── Moonshot (Kimi) / Zhipu (GLM) / Alibaba (Qwen) ──
  { proveedor: "moonshot", modelo: "kimi-k2-0905-preview", especialidad: "razonar", estado: "sin probar" },
  { proveedor: "zhipu", modelo: "glm-4-plus", especialidad: "general", estado: "sin probar" },
  { proveedor: "qwen", modelo: "qwen-plus", especialidad: "general", estado: "sin probar" },
  { proveedor: "qwen", modelo: "qwen-vl-plus", especialidad: "vision", estado: "sin probar" },
];

/** Modelos utilizables para una especialidad, mejores primero. */
export function modelosPara(esp: Especialidad, incluirSinProbar = true): ModeloLibre[] {
  const orden: Record<Estado, number> = { verificado: 0, "sin probar": 1, agotado: 2, vacio: 9 };
  return MODELOS_LIBRES.filter(
    (m) =>
      m.especialidad === esp &&
      m.estado !== "vacio" && // nunca: rompen el bucle de herramientas
      (incluirSinProbar || m.estado === "verificado"),
  ).sort((a, b) => orden[a.estado] - orden[b.estado]);
}

/** Resumen por especialidad, para mostrarlo en la pantalla de Configuración. */
export function resumenPorEspecialidad(): Record<Especialidad, number> {
  const r = { razonar: 0, rapido: 0, vision: 0, codigo: 0, general: 0 } as Record<Especialidad, number>;
  for (const m of MODELOS_LIBRES) if (m.estado !== "vacio") r[m.especialidad]++;
  return r;
}
