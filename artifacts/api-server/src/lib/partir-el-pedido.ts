/**
 * ============================================================
 * CUANDO EL ADMIN PIDE VARIAS COSAS, SE RESUELVEN DE A UNA
 * ============================================================
 *
 * Pedido del admin el 2026-09-04: "si le pido un conjunto me debe dar por
 * partes para que no se cuelgue... que por nada del mundo se pare Atlas cuando
 * va a entregar algo".
 *
 * El mecanismo existe y la entrega por partes se conectó esta misma sesión
 * (cada parte sale apenas está lista, en vez de todas juntas al final). Pero
 * medido contra las formas en que se pide de verdad, NO SE DISPARA NUNCA:
 *
 *   "mostrame el copy, la estrategia, la segmentacion y el presupuesto"  NO
 *   "creame el anuncio, arma la estrategia y calcula el presupuesto"     NO
 *   "dame el copy, el publico y las metricas"                            NO
 *   "necesito el copy, la segmentacion y el plan de seguimiento"         NO
 *
 * Cuatro de cuatro. El mecanismo de partes estaba, y no lo usaba nadie.
 *
 * ── Por qué fallaba ──────────────────────────────────────────────────────
 *
 * La regla exigía que CADA parte empezara con un verbo de acción. Y así no
 * habla nadie: en una enumeración el verbo se dice UNA vez y gobierna a todas.
 * "Mostrame el copy, la estrategia y el presupuesto" son tres pedidos, y solo
 * el primero lleva el verbo.
 *
 * ── Por qué la regla estricta estaba ahí ─────────────────────────────────
 *
 * Por un caso real del 16-08-2026: partir por comas producía pedazos de frase
 * que después se le mostraban al admin como tareas pendientes. Apareció como
 * pendiente el texto
 *
 *     "descripcion y CTA) y crealo como BORRADOR ... NO lo publiques"
 *
 * -- un fragmento cortado dentro de un paréntesis, con la instrucción "NO lo
 * publiques" convertida en un ítem de trabajo. Eso no se puede repetir.
 *
 * La salida no es exigir el verbo en todas: es pedirlo UNA vez, en la primera,
 * y que el resto sean pedidos bien formados. Los paréntesis desbalanceados
 * --que son los que produjeron aquel fragmento-- se siguen rechazando.
 *
 * ── Y por qué esto vive en su propio archivo ─────────────────────────────
 *
 * Porque estaba escrito adentro de una función de 1.400 líneas, y por eso
 * nadie pudo comprobar nunca que no funcionaba. Acá se prueba con las frases
 * que el admin escribe de verdad.
 */

/** Se corta por comas y por " y " cuando arranca un sintagma nuevo. */
const CONECTORES = /,| y (?=el |la |los |las |un |una )/i;

/** La parte pide algo ENTREGABLE, no un parámetro de otra tarea. */
const ENTREGABLE =
  /\b(copy|texto|estrategia|segmentaci|seguimiento|presupuesto|an[aá]lisis|informe|reporte|plan\b|campa|anuncio|publicaci|imagen|p[uú]blico|audiencia|m[eé]tricas?)\b/i;

/**
 * Un verbo de pedido al principio.
 *
 * Se suman las formas en que se pide sin conjugar una orden: "dame",
 * "necesito", "quiero", "pasame". Faltaban todas, y son la mitad de los
 * pedidos reales -- "dame el copy, el publico y las metricas" no tenía ni una
 * parte válida por eso.
 */
const VERBO_DE_PEDIDO =
  /^(?:y\s+)?(?:me\s+)?(?:por\s+favor\s+)?(cre[aá]|arm[aá]|gener[aá]|analiz[aá]|investig[aá]|busc[aá]|revis[aá]|public[aá]|activ[aá]|paus[aá]|escrib[ií]|redact[aá]|list[aá]|mostr[aá]|actualiz[aá]|corrig|cambi[aá]|elimin[aá]|borr[aá]|program[aá]|calcul[aá]|dame|damelo|pasame|necesito|quiero|hac[eé]me|prepar[aá]|arm[aá]me)/i;

/** Los paréntesis abren y cierran: es lo que delata un fragmento cortado. */
const balanceada = (p: string) =>
  (p.match(/\(/g) || []).length === (p.match(/\)/g) || []).length;

/**
 * Una parte que es una NEGACIÓN no es una tarea.
 *
 * "NO lo publiques" es una restricción sobre el trabajo, y mostrarla como
 * pendiente fue exactamente el bug del 16-08. Se rechaza el pedido entero si
 * aparece: es señal de que la enumeración lleva instrucciones adentro y
 * partirla va a producir basura.
 */
const ES_RESTRICCION = /^\s*(no|nunca|sin|jam[aá]s)\b/i;

export interface PedidoPartido {
  /** La primera, que se resuelve en este turno. */
  primera: string;
  /** Las que siguen, una por tramo. */
  pendientes: string[];
}

/**
 * Parte un pedido de varias cosas, o devuelve null si es uno solo.
 *
 * Devuelve null ante la MENOR duda. Es preferible tardar más en un pedido que
 * mostrarle al admin pedazos de frase como si fueran trabajo pendiente.
 */
export function partirElPedido(crudo: string): PedidoPartido | null {
  const texto = String(crudo || "").trim();
  // Un pedido corto es uno solo. Partirlo es inventar trabajo.
  if (texto.length <= 60) return null;

  const partes = texto.split(CONECTORES).map((p) => p.trim()).filter((p) => p.length > 3);
  if (partes.length < 3) return null;

  // El verbo va en la PRIMERA. En una enumeración se dice una vez y gobierna
  // a todas: "mostrame el copy, la estrategia y el presupuesto".
  if (!VERBO_DE_PEDIDO.test(partes[0]!)) return null;

  const conEntregable = partes.filter((p) => ENTREGABLE.test(p));
  if (conEntregable.length < 3) return null;

  // Si alguna parte con entregable está mal formada, NO se parte nada. Es
  // preferible un turno largo a mostrar un fragmento como tarea.
  const todasSanas = conEntregable.every((p) => balanceada(p) && !ES_RESTRICCION.test(p));
  if (!todasSanas) return null;

  // Se ordena por el texto original: la primera del pedido es la primera que
  // se resuelve, que es lo que el admin espera ver primero.
  const [primera, ...resto] = conEntregable;
  return { primera: primera!, pendientes: resto };
}
