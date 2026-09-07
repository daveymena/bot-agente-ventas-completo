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
  /**
   * El cliente dueño de la conversación. Con él se usan SUS claves de IA
   * (`ai-keys-tenant`), que es lo que hace el resto del sistema. Sin él se cae
   * a las claves globales de `process.env`, que es lo que hacía esta capa
   * hasta hoy — y por eso ignoraba el DeepSeek que el cliente sí había pagado.
   */
  tenantId?: number | null;
}

function construirPrompt(e: EntradaEntender): string {
  // ── Esto clasifica, no redacta: el prompt tiene que ser barato ────────
  //
  // Con 100 productos a 100 chars y 16 mensajes a 450 el prompt pesaba ~5,5k
  // tokens POR MENSAJE. Corriendo el agente entero el 2026-09-06 se vio lo
  // que eso provoca: la comprensión y el redactor comparten la cuota del
  // proveedor, y a partir del cuarto turno era la comprensión la que se
  // quedaba sin aire — justo en los turnos de pago, que son los que importan.
  //
  //   429 TPM: Limit 8000, Used 7068, Requested 1608
  //
  // Para resolver un id alcanza con el nombre corto, y para leer continuidad
  // alcanzan los últimos turnos. Se recorta a la mitad sin perder el trabajo.
  const catalogo = e.catalogo
    .slice(0, 100)
    .map((p) => `${p.id}: ${String(p.name || "").slice(0, 60)}`)
    .join("\n");

  // Más contexto, pero acotado. El objetivo es comprender continuidad, no
  // mandar cientos de mensajes al modelo en cada turno.
  const historial = (e.historial || [])
    .slice(-12)
    .map((m) => `${m.role === "customer" ? "CLIENTE" : "VENDEDOR"}: ${String(m.content || "").slice(0, 240)}`)
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
    "11. Si el mensaje no nombra ningún producto pero la conversación venía de uno, ESE sigue siendo el productoId. No lo pongas en null por no estar nombrado.",
    "12. No inventes ids: solo pueden salir ids que estén en el catálogo de arriba.",
    "",
    "CATÁLOGO REAL (solo estos ids existen):",
    catalogo || "(vacío)",
    "",
    "CONVERSACIÓN RECIENTE:",
    historial || "(sin historial)",
    "",
    `ÚLTIMO MENSAJE DEL CLIENTE: ${String(e.mensaje || "").slice(0, 600)}`,
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

/**
 * Subintenciones que NO son ejecutar un pago. Si el modelo etiqueta
 * `payment_intent` pero él mismo eligió una de estas, se contradijo.
 */
const SUB_QUE_NO_ES_PAGO = new Set<string>([
  "price_question", "content_question", "delivery_question", "access_question",
  "guarantee_question", "duration_question", "support_question",
  "objection_price", "objection_trust", "objection_time", "discount_request",
]);

export function normalizar(
  crudo: any,
  idsValidos: Set<number>,
  focoPrevioId?: number | null,
): Entendimiento | null {
  if (!crudo || typeof crudo !== "object") return null;

  const intencion = INTENCIONES.includes(crudo.intencion) ? crudo.intencion : null;
  if (!intencion) return null;

  const sub = SUBINTENCIONES.includes(crudo.subintencion) ? crudo.subintencion : null;
  const idBruto = Number(crudo.productoId);
  const conf = Number(crudo.confianza);

  // ── El producto que venía en foco no se pierde por omisión ─────────────
  //
  // A "y cuánto vale?" el modelo suele devolver productoId null porque el
  // mensaje no nombra nada. Antes eso borraba el producto de la conversación
  // y el agente contestaba en el aire. Se hereda el foco previo, que ya viene
  // resuelto por dato duro del lado del servidor.
  const delModelo = Number.isFinite(idBruto) && idsValidos.has(idBruto) ? idBruto : null;
  const heredado = Number.isFinite(Number(focoPrevioId)) && idsValidos.has(Number(focoPrevioId))
    ? Number(focoPrevioId)
    : null;
  const productoId = delModelo ?? heredado;

  const esperando = String(crudo.esperando || "").slice(0, 240);
  const preguntas = Array.isArray(crudo.preguntas)
    ? crudo.preguntas.filter((p: any) => typeof p === "string" && p.trim()).slice(0, 5)
    : [];

  // ── Candado de pago: solo baja, y solo cuando el modelo se contradice ───
  //
  // Acá hubo una regex de palabras de precio que forzaba `details_query`.
  // Medida el 2026-09-06 contra mensajes reales, se comía pagos legítimos:
  //
  //   "¿a cuánto te hago la transferencia?"  -> lo mandaba a consulta de precio
  //   "cuánto pago"                          -> lo mandaba a consulta de precio
  //   "vale la pena?"                         -> lo leía como pregunta de precio
  //   "¿Cuánto?"                             -> NO lo detectaba (la "¿" pegada)
  //
  // Volver a una lista de palabras era repetir el error que esta capa vino a
  // corregir. El candado ahora no lee el texto: compara al modelo consigo
  // mismo. Si dijo "quiere pagar" pero la subintención que él mismo eligió es
  // una pregunta de precio o de contenido, gana la subintención. Nunca sube a
  // `payment_intent`: solo puede bajar, así que no puede entregar datos de
  // cobro a quien no los pidió.
  const seContradice = intencion === "payment_intent" && !!sub && SUB_QUE_NO_ES_PAGO.has(sub);
  const subintencion = sub;
  const intencionFinal = seContradice ? "details_query" : intencion;

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
 * El modelo de ENTENDER no es el de REDACTAR, y mezclarlos rompe uno de los dos.
 *
 * Esta ruta usaba `config.model`, o sea la misma variable que redacta las
 * respuestas (`DEEPSEEK_MODEL`). Mientras ahí hubo un modelo veloz no se notó.
 * Pero el modelo que mejor OBEDECE las reglas es de razonamiento y tarda 4 a 9
 * segundos (medido 2026-09-06: `deepseek-v4-pro` acierta 3 de 3 en el cierre
 * contra 1 de 3 de `deepseek-chat`), y acá el timeout es de 4 segundos.
 *
 * O sea: mejorar la redacción habría apagado el cerebro semántico sin que
 * nadie se enterara. Daría timeout en cada mensaje y el agente volvería a
 * decidir con los patrones, que es justo lo que esta capa vino a reemplazar.
 * El filtro de abajo no lo atajaba: `deepseek-v4-pro` no dice "reasoner" ni
 * "thinking" en el nombre.
 *
 * Son dos trabajos distintos y cada uno quiere lo suyo:
 *   · entender qué quiso decir el cliente  -> rápido, decisión simple
 *   · redactar lo que se le contesta       -> lento, tiene que obedecer reglas
 *
 * `ENTENDER_MODEL` permite fijarlo a mano; si no, se usa el rápido conocido de
 * cada proveedor y recién después lo que haya configurado el negocio.
 */
const MODELO_RAPIDO: Record<string, string> = {
  deepseek: "deepseek-v4-flash",
  groq: "openai/gpt-oss-20b",
};

function modeloParaEntender(proveedor: string, config: any): string {
  return String(process.env.ENTENDER_MODEL || MODELO_RAPIDO[proveedor] || config?.model || "");
}

/**
 * Entiende el mensaje. Esta función clasifica con contexto, pero NO redacta.
 * Timeout corto para que el agente de WhatsApp siga siendo interactivo.
 */
export async function entenderAlCliente(
  e: EntradaEntender,
  opciones: { timeoutMs?: number } = {},
): Promise<Entendimiento | null> {
  // 2200ms era demasiado justo. Medido el 2026-09-06 contra Groq con un prompt
  // del tamaño real (10.427 chars): 1011 / 1213 / 1543 ms. Un turno lento se
  // pasaba del corte, `entenderAlCliente` devolvía null y el bot volvía a los
  // patrones — o sea que a veces entendía y a veces no, que se siente peor que
  // ser siempre robot. 4s deja margen sin que el cliente lo note.
  // ── 4 segundos dejaban afuera a uno de cada tres mensajes ──────────────
  //
  // Medido contra la API real el 2026-09-06, con diez mensajes de clientes de
  // verdad y `deepseek-v4-flash` (el rápido):
  //
  //   "si porfa"            2,0s      "que incluye"          1,9s
  //   "mandame el link"     2,0s      "precio"               2,8s
  //   "lo quiero"           3,9s      "Si que vale ?"        4,7s  ❌
  //   "quiero inscribirme"  5,0s ❌   "ya me decidi"         5,6s  ❌
  //
  // Tres de diez pasaban de 4s. Y cuando pasa, esta capa devuelve null EN
  // SILENCIO y el agente decide con los patrones -- justo lo que esta capa
  // vino a reemplazar. Es la explicación más probable de por qué el agente a
  // veces entiende bien y a veces no: no es el modelo, es el reloj.
  //
  // 8s cubre todo lo medido con margen. El cliente ya espera al bot; que
  // entienda mal es peor que que tarde dos segundos más. Si el proveedor se
  // cae de verdad, el fallback a patrones sigue estando.
  const timeout = opciones.timeoutMs ?? Number(process.env.ENTENDER_TIMEOUT_MS || 8000);
  const idsValidos = new Set((e.catalogo || []).map((p) => p.id));
  const prompt = construirPrompt(e);

  // Las claves del cliente, no las globales. El resto del sistema ya trabaja
  // así; esta capa leía `process.env` y por eso ignoraba el DeepSeek de pago
  // que el cliente tenía cargado en su panel.
  let clavesDelCliente: Record<string, any> | null = null;
  if (e.tenantId) {
    try {
      const { clavesDelTenant } = await import("./ai-keys-tenant");
      clavesDelCliente = await clavesDelTenant(e.tenantId);
    } catch (err: any) {
      logger.warn({ tenantId: e.tenantId, err: err?.message }, "[Entender] no se pudieron leer las claves del cliente, se usan las globales");
    }
  }

  const sinClave: string[] = [];

  for (const proveedor of PROVEEDORES_RAPIDOS) {
    let config: any = null;
    try {
      if (e.tenantId) {
        const { configDelTenant } = await import("./ai-keys-tenant");
        config = (await configDelTenant(e.tenantId, proveedor, clavesDelCliente || undefined))?.config || null;
      } else {
        config = getProviderConfig(proveedor as any);
      }
    } catch {
      continue;
    }
    if (!config?.apiKey) {
      sinClave.push(proveedor);
      continue;
    }

    // Nunca permitir que una configuración accidental mande reasoner/thinking
    // a esta ruta rápida. Si el tenant configuró un modelo lento, saltamos al
    // fallback en lugar de bloquear WhatsApp.
    // Se decide sobre el modelo que ESTA ruta va a usar, no sobre el que el
    // negocio configuró para redactar: son dos trabajos distintos (ver
    // `modeloParaEntender`). Se agrega `-pro` a los lentos porque así nombra
    // DeepSeek a su modelo de razonamiento, y no dice "reasoner".
    const modelo = modeloParaEntender(proveedor, config);
    if (!modelo || /reasoner|thinking|-r1\b|reasoning|-pro\b/i.test(modelo)) {
      logger.warn({ proveedor, modelo }, "[Entender] modelo lento omitido en ruta rápida");
      continue;
    }

    try {
      const client = createAIClient(config);
      const completion = await client.chat.completions.create(
        {
          model: modelo,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          max_tokens: 450,
        },
        { timeout, maxRetries: 0 },
      );
      const bruto = completion.choices?.[0]?.message?.content?.trim() || "";

      const entendido = normalizar(extraerJson(bruto), idsValidos, e.productoEnFocoId ?? null);

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

  // ── Que no se muera en silencio ─────────────────────────────────
  //
  // Devolver null era mudo: el agente seguía con los patrones y en el log no
  // quedaba ni una línea. Corriendo el agente entero el 2026-09-06, dos turnos
  // seguidos se resolvieron sin comprensión y no había forma de saberlo — se
  // veía como si la capa no sirviera, cuando lo que pasaba es que no corría.
  //
  // El caso de `sinClave` es el peor de todos porque no lanza ninguna
  // excepción: si la rotación aparta un proveedor por un 429, esta capa se
  // apaga con él y nadie se entera.
  if (sinClave.length === PROVEEDORES_RAPIDOS.length) {
    logger.warn(
      { proveedores: sinClave, tenantId: e.tenantId ?? null },
      "[Entender] NINGUN proveedor rápido tiene clave: el agente decide con los patrones",
    );
  } else {
    logger.warn({ timeout }, "[Entender] no se pudo entender el mensaje: el agente decide con los patrones");
  }
  return null;
}
