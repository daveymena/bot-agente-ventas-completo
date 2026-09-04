/**
 * ============================================================
 * CONVERSATION LEARNING — Motor de aprendizaje del agente
 * ============================================================
 * El agente no es un bot de respuestas: es un sistema que APRENDE.
 *
 * Ciclo (se ejecuta en cada turno de runAgentReply):
 *   1. EVALUAR el intercambio anterior: la respuesta del agente vs. lo que
 *      el cliente contestó después. ¿Lo entendió? ¿Repitió la pregunta?
 *      ¿Se frustró? ¿Se fue? ¿Avanzó hacia la compra?
 *   2. APRENDER: si hubo una señal de fallo, guardar una lección en la
 *      memoria del negocio (architect_memory) con tags para recuperarla.
 *   3. ADAPTAR: antes de responder, recuperar las lecciones relevantes de
 *      conversaciones anteriores e inyectarlas en el prompt para NO repetir
 *      el error y probar otra alternativa.
 *
 * Así el sistema mejora solo: cada error queda registrado, analizado y
 * usado como insumo de la próxima respuesta.
 */

import { db } from "@workspace/db";
import { architectMemoryService } from "./architect-memory-service";
import { logger } from "./logger";

// ── Clasificación del resultado de un intercambio ────────────────────────────

export type ExchangeOutcome =
  | "sale_progress"      // avanzó hacia la compra (preguntó precio/pago/compra)
  | "positive"           // respuesta bien recibida (gracias, ok, sigue interesado)
  | "customer_confused"  // no entendió: repite la pregunta o pide aclaración
  | "customer_frustrated"// se frustró: se queja, dice que no responde, "eres un robot"
  | "customer_left"      // se fue sin comprar tras la respuesta
  | "no_signal";         // no se puede evaluar (sin datos suficientes)

export interface ExchangeEvaluation {
  outcome: ExchangeOutcome;
  signals: string[];
  /** Mensaje del cliente que evaluamos (el que llegó DESPUÉS de la respuesta). */
  customerMsg: string;
  /** Respuesta del agente que estamos evaluando. */
  agentReply: string;
  productName?: string | null;
}

// ── Señales ──────────────────────────────────────────────────────────────────

const CONFUSION_PATTERNS = [
  "no entend", "no entiendo", "no te entend", "no comprend",
  "no es lo que pregunt", "no era eso", "no es eso", "no me refiero",
  "qué significa", "que significa", "cómo así", "como asi",
  "explica", "repit", "otra vez", "de nuevo",
  "no es lo que dije", "no me explico",
  "no te explicas", "repetime", "repiteme", "no capto",
  "me perdí", "me perdi", "no te sigo", "no entiendo nada",
  "no me quedó claro", "no me quedo claro", "no se refiere",
];

const FRUSTRATION_PATTERNS = [
  "no me sirve", "no me ayudas", "no me ayuda", "eres un robot", "eres una maquina",
  "estoy cansado", "molesto", "frustrado", "pésimo", "pesimo", "mal servicio",
  "no sirves para nada", "inútil", "inutil", "que inepto", "cambia de agente",
  "quiero hablar con una persona", "quiero un humano", "me estás dando vueltas",
  "das vueltas", "no me das solución", "no me das solucion", "basta ya",
  "no te pido eso", "que desperdicio", "perdiendo el tiempo", "me haces perder",
  "nada que ver", "no tiene sentido lo que dices", "no tiene sentido lo que decis",
  "no me respond", "no respondes", "no contestas", "no me contestas", "no me respondes",
];

const SALE_PROGRESS_PATTERNS = [
  "cuánto cuesta", "cuanto cuesta", "cómo pago", "como pago", "quiero comprar",
  "quiero pagar", "dame el link", "dame el enlace", "pásame el link", "pasame el link",
  "métodos de pago", "metodos de pago", "hacer el pago", "me interesa comprar",
  "quiero llevarlo", "cómo lo pago", "como lo pago", "cuál es el precio", "cual es el precio",
  "precio", "pagó", "pago ahora", "procede", "listo pago", "dónde pago", "donde pago",
  "nequi", "daviplata", "transferencia", "mercadopago", "paypal", "tarjeta",
];

const LEFT_PATTERNS = [
  "chao", "bye", "adiós", "adios", "hasta luego", "nos vemos", "gracias igual",
  "no me interesa", "no gracias", "no me escribas", "déjame en paz", "dejame en paz",
  "no quiero saber", "ya no", "después", "despues", "luego hablamos", "me voy",
];

const POSITIVE_PATTERNS = [
  "gracias", "perfecto", "genial", "excelente", "ok", "okey", "okay", "dale",
  "bueno", "claro", "súper", "super", "me gusta", "me encanta", "anotado",
  "listo", "entendido", "de acuerdo", "perfect", "great",
];

/** Normaliza un texto para comparar: minúsculas, sin puntuación, tokens únicos. */
function normalizeTokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-záéíóúñü0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/** Similitud de Jaccard entre dos mensajes (para detectar repetición). */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = normalizeTokens(a);
  const tb = normalizeTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/**
 * Evalúa el intercambio: la respuesta del agente vs. lo que el cliente
 * respondió después (customerMsg). `prevCustomerMsg` es el mensaje del
 * cliente ANTERIOR (para detectar que repitió la misma pregunta).
 */
export function analyzeExchange(
  customerMsg: string,
  prevCustomerMsg: string | null,
  agentReply: string,
  productName?: string | null,
): ExchangeEvaluation {
  const t = customerMsg.toLowerCase();
  const signals: string[] = [];

  // 1. Repetición de la pregunta → confusión (la señal más fuerte).
  if (prevCustomerMsg && prevCustomerMsg.trim().length > 8) {
    const sim = jaccardSimilarity(prevCustomerMsg, customerMsg);
    if (sim >= 0.55) {
      signals.push(`repitió la pregunta (similitud ${Math.round(sim * 100)}%)`);
      return { outcome: "customer_confused", signals, customerMsg, agentReply, productName };
    }
  }

  // 2. Frustración ANTES que confusión: un cliente frustrado suele estar
  //    también confundido, y la respuesta correcta es la de frustración
  //    (disculpa + solución concreta), no una re-explicación.
  if (FRUSTRATION_PATTERNS.some((p) => t.includes(p))) {
    signals.push("marcadores de frustración");
    return { outcome: "customer_frustrated", signals, customerMsg, agentReply, productName };
  }

  // 3. Confusión explícita.
  if (CONFUSION_PATTERNS.some((p) => t.includes(p))) {
    signals.push("marcadores de confusión");
    return { outcome: "customer_confused", signals, customerMsg, agentReply, productName };
  }

  // 4. Avance de venta (preguntó precio/pago/compra).
  if (SALE_PROGRESS_PATTERNS.some((p) => t.includes(p))) {
    signals.push("avanzó hacia la compra");
    return { outcome: "sale_progress", signals, customerMsg, agentReply, productName };
  }

  // 5. Se fue sin comprar.
  if (LEFT_PATTERNS.some((p) => t.includes(p))) {
    signals.push("se despidió / pospuso");
    return { outcome: "customer_left", signals, customerMsg, agentReply, productName };
  }

  // 6. Respuesta positiva.
  if (POSITIVE_PATTERNS.some((p) => t.includes(p))) {
    signals.push("respuesta positiva");
    return { outcome: "positive", signals, customerMsg, agentReply, productName };
  }

  return { outcome: "no_signal", signals, customerMsg, agentReply, productName };
}

// ── Guardar y recuperar lecciones ────────────────────────────────────────────

export interface Lesson {
  tenantId: number;
  productName?: string | null;
  intent?: string | null;
  outcome: ExchangeOutcome;
  /** Qué respondió el agente (para no repetirlo). */
  agentReply: string;
  /** Qué dijo el cliente que evidenció el problema. */
  customerMsg: string;
  /** Qué se debería hacer distinto (generado por el propio sistema). */
  recommendation: string;
  /** Alternativas probadas o a probar. */
  alternatives?: string[];
}

/** Genera una recomendación accionable según el tipo de fallo. */
export function buildRecommendation(evalResult: ExchangeEvaluation): string {
  const { outcome, productName } = evalResult;
  switch (outcome) {
    case "customer_confused":
      return productName
        ? `El cliente no entendió la respuesta sobre "${productName}". Volver a explicar en términos MUY simples, con el precio y la entrega claros, y preguntar UNA sola cosa concreta. No repetir la misma explicación con otras palabras.`
        : "El cliente no entendió la respuesta. Simplificar: frases cortas, un solo tema, y confirmar si quedó claro.";
    case "customer_frustrated":
      return "El cliente está frustrado. Disculparse de forma genuina y breve, dejar de dar vueltas, y ofrecer UNA solución concreta inmediata (precio exacto, link de pago o pasar a un humano).";
    case "customer_left":
      return "El cliente se fue sin comprar. Revisar si la respuesta anterior dejó la puerta cerrada: evitar presión, dejar el precio y la oferta claros y una invitación abierta a volver.";
    case "sale_progress":
      return "El cliente avanzó hacia la compra. Mantener el impulso: confirmar datos, dar el siguiente paso (link de pago) sin demoras.";
    case "positive":
      return "El cliente respondió bien. Mantener el tono y avanzar un paso más en la venta.";
    default:
      return "";
  }
}

/**
 * Guarda una lección en la memoria del negocio. Fire-and-forget seguro:
 * si la memoria falla, nunca debe bloquear la respuesta al cliente.
 */
export async function recordLesson(lesson: Lesson): Promise<void> {
  try {
    const tags = [
      "lesson",
      `outcome:${lesson.outcome}`,
      ...(lesson.productName ? [`product:${lesson.productName.toLowerCase()}`] : []),
      ...(lesson.intent ? [`intent:${lesson.intent}`] : []),
    ];
    await architectMemoryService.recordLearning(
      lesson.tenantId,
      "reflection",
      `Lección: ${lesson.outcome}${lesson.productName ? ` — ${lesson.productName}` : ""}`,
      `Fallo detectado: ${lesson.customerMsg.slice(0, 180)}\n` +
        `El agente respondió: ${lesson.agentReply.slice(0, 180)}\n` +
        `Recomendación: ${lesson.recommendation}`,
      tags,
      { source: "conversation_learning", outcome: lesson.outcome, alternatives: lesson.alternatives ?? [] },
    );
    logger.info({ tenantId: lesson.tenantId, outcome: lesson.outcome, tags }, "[Learning] Lección guardada");
  } catch (err) {
    logger.warn({ err }, "[Learning] No se pudo guardar la lección (no bloquea la respuesta)");
  }
}

export interface LessonRef {
  title: string;
  content: string;
  tags: string[];
  outcome: ExchangeOutcome;
  productName?: string | null;
}

/**
 * Recupera lecciones relevantes para adaptar la próxima respuesta.
 * Prioriza: lecciones del MISMO producto y del MISMO tipo de fallo.
 */
export async function retrieveLessons(
  tenantId: number,
  opts?: { productName?: string | null; outcome?: ExchangeOutcome; limit?: number },
): Promise<LessonRef[]> {
  try {
    // retrieveRelevantMemories busca con LIKE sobre el CONTENIDO (no el
    // título). El contenido de una lección incluye el mensaje del cliente,
    // así que el nombre del producto aparece ahí cuando se mencionó.
    const query = opts?.productName?.trim() ? opts.productName.trim().toLowerCase().slice(0, 40) : "";
    const memories = await architectMemoryService.retrieveRelevantMemories(tenantId, query, 30);
    const lessons: LessonRef[] = memories
      .filter((m: any) => m.tags?.includes("lesson"))
      .map((m: any) => ({
        title: m.title,
        content: m.content,
        tags: m.tags ?? [],
        outcome: (m.metadata?.outcome as ExchangeOutcome) ?? "no_signal",
        productName: (m.tags as string[])?.find((t) => t.startsWith("product:"))?.replace("product:", "") ?? null,
      }));

    // Ordenar: misma lección de producto, luego por relevancia del outcome.
    const target = opts?.outcome;
    const scored = lessons.map((l) => {
      let score = 0;
      if (opts?.productName && l.productName === opts.productName.toLowerCase()) score += 3;
      if (target && l.outcome === target) score += 2;
      if (l.outcome === "customer_confused" || l.outcome === "customer_frustrated") score += 1;
      return { l, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, opts?.limit ?? 4).map((s) => s.l);
  } catch (err) {
    logger.warn({ err }, "[Learning] No se pudieron recuperar lecciones");
    return [];
  }
}

/**
 * Formatea las lecciones para inyectarlas en el prompt del agente.
 * Devuelve string vacío si no hay lecciones (para no inflar el prompt).
 */
export function formatLessonsForPrompt(lessons: LessonRef[], maxChars = 900): string {
  if (lessons.length === 0) return "";
  const header = "🧠 APRENDIZAJE DE CONVERSACIONES ANTERIORES (útil para no repetir errores):";
  const lines = lessons.map((l) => {
    const tipo = l.outcome === "customer_confused" ? "confusión" : l.outcome === "customer_frustrated" ? "frustración" : l.outcome === "customer_left" ? "abandono" : "avance";
    const rec = l.content.split("Recomendación:")[1]?.trim() || l.content.slice(0, 140);
    return `• (lección previa: ${tipo}) ${rec.slice(0, 200)}`;
  });
  let out = `${header}\n${lines.join("\n")}`;
  if (out.length > maxChars) out = out.slice(0, maxChars) + "…";
  return out;
}

/**
 * Función principal de aprendizaje por turno: evalúa el intercambio
 * anterior (respuesta del agente + reacción del cliente) y, si hubo un
 * fallo, guarda la lección. Se llama al inicio de cada turno.
 */
export async function learnFromLastExchange(params: {
  tenantId: number;
  customerMsg: string;
  prevCustomerMsg: string | null;
  agentReply: string;
  productName?: string | null;
  intent?: string | null;
}): Promise<ExchangeEvaluation | null> {
  const evaluation = analyzeExchange(
    params.customerMsg,
    params.prevCustomerMsg,
    params.agentReply,
    params.productName,
  );

  // Solo se aprende de los fallos (y de los avances de venta para reforzar).
  if (evaluation.outcome === "no_signal" || evaluation.outcome === "positive") {
    return null;
  }

  await recordLesson({
    tenantId: params.tenantId,
    productName: params.productName,
    intent: params.intent,
    outcome: evaluation.outcome,
    agentReply: params.agentReply,
    customerMsg: params.customerMsg,
    recommendation: buildRecommendation(evaluation),
  });
  return evaluation;
}
