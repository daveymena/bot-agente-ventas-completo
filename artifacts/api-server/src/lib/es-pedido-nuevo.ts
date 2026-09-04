/**
 * ============================================================
 * ¿ESTO ES UN PEDIDO NUEVO, O UN INTENTO DE CONFIRMAR?
 * ============================================================
 *
 * Reportado por el admin el 2026-09-04, con el chat entero: **"Atlas solo
 * entiende sí"**. Y es literal. Con un plan esperando confirmación, todo lo que
 * no sea un "sí" cae en el mismo lugar:
 *
 *   admin: "Demuéstrale el copi"
 *   Atlas: "🤔 No me quedó claro si querés que lo haga..."
 *
 *   admin: "A taladrímic."   (dictado por voz que salió mal)
 *   Atlas: "🤔 No me quedó claro si querés que lo haga..."
 *
 * Pidió TRES VECES ver el copy y las tres recibió la misma pregunta. La
 * conversación queda de rehén de un sí/no.
 *
 * ── Por qué la regla estaba así ──────────────────────────────────────────
 *
 * Por una razón buena y medida (2026-08-12): antes, cualquier cosa que no fuera
 * una aprobación exacta BORRABA el plan en silencio y Atlas volvía a proponer
 * lo mismo. El admin confirmó tres veces sin que se ejecutara nada. Entonces se
 * agregó: si la respuesta es corta y no arranca un pedido nuevo, se asume que
 * intentó confirmar y se le pregunta, manteniendo el plan vivo.
 *
 * El problema no es la idea: es la lista de verbos. Exige `\b` delante, y en
 * castellano los verbos vienen con prefijo y con pronombre pegado --
 * "DEmuéstrale", "muéstraME", "pasáMElo". El `\b` no casa dentro de
 * "Demuéstrale", así que un pedido clarísimo se leyó como un "sí" mal escrito.
 *
 * ── Y por eso vive acá, con pruebas ──────────────────────────────────────
 *
 * Porque estaba escrita en una línea dentro de la ruta, y una lista de verbos
 * escrita a mano SIEMPRE se queda corta: la única forma de que no vuelva a
 * pasar es poder pasarle los mensajes reales y ver qué reconoce.
 */

/** Sin acentos y en minúscula: los verbos se escriben de las dos formas. */
function comoSeLee(texto: string): string {
  const ACENTOS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u" };
  return String(texto || "")
    .toLowerCase()
    .replace(/[áéíóúü]/g, (c) => ACENTOS[c] ?? c);
}

/**
 * Raíces de verbos que empiezan un pedido.
 *
 * ⚠️ Se buscan SIN exigir límite de palabra al principio, a propósito: el
 * defecto medido es justamente que "demuestrale" no casaba con `\bmuestra`.
 * Las raíces son largas (4+ letras) para que no casen dentro de una palabra
 * cualquiera -- "muestra" no aparece por accidente en castellano.
 */
const RAICES = [
  "muestra", "mostra", "ensena", "entrega", "prepara", "genera", "arma",
  "dame", "pasame", "pasalo", "manda", "envia", "busca", "investiga",
  "cambia", "edita", "borra", "elimina", "publica", "analiza", "configura",
  "revisa", "activa", "pausa", "corrige", "calcula", "consulta", "verifica",
  "redacta", "crea", "lista",
];

/**
 * Terminaciones que puede llevar un verbo de pedido en castellano.
 *
 * ⚠️ Esto es la correccion de un defecto MIO, encontrado auditando el modulo
 * el mismo dia que lo escribi. Buscaba las raices en cualquier parte de la
 * palabra, y con eso CINCO de nueve confirmaciones reales se leian como pedido
 * nuevo -- o sea que el plan se descartaba, que es exactamente la regresion de
 * agosto que este archivo dice proteger:
 *
 *   "dale, que quede bien creativo"  ->  "crea" dentro de CREAtivo
 *   "listo, activalo"                ->  "activ"
 *   "si, publicalo"                  ->  "public"
 *   "perfecto, mandale"              ->  "manda"
 *   "ok generalmente si"             ->  "gener" dentro de GENERalmente
 *
 * Buscar la raiz suelta era demasiado flojo; exigir limite de palabra al
 * principio era demasiado duro (ese era el bug original, "DEmuestrale"). La
 * respuesta correcta es la morfologia: la raiz LLEVA su vocal tematica y solo
 * admite las terminaciones de un verbo, con el pronombre pegado si lo hay.
 *
 *   creativo   = crea + "tivo"  -> "tivo" no es terminacion verbal  -> NO
 *   creame     = crea + "me"                                        -> SI
 *   activalo   = activa + "lo"                                      -> SI
 *   actividad  = activi...                                          -> NO
 *   publicidad = publici...                                         -> NO
 *   mandato    = manda + "to"                                       -> NO
 */
const TERMINACIONES = "(?:me|te|le|lo|la|nos|los|las|selo|sela|r|rme|rlo|rle|s|n)?";

/**
 * Palabras que abren una pregunta. Una pregunta NO es una confirmación, aunque
 * sea corta: "¿y el copy?" son diez caracteres y no significa "sí".
 */
/**
 * ⚠️ La interrogativa tiene que ir al PRINCIPIO, o traer signo de pregunta.
 *
 * Buscándola en cualquier parte, "creo QUE sí" --que es un sí de manual--
 * pasaba por pregunta y el plan se descartaba. En castellano "que" es
 * conjunción mucho más seguido que interrogativo.
 */
const PREGUNTA = /^[¿\s]*(que|cual|cuant|como|cuando|donde|por que|porque|quien|se puede|puedo|podes|podrias)\b|\?/;

/**
 * ¿El mensaje arranca un pedido nuevo, en vez de responder al plan pendiente?
 *
 * Ante la duda devuelve false: mantener el plan vivo y volver a preguntar es
 * menos malo que borrar un plan que el admin quería ejecutar. Ese fue el
 * defecto anterior y no se vuelve atrás.
 */
export function arrancaPedidoNuevo(texto: string): boolean {
  const t = comoSeLee(texto).trim();
  if (!t) return false;

  // Una pregunta nunca es un "sí".
  if (PREGUNTA.test(t)) return true;

  // La raiz puede venir con el prefijo "de" pegado --"DEmuestrale"-- que era
  // el defecto original, pero tiene que TERMINAR como un verbo: eso es lo que
  // separa "creame" de "creativo".
  return RAICES.some((r) => new RegExp(`\\b(?:de)?${r}${TERMINACIONES}\\b`).test(t));
}
