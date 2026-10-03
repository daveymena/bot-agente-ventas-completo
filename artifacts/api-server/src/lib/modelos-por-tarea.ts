/**
 * QUÉ MODELO HACE QUÉ
 * ===================
 *
 * Pedido del dueño (24-09-2026): "distribuyamos bien las responsabilidades
 * según las habilidades de cada modelo, para que trabajen en conjunto y
 * sostengamos más tiempo los tokens y gastos". Hasta acá cada subsistema
 * tenía su propia cadena y DeepSeek hacía casi todo.
 *
 * Los modelos del Ollama de EasyPanel (`OLLAMA_LOCAL_URL`, cuenta GRATIS de
 * Ollama Cloud: `qwen3.5` responde 402 "no incluido en tu uso gratuito") se
 * midieron con tareas reales del negocio (scripts/medir-modelos.ts):
 *
 *   tarea                    DeepSeek          gemma4:31b         gpt-oss:120b     gpt-oss:20b
 *   venta física (6 turnos)  2,2 s ✅          1,7 s ✅           4,1 s, se colgó  —
 *   objeciones (5 turnos)    1,3 s ✅          1,0 s ✅ (1 corte) —                —
 *   intención (8 casos)      8/8 · 0,80 s      8/8 · 0,57 s       8/8 · 0,78 s     8/8 · 2,2 s
 *   redacción landing        1,4 s ✅          1,2 s ✅           1,8 s ✅          3,4 s ✅
 *   leer una foto            ❌ no lee          ✅ 4,4 s           ❌                ❌
 *
 * De ahí sale el reparto de abajo. Ollama va PRIMERO porque es gratis, y el
 * resto de la cadena de siempre queda detrás como respaldo automático: si
 * Ollama se corta (tope de 5 s del proveedor `ollama_local`), se queda sin
 * cuota (429) o el modelo no está en el plan (402), la rotación lo aparta un
 * rato y el turno sigue con DeepSeek sin que el cliente lo note.
 *
 * Cambiar el reparto NO requiere código: `IA_<TAREA>` en el entorno, con los
 * modelos de Ollama separados por coma, o `off` para apagar Ollama en esa
 * tarea. Ej.: `IA_VENDEDOR=off` vuelve el vendedor a DeepSeek al instante.
 */
import type { AIProviderConfig } from "@workspace/integrations-openai-ai-server";

export type Tarea = "vendedor" | "intencion" | "redaccion" | "vision" | "fondo";

/** El reparto medido. Solo modelos de Ollama: lo demás es la cadena de siempre. */
export const REPARTO: Record<Tarea, string[]> = {
  // La venta: rápido y con herramientas. gpt-oss:120b se cuelga en el bucle
  // de herramientas (4,1 s de mediana, 2 turnos sin respuesta): afuera.
  // GLM-5.3 entra de segundo (03-10-2026): el /test en producción midió
  // 538 ms vivo y el turno con solo gemma4 se quedó MUDO cuando gemma4
  // devolvió respuesta vacía — el vendedor necesita un segundo intento
  // ANTES de caer en la cadena larga.
  vendedor: ["gemma4:31b-cloud", "glm-5.3"],
  // "¿Es un sí?", "¿qué quiere?": el más rápido que acertó 8/8.
  intencion: ["gemma4:31b-cloud"],
  // Landings, anuncios, fichas: acá la latencia importa poco y gpt-oss:120b
  // redacta con más detalle; gemma de segundo.
  redaccion: ["gpt-oss:120b-cloud", "gemma4:31b-cloud"],
  // El ÚNICO que lee imágenes (comprobantes, fichas desde fotos).
  vision: ["gemma4:31b-cloud"],
  // Reportes, auto-reflexión: sin apuro; el más chico primero para cuidar la cuota.
  fondo: ["gpt-oss:20b-cloud", "gemma4:31b-cloud"],
};

/** Los modelos de Ollama para esta tarea, según el entorno o el reparto medido. */
export function modelosDe(tarea: Tarea): string[] {
  const env = process.env[`IA_${tarea.toUpperCase()}`];
  if (env !== undefined) {
    const v = env.trim();
    if (!v || v.toLowerCase() === "off") return [];
    return v.split(",").map((m) => m.trim()).filter(Boolean);
  }
  return REPARTO[tarea];
}

/** Configuración lista para `createAIClient`, o [] si no hay Ollama configurado. */
export function candidatosDeOllama(tarea: Tarea): Array<{ config: AIProviderConfig; source: string }> {
  const url = String(process.env.OLLAMA_LOCAL_URL || "").trim().replace(/\/+$/, "");
  if (!url) return [];
  const baseUrl = url.endsWith("/v1") ? url : `${url}/v1`;
  // `ollama_local/…`: el prefijo es el proveedor para la rotación (tope de
  // 5 s y enfriamiento en optimized-rotation.ts). Con otro nombre caía al
  // tope por defecto de 3 s y se cortaban respuestas buenas.
  return modelosDe(tarea).map((model) => ({ config: { baseUrl, apiKey: "ollama", model }, source: `ollama_local/${model}` }));
}
