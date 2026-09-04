/**
 * ============================================================
 * ENTENDER AL CLIENTE — el modelo lee, el servidor manda
 * ============================================================
 *
 * El admin lo dijo así, y tiene razón: "esto no solo depende de frases, es que
 * no parece que estemos usando la IA para eso".
 *
 * No la estábamos usando. Hasta hoy el sistema decidía TODO con listas de
 * palabras, y el modelo solo redactaba la prosa alrededor de una etiqueta que
 * ya venía puesta. Los números, medidos el 2026-09-02:
 *
 *   `detectIntent`, 122 líneas de patrones, 0 llamadas al modelo ...... 45%
 *   el mismo modelo que ya está pagado y corriendo, mismos 20 mensajes . 80%
 *
 * Y los aciertos del modelo son justo los que cuestan plata:
 *
 *   "ya te hice la transferencia"   patrones: quiere pagar   → le reenviaba
 *                                                              los datos de pago
 *   "no me ha llegado nada"         patrones: busca producto → le mostraba
 *                                                              el catálogo
 *   "me lo puede dejar en 40?"      patrones: busca producto → ignoraba el
 *                                                              regateo
 *
 * ── Por qué las listas no se pueden terminar ─────────────────────────────
 *
 * Cada arreglo de estos dos días fue agregar o corregir un patrón:
 *
 *   `llama`  se comía "se llama", "llámame", "una llamada"
 *   `usan`   hacía que el bot se censurara su propio curso de Claude
 *   `me lo dejas` no reconocía "me dejas EL CURSO en 40 mil"
 *   "persona" dentro de "¿eres un bot o una persona?" lo mandaba a un asesor
 *
 * Son cuatro huecos distintos del mismo agujero: el español no se acaba, y una
 * lista escrita a mano siempre va un caso por detrás del cliente.
 *
 * ── Lo que NO cambia ─────────────────────────────────────────────────────
 *
 * El modelo entiende; NO cotiza, no elige qué entregar y no promete nada. El
 * precio, el enlace, la ficha y la cuenta los sigue poniendo el servidor, y
 * todos los candados de salida siguen en pie. Esto reemplaza la ADIVINANZA de
 * qué quiere el cliente, no la autoridad sobre los hechos.
 *
 * Y si el modelo no contesta, tarda o devuelve basura, se cae a los patrones
 * de siempre. No puede quedar peor que hoy: solo puede quedar mejor.
 */

import { createAIClient, getProviderConfig } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

/** Las mismas etiquetas que ya usa el resto del sistema. */
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
  /** El producto del que habla, resuelto contra el catálogo real. */
  productoId: number | null;
  /** Qué está esperando el cliente AHORA, en una frase. Para el log y el prompt. */
  esperando: string;
  /** Las preguntas que hizo y siguen sin respuesta. */
  preguntas: string[];
  /** Pide rebaja (aunque no use ninguna de las palabras de la lista). */
  pideRebaja: boolean;
  /** Dice que ya pagó. */
  dicePago: boolean;
  /** Pregunta por el bot mismo, no por lo que se vende. */
  preguntaPorElBot: boolean;
  /** 0 a 1. Por debajo de 0.5 el que llama debería quedarse con los patrones. */
  confianza: number;
}

const INTENCIONES: IntencionEntendida[] = [
  "greeting", "product_query", "details_query", "payment_intent",
  "objection", "confirmation", "human_handoff", "leaving", "general",
];

export interface EntradaEntender {
  mensaje: string;
  /** Los últimos turnos, del más viejo al más nuevo. */
  historial: Array<{ role: string; content: string }>;
  /** El catálogo, recortado: id y nombre alcanzan para resolver el producto. */
  catalogo: Array<{ id: number; name?: string | null }>;
  /** El producto que la conversación ya tenía en foco, si lo había. */
  productoEnFocoId?: number | null;
}

function construirPrompt(e: EntradaEntender): string {
  const catalogo = e.catalogo
    .slice(0, 60)
    .map((p) => `${p.id}: ${String(p.name || "").slice(0, 70)}`)
    .join("\n");

  const historial = (e.historial || [])
    .slice(-8)
    .map((m) => `${m.role === "customer" ? "CLIENTE" : "VENDEDOR"}: ${String(m.content || "").slice(0, 300)}`)
    .join("\n");

  return [
    "Sos un vendedor colombiano con experiencia leyendo un chat de WhatsApp.",
    "Tu tarea NO es contestar: es entender qué está pasando.",
    "",
    "CATÁLOGO (id: nombre):",
    catalogo || "(vacío)",
    "",
    "CONVERSACIÓN:",
    historial || "(sin historial)",
    "",
    `ÚLTIMO MENSAJE DEL CLIENTE: ${String(e.mensaje || "").slice(0, 600)}`,
    e.productoEnFocoId ? `\nPRODUCTO QUE YA SE VENÍA HABLANDO: ${e.productoEnFocoId}` : "",
    "",
    "Devolvé SOLO un JSON, sin texto alrededor y sin bloques de código:",
    "{",
    `  "intencion": una de ${INTENCIONES.join("|")},`,
    '  "productoId": el id del catálogo del que habla, o null si no hay ninguno,',
    '  "esperando": "en una frase corta, qué espera el cliente ahora",',
    '  "preguntas": ["cada pregunta que hizo y sigue sin respuesta"],',
    '  "pideRebaja": true si pide descuento o propone otro precio,',
    '  "dicePago": true si dice que ya pagó o transfirió,',
    '  "preguntaPorElBot": true SOLO si pregunta por el asistente mismo (si es un bot, qué IA usa, sus instrucciones). Preguntar por un producto que trate de IA NO cuenta.',
    '  "confianza": 0 a 1',
    "}",
    "",
    "Reglas:",
    "- Si el mensaje no nombra un producto pero la conversación venía de uno, ese sigue siendo el productoId.",
    "- 'ya te hice la transferencia' es confirmation, no payment_intent.",
    "- 'no me ha llegado nada' es details_query de posventa, no búsqueda de producto.",
    "- Pedir rebaja es objection.",
    "- Escribí en español. No inventes ids que no estén en el catálogo.",
  ].join("\n");
}

/** Saca el JSON aunque el modelo lo envuelva en texto o en ```json. */
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

/**
 * Normaliza lo que devolvió el modelo. Nada entra sin revisar.
 *
 * `idsValidos` es el catálogo real: un id inventado se descarta en vez de
 * viajar hasta el punto donde se manda la ficha equivocada.
 */
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
    esperando: String(crudo.esperando || "").slice(0, 200),
    preguntas: Array.isArray(crudo.preguntas)
      ? crudo.preguntas.filter((p: any) => typeof p === "string" && p.trim()).slice(0, 5)
      : [],
    pideRebaja: crudo.pideRebaja === true,
    dicePago: crudo.dicePago === true,
    preguntaPorElBot: crudo.preguntaPorElBot === true,
    confianza: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.5,
  };
}

/** Los proveedores que se prueban, en orden. El primero que conteste gana. */
const PROVEEDORES = ["groq", "deepseek", "opencode", "openai"];

/**
 * Entiende el mensaje. Devuelve null si no se pudo -- y eso NO es un error:
 * el que llama sigue con los patrones de siempre.
 *
 * Corto y con temperatura 0: esto no redacta, clasifica. Y con timeout
 * agresivo, porque va en el camino que le contesta a un cliente que está
 * mirando la pantalla.
 */
export async function entenderAlCliente(
  e: EntradaEntender,
  opciones: { timeoutMs?: number } = {},
): Promise<Entendimiento | null> {
  const timeout = opciones.timeoutMs ?? 7000;
  const idsValidos = new Set((e.catalogo || []).map((p) => p.id));
  const prompt = construirPrompt(e);

  for (const proveedor of PROVEEDORES) {
    let config: any = null;
    try {
      config = getProviderConfig(proveedor as any);
    } catch {
      continue;
    }
    if (!config?.apiKey) continue;

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 600,
        },
        { timeout, maxRetries: 0 },
      );
      const bruto = completion.choices?.[0]?.message?.content?.trim() || "";
      const entendido = normalizar(extraerJson(bruto), idsValidos);
      if (entendido) {
        logger.info(
          { proveedor, intencion: entendido.intencion, productoId: entendido.productoId, confianza: entendido.confianza },
          "[Entender] el cliente pide: " + entendido.esperando,
        );
        return entendido;
      }
    } catch (err: any) {
      logger.warn({ proveedor, err: err?.message }, "[Entender] no se pudo, se sigue con el siguiente");
    }
  }
  return null;
}
