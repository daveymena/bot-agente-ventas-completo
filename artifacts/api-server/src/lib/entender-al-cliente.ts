/**
 * ============================================================
 * ENTENDER AL CLIENTE — clasificador IA solo cuando hace falta
 * ============================================================
 *
 * Este módulo NO debe convertirse en una segunda generación obligatoria.
 * El mensaje de WhatsApp ya pasa por el modelo principal de respuesta.
 * Hacer aquí otra llamada a varios proveedores antes de responder duplicaba
 * la latencia y podía dejar al cliente esperando 7s x varios proveedores.
 *
 * Regla de producción:
 *   1. Los casos obvios se resuelven gratis y devuelven null.
 *   2. Solo los mensajes realmente ambiguos usan una llamada IA.
 *   3. Esa llamada usa UN proveedor rápido y un timeout corto.
 *   4. Nunca se recorre una cadena de proveedores en este clasificador.
 *
 * El modelo principal sigue siendo la autoridad para redactar la respuesta.
 * Este módulo solo mejora la intención/producto cuando los patrones no son
 * suficientes.
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

export interface Entendimiento {
  intencion: IntencionEntendida;
  productoId: number | null;
  esperando: string;
  preguntas: string[];
  pideRebaja: boolean;
  dicePago: boolean;
  preguntaPorElBot: boolean;
  confianza: number;
}

const INTENCIONES: IntencionEntendida[] = [
  "greeting", "product_query", "details_query", "payment_intent",
  "objection", "confirmation", "human_handoff", "leaving", "general",
];

export interface EntradaEntender {
  mensaje: string;
  historial: Array<{ role: string; content: string }>;
  catalogo: Array<{ id: number; name?: string | null }>;
  productoEnFocoId?: number | null;
}

function construirPrompt(e: EntradaEntender): string {
  const catalogo = e.catalogo
    .slice(0, 40)
    .map((p) => `${p.id}: ${String(p.name || "").slice(0, 70)}`)
    .join("\n");

  const historial = (e.historial || [])
    .slice(-6)
    .map((m) => `${m.role === "customer" ? "CLIENTE" : "VENDEDOR"}: ${String(m.content || "").slice(0, 240)}`)
    .join("\n");

  return [
    "Sos un vendedor colombiano leyendo un chat de WhatsApp.",
    "NO contestes. Solo clasifica qué quiere el cliente ahora.",
    "",
    "CATÁLOGO (id: nombre):",
    catalogo || "(vacío)",
    "",
    "CONVERSACIÓN:",
    historial || "(sin historial)",
    "",
    `ÚLTIMO MENSAJE: ${String(e.mensaje || "").slice(0, 500)}`,
    e.productoEnFocoId ? `PRODUCTO EN FOCO: ${e.productoEnFocoId}` : "",
    "",
    "Devuelve SOLO JSON válido:",
    "{",
    `  "intencion": una de ${INTENCIONES.join("|")},`,
    '  "productoId": id del catálogo o null,',
    '  "esperando": "qué espera ahora, corto",',
    '  "preguntas": [],',
    '  "pideRebaja": true/false,',
    '  "dicePago": true/false,',
    '  "preguntaPorElBot": true/false,',
    '  "confianza": 0 a 1',
    "}",
    "No inventes ids. Si dudas, usa general y confianza baja.",
  ].join("\n");
}

export function extraerJson(bruto: string): any | null {
  const t = String(bruto || "").trim();
  if (!t) return null;
  const limpio = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const desde = limpio.indexOf("{");
  const hasta = limpio.lastIndexOf("}");
  if (desde < 0 || hasta <= desde) return null;
  try {
    return JSON.parse(limpio.slice(desde, hasta + 1));
  } catch {
    return null;
  }
}

export function normalizar(crudo: any, idsValidos: Set<number>): Entendimiento | null {
  if (!crudo || typeof crudo !== "object") return null;
  const intencion = INTENCIONES.includes(crudo.intencion) ? crudo.intencion : null;
  if (!intencion) return null;

  const idBruto = Number(crudo.productoId);
  const productoId = Number.isFinite(idBruto) && idsValidos.has(idBruto) ? idBruto : null;
  const conf = Number(crudo.confianza);

  return {
    intencion,
    productoId,
    esperando: String(crudo.esperando || "").slice(0, 160),
    preguntas: Array.isArray(crudo.preguntas)
      ? crudo.preguntas.filter((p: any) => typeof p === "string" && p.trim()).slice(0, 5)
      : [],
    pideRebaja: crudo.pideRebaja === true,
    dicePago: crudo.dicePago === true,
    preguntaPorElBot: crudo.preguntaPorElBot === true,
    confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
  };
}

/**
 * Mensajes que el motor de reglas ya entiende suficientemente bien.
 * No tiene sentido pagar una segunda inferencia IA para ellos.
 */
function esCasoObvio(mensaje: string): boolean {
  const t = String(mensaje || "").trim().toLowerCase();
  if (!t) return true;

  if (/^(hola+|buenas?|buenos? d[ií]as?|buenas? tardes?|buenas? noches?|hey|hi|holi+|ola+|qu[eé] tal|saludos)[\s!.,]*$/i.test(t)) return true;
  if (/^(gracias|muchas gracias|ok|okay|listo|chao|adi[oó]s|no gracias)[\s!.,]*$/i.test(t)) return true;

  // Pago/compra: ya existen reglas duras para estas intenciones y no se debe
  // gastar otra llamada para volver a descubrirlas.
  if (/(ya (te |le )?pagu[eé]|ya (te |le )?hice la transferencia|comprobante|captura de pago|quiero pagar|c[oó]mo pago|d[oó]nde pago|nequi|daviplata|transferencia|comprar|compr[oó]|adquirir)/i.test(t)) return true;

  // Objeciones conocidas: el servidor tiene una ruta específica y segura.
  if (/(est[aá] caro|muy caro|no tengo dinero|lo voy a pensar|lo pienso|despu[eé]s|no me interesa|no conf[ií]o|es una estafa|garant[ií]a|reembolso|devoluci[oó]n)/i.test(t)) return true;

  // Preguntas directas de producto/detalles ya tienen resolución determinista
  // y el modelo principal recibe el catálogo/contexto real.
  if (/(cu[aá]nto|precio|costo|vale|cu[aá]l|qu[eé] incluye|qu[eé] trae|caracter[ií]sticas?|temario|curso|producto|tienes?|ten[eé]s|hay|sirve|funciona|informaci[oó]n|detalles?)/i.test(t)) return true;

  return false;
}

/**
 * Entiende el mensaje solo cuando los patrones no alcanzan.
 *
 * El timeout por defecto es deliberadamente corto. Si DeepSeek no responde
 * rápido, se abandona esta mejora y el flujo continúa con el modelo principal.
 */
export async function entenderAlCliente(
  e: EntradaEntender,
  opciones: { timeoutMs?: number } = {},
): Promise<Entendimiento | null> {
  if (esCasoObvio(e.mensaje)) return null;

  const timeout = Math.min(Math.max(opciones.timeoutMs ?? 1400, 700), 2000);
  const idsValidos = new Set((e.catalogo || []).map((p) => p.id));
  const prompt = construirPrompt(e);

  // Una sola llamada. Los fallbacks aquí eran la causa de que una clasificación
  // secundaria pudiera bloquear al cliente durante decenas de segundos.
  const proveedores = ["deepseek"];
  for (const proveedor of proveedores) {
    let config: any = null;
    try {
      config = getProviderConfig(proveedor as any);
    } catch {
      return null;
    }
    if (!config?.apiKey) return null;

    // Nunca permitir que el clasificador use un modelo de razonamiento.
    if (/reasoner|thinking|-r1\b|reasoning/i.test(String(config.model || ""))) {
      logger.warn({ proveedor, model: config.model }, "[Entender] modelo de razonamiento bloqueado para WhatsApp");
      return null;
    }

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 220,
        },
        { timeout, maxRetries: 0 },
      );
      const bruto = completion.choices?.[0]?.message?.content?.trim() || "";
      const entendido = normalizar(extraerJson(bruto), idsValidos);
      if (!entendido || entendido.confianza < 0.5) return null;

      logger.info(
        { proveedor, intencion: entendido.intencion, productoId: entendido.productoId, confianza: entendido.confianza },
        "[Entender] cliente ambiguo clasificado sin bloquear la cadena principal",
      );
      return entendido;
    } catch (err: any) {
      logger.warn({ proveedor, err: err?.message }, "[Entender] clasificación rápida omitida; sigue la ruta principal");
      return null;
    }
  }
  return null;
}
