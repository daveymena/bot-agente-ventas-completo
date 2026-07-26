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
  // ── OpenCode Zen (clave OPENCODE_API_KEY, ya configurada) ──────────────────
  { proveedor: "opencode", modelo: "nemotron-3-ultra-free", especialidad: "razonar", estado: "verificado", nota: "el más fiable hoy" },
  { proveedor: "opencode", modelo: "mimo-v2.5-free", especialidad: "general", estado: "agotado" },
  { proveedor: "opencode", modelo: "ling-3.0-flash-free", especialidad: "rapido", estado: "agotado" },
  { proveedor: "opencode", modelo: "big-pickle", especialidad: "general", estado: "agotado" },
  { proveedor: "opencode", modelo: "hy3-free", especialidad: "general", estado: "sin probar" },
  { proveedor: "opencode", modelo: "deepseek-v4-flash-free", especialidad: "rapido", estado: "vacio", nota: "solo reasoning_content" },
  { proveedor: "opencode", modelo: "north-mini-code-free", especialidad: "codigo", estado: "vacio", nota: "no usar en el bucle del operador" },

  // ── Groq (clave GROQ_API_KEY, ya configurada) ── 14.400 req/día ────────────
  { proveedor: "groq", modelo: "llama-3.1-8b-instant", especialidad: "rapido", estado: "verificado", contexto: 131072 },
  { proveedor: "groq", modelo: "llama-3.3-70b-versatile", especialidad: "razonar", estado: "sin probar", contexto: 131072 },
  { proveedor: "groq", modelo: "gemma2-9b-it", especialidad: "rapido", estado: "sin probar" },

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

  // ── Xiaomi MiMo (falta MIMO_API_KEY, de pago) ─────────────────────────────
  { proveedor: "mimo", modelo: "mimo-v2.5-pro", especialidad: "codigo", estado: "sin probar", contexto: 1050000 },
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
