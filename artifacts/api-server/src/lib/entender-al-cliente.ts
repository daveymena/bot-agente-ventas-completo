/**
 * ============================================================
 * ENTENDER AL CLIENTE — cerebro semántico del agente WhatsApp
 * ============================================================
 *
 * Este módulo NO redacta la respuesta ni decide hechos comerciales.
 * Su trabajo es entender qué quiere decir el cliente teniendo en cuenta
 * conversación, producto en foco y lo que el vendedor ya respondió.
 *
 * Regla principal:
 *   la pregunta explícita del cliente tiene prioridad sobre cualquier
 *   objetivo comercial secundario.
 *
 * Importante: NO usamos un modelo de razonamiento lento para cada mensaje.
 * Esta capa necesita responder rápido. Si una conversación es realmente
 * ambigua, el caller puede escalarla a un razonador; una pregunta simple como
 * "precio", "qué vale" o "en cuánto queda" nunca debe pagar 20–30 segundos.
 */

import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export type IntencionEntendida =
  | "greeting"
  | "product_query"
  | "details_query"
  | "payment_intent"
  | "objection"
  | "confirmation"
  | "human_handoff"
  | "leaving"
  | "general";

/** Subintención semántica: permite entender mejor sin romper el contrato viejo. */
export type Subintencion =
  | "price_question"
  | "content_question"
  | "delivery_question"
  | "access_question"
  | "guarantee_question"
  | "duration_question"
  | "support_question"
  | "payment_method_question"
  | "payment_execution"
  | "payment_confirmation"
  | "discount_request"
  | "objection_price"
  | "objection_trust"
  | "objection_time"
  | "reformulation"
  | "general_question"
  | null;

export interface Entendimiento {
  intencion: IntencionEntendida;
  productoId: number | null;
  /** Qué está esperando el cliente AHORA. */
  esperando: string;
  /** Preguntas explícitas que siguen sin respuesta. */
  preguntas: string[];
  pideRebaja: boolean;
  dicePago: boolean;
  preguntaPorElBot: boolean;
  confianza: number;

  /** Comprensión más fina que no rompe las intenciones existentes. */
  subintencion: Subintencion;
  /** true si el cliente está reformulando algo que el vendedor no respondió. */
  reformulaPregunta: boolean;
  /** true si el último turno del vendedor no resolvió la necesidad actual. */
  respuestaAnteriorFallida: boolean;
  /** true si conviene responder directamente y NO intentar vender/cerrar. */
  responderDirectamente: boolean;
  /** Acciones comerciales que el modelo considera inapropiadas para este turno. */
  evitar: string[];
}

const INTENCIONES: IntencionEntendida[] = [
  "greeting", "product_query", "details_query", "payment_intent",
  "objection", "confirmation", "human_handoff", "leaving", "general",
];

const SUBINTENCIONES: Subintencion[] = [
  "price_question", "content_question", "delivery_question", "access_question",
  "guarantee_question", "duration_question", "support_question",
  "payment_method_question", "payment_execution", "payment_confirmation",
  "discount_request", "objection_price", "objection_trust", "objection_time",
  "reformulation", "general_question", null,
];

export interface EntradaEntender {
  mensaje: string;
  historial: Array<{ role: string; content: string }>;
  catalogo: Array<{ id: number; name?: string | null }>;
  productoEnFocoId?: number | null;
}

function construirPrompt(e: EntradaEntender): string {
  const catalogo = e.catalogo
    .slice(0, 100)
    .map((p) => `${p.id}: ${String(p.name || "").slice(0, 100)}`)
    .join("\n");

  // Más contexto, pero acotado. El objetivo es comprender continuidad, no
  // mandar cientos de mensajes al modelo en cada turno.
  const historial = (e.historial || [])
    .slice(-16)
    .map((m) => `${m.role === "customer" ? "CLIENTE" : "VENDEDOR"}: ${String(m.content || "").slice(0, 450)}`)
    .join("\n");

  return [
    "Eres el cerebro de comprensión de un vendedor profesional por WhatsApp en Colombia.",
    "NO redactes una respuesta. NO vendas. NO inventes datos.",
    "Tu única tarea es interpretar el significado del último mensaje usando TODO el contexto disponible.",
    "",
    "PRIORIDAD ABSOLUTA:",
    "1. Resuelve primero la pregunta explícita del cliente.",
    "2. Solo considera una acción comercial si el cliente la pidió o la conversación la exige.",
    "3. Una pregunta de PRECIO NO es una intención de PAGO.",
    "4. Preguntar '¿qué vale?', 'precio', 'cuánto cuesta', 'en cuánto queda', 'a cómo está' significa price_question/details_query.",
    "5. '¿Cómo pago?', 'pásame los datos', '¿dónde transfiero?' significa payment_method_question/payment_intent.",
    "6. 'Ya pagué', 'ya transferí', 'te hice la transferencia' significa payment_confirmation/confirmation.",
    "7. Si el cliente repite o reformula una pregunta porque el vendedor no la contestó, marca reformulation=true y respuestaAnteriorFallida=true.",
    "8. Si solo pidió información, responderDirectamente=true y evitar cerrar, ofrecer video o repetir la ficha completa.",
    "9. Si dice 'te estoy preguntando por el precio' o equivalente, es frustración por respuesta fallida: NO vuelvas a vender.",
    "10. Si pide rebaja o propone otro precio, es objection + discount_request.",
    "",
    "CATÁLOGO REAL (solo estos ids existen):",
    catalogo || "(vacío)",
    "",
    "CONVERSACIÓN RECIENTE:",
    historial || "(sin historial)",
    "",
    `ÚLTIMO MENSAJE DEL CLIENTE: ${String(e.mensaje || "").slice(0, 1000)}`,
    e.productoEnFocoId ? `PRODUCTO EN FOCO PREVIO: ${e.productoEnFocoId}` : "PRODUCTO EN FOCO PREVIO: ninguno",
    "",
    "Devuelve SOLO JSON válido, sin markdown:",
    "{",
    `  "intencion": una de ${INTENCIONES.join("|")},`,
    `  "subintencion": una de ${SUBINTENCIONES.filter(Boolean).join("|")} o null,`,
    '  "productoId": id real del catálogo o null,',
    '  "esperando": "qué necesita del vendedor ahora, en una frase corta",',
    '  "preguntas": ["preguntas explícitas que siguen sin respuesta"],',
    '  "pideRebaja": true/false,',
    '  "dicePago": true/false,',
    '  "preguntaPorElBot": true/false,',
    '  "reformulaPregunta": true/false,',
    '  "respuestaAnteriorFallida": true/false,',
    '  "responderDirectamente": true/false,',
    '  "evitar": ["acciones que NO deben hacerse en este turno"],',
    '  "confianza": número entre 0 y 1',
    "}",
  ].join("\n");
}

export function extraerJson(bruto: string): any | null {
  const t = String(bruto || "").trim();
  if (!t) return null;
  const sinCerca = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const desde = sinCerca.indexOf("{");
  const hasta = sinCerca.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) return null;
  try {
    return JSON.parse(sinCerca.slice(desde, hasta + 1));
  } catch {
    return null;
  }
}

export function normalizar(crudo: any, idsValidos: Set<number>): Entendimiento | null {
  if (!crudo || typeof crudo !== "object") return null;

  const intencion = INTENCIONES.includes(crudo.intencion) ? crudo.intencion : null;
  if (!intencion) return null;

  const sub = SUBINTENCIONES.includes(crudo.subintencion) ? crudo.subintencion : null;
  const idBruto = Number(crudo.productoId);
  const productoId = Number.isFinite(idBruto) && idsValidos.has(idBruto) ? idBruto : null;
  const conf = Number(crudo.confianza);

  const esperando = String(crudo.esperando || "").slice(0, 240);
  const preguntas = Array.isArray(crudo.preguntas)
    ? crudo.preguntas.filter((p: any) => typeof p === "string" && p.trim()).slice(0, 5)
    : [];

  // Salvaguarda semántica adicional: aunque el modelo se equivoque de etiqueta,
  // nunca tratamos una consulta inequívoca de precio como ejecución de pago.
  const mensaje = String(crudo._mensajeOriginal || "").toLowerCase();
  const precioInequivoco = /(^|\s)(precio|valor|vale|cuesta|cuánto|cuanto|cuánto cuesta|cuanto cuesta|en cuánto|en cuanto|a cuánto|a cuanto)(\s|\?|$)/i.test(mensaje);
  const subintencion = precioInequivoco ? "price_question" : sub;
  const intencionFinal = precioInequivoco ? "details_query" : intencion;

  return {
    intencion: intencionFinal,
    subintencion,
    productoId,
    esperando,
    preguntas,
    pideRebaja: crudo.pideRebaja === true,
    dicePago: crudo.dicePago === true,
    preguntaPorElBot: crudo.preguntaPorElBot === true,
    confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
    reformulaPregunta: crudo.reformulaPregunta === true,
    respuestaAnteriorFallida: crudo.respuestaAnteriorFallida === true,
    responderDirectamente: crudo.responderDirectamente !== false,
    evitar: Array.isArray(crudo.evitar)
      ? crudo.evitar.filter((x: any) => typeof x === "string" && x.trim()).slice(0, 8)
      : [],
  };
}

/**
 * Solo proveedores rápidos en el camino normal.
 *
 * El error anterior era intentar hasta cuatro proveedores con 7s cada uno:
 * en un fallo se podían acumular decenas de segundos antes de responder.
 */
const PROVEEDORES_RAPIDOS = ["deepseek", "groq"];

/**
 * Entiende el mensaje. Esta función clasifica con contexto, pero NO redacta.
 * Timeout corto para que el agente de WhatsApp siga siendo interactivo.
 */
export async function entenderAlCliente(
  e: EntradaEntender,
  opciones: { timeoutMs?: number } = {},
): Promise<Entendimiento | null> {
  const timeout = opciones.timeoutMs ?? 2200;
  const idsValidos = new Set((e.catalogo || []).map((p) => p.id));
  const prompt = construirPrompt(e);

  for (const proveedor of PROVEEDORES_RAPIDOS) {
    let config: any = null;
    try {
      config = getProviderConfig(proveedor as any);
    } catch {
      continue;
    }
    if (!config?.apiKey) continue;

    // Nunca permitir que una configuración accidental mande reasoner/thinking
    // a esta ruta rápida. Si el tenant configuró un modelo lento, saltamos al
    // fallback en lugar de bloquear WhatsApp.
    const modelo = String(config.model || "");
    if (/reasoner|thinking|-r1\b|reasoning/i.test(modelo)) {
      logger.warn({ proveedor, modelo }, "[Entender] modelo de razonamiento omitido en ruta rápida");
      continue;
    }

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 700,
        },
        { timeout, maxRetries: 0 },
      );
      const bruto = completion.choices?.[0]?.message?.content?.trim() || "";

      // Pasamos el mensaje original solo durante normalización; no forma parte
      // del contrato JSON que ve el modelo.
      const crudo = extraerJson(bruto);
      if (crudo && typeof crudo === "object") crudo._mensajeOriginal = e.mensaje;
      const entendido = normalizar(crudo, idsValidos);

      if (entendido) {
        logger.info(
          {
            proveedor,
            intencion: entendido.intencion,
            subintencion: entendido.subintencion,
            productoId: entendido.productoId,
            confianza: entendido.confianza,
            responderDirectamente: entendido.responderDirectamente,
            reformulaPregunta: entendido.reformulaPregunta,
          },
          "[Entender] comprensión contextual del cliente",
        );
        return entendido;
      }
    } catch (err: any) {
      logger.warn({ proveedor, err: err?.message }, "[Entender] proveedor rápido no respondió");
    }
  }

  return null;
}
