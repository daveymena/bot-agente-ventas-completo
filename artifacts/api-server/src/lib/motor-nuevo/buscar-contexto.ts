/**
 * Buscar contexto relevante en el historial
 *
 * Cuando el cliente menciona algo del pasado ("¿y el color que me dijiste?"),
 * busca dónde se habló de eso y trae ese contexto relevante.
 *
 * Dos estrategias:
 * - A (SIMPLE): por palabras clave y regex
 * - B (INTELIGENTE): por similitud semántica con embeddings
 */

import type { Mensaje } from "./estado-conversacion";

/**
 * A. Búsqueda por palabras clave (rápida, sin costo de API)
 *
 * Extrae palabras del mensaje actual, busca en historial.
 * Devuelve los mensajes más relevantes.
 */
export function buscarPorPalabrassClave(
  historial: Mensaje[],
  mensajeActual: string,
  topN: number = 3,
): Mensaje[] {
  // Extraer palabras clave (>3 caracteres, sin stopwords comunes)
  const stopwords = new Set(["que", "del", "los", "las", "una", "para", "por", "con", "sin", "pero", "como", "sido", "tengo"]);
  const palabras = mensajeActual
    .toLowerCase()
    .split(/\s+/)
    .filter(p => p.length > 3 && !stopwords.has(p))
    .map(p => p.replace(/[^\w]/g, "")); // Limpiar puntuación

  if (palabras.length === 0) return [];

  // Puntuación: cuántas palabras clave aparecen en cada mensaje
  const scored = historial
    .filter(m => m.role === "agent" || m.role === "customer") // Solo conversación
    .map((m, idx) => {
      const matches = palabras.filter(p => m.content.toLowerCase().includes(p)).length;
      return { mensaje: m, score: matches, originalIdx: idx };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored.map(x => x.mensaje);
}

/**
 * B. Búsqueda por similitud semántica (inteligente, costo API)
 *
 * Genera embedding del mensaje actual, busca mensajes con embeddings similares.
 * Requiere que cada mensaje tenga un embedding guardado.
 */
export async function buscarPorSimilitud(
  historial: (Mensaje & { embedding?: number[] })[],
  mensajeActual: string,
  generarEmbedding: (texto: string) => Promise<number[]>,
  topN: number = 3,
): Promise<Mensaje[]> {
  try {
    const embeddingActual = await generarEmbedding(mensajeActual);

    // Calcular similitud coseno con cada mensaje anterior
    const scored = historial
      .filter(m => m.embedding && (m.role === "agent" || m.role === "customer"))
      .map(m => ({
        mensaje: m,
        similitud: cosineSimilarity(embeddingActual, m.embedding!),
      }))
      .sort((a, b) => b.similitud - a.similitud)
      .filter(x => x.similitud > 0.5) // Umbral mínimo
      .slice(0, topN);

    return scored.map(x => x.mensaje);
  } catch (err) {
    console.warn("[buscarContexto] Error en similitud, fallback a palabras clave:", err);
    return buscarPorPalabrassClave(historial, mensajeActual, topN);
  }
}

/** Similitud coseno entre dos vectores */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * Wrapper: elige A o B automáticamente
 *
 * Si los mensajes tienen embeddings, usa B. Si no, usa A.
 */
export async function buscarContextoRelevante(
  historial: (Mensaje & { embedding?: number[] })[],
  mensajeActual: string,
  generarEmbedding?: (texto: string) => Promise<number[]>,
  topN: number = 3,
): Promise<Mensaje[]> {
  const tieneEmbeddings = historial.some(m => m.embedding);

  if (tieneEmbeddings && generarEmbedding) {
    // Opción B: semántica
    return await buscarPorSimilitud(historial, mensajeActual, generarEmbedding, topN);
  } else {
    // Opción A: palabras clave (default)
    return buscarPorPalabrassClave(historial, mensajeActual, topN);
  }
}
