/**
 * ============================================================
 * LO QUE LE LLEGA AL ADMIN TIENE QUE SER UNA RESPUESTA
 * ============================================================
 *
 * Visto en vivo el 2026-09-02. El admin pidió un análisis de mercado para su
 * curso de IA. Atlas hizo el trabajo -- buscó 8 anuncios de la competencia en
 * la Ad Library, corrió búsquedas de tendencias, ubicó el producto 124 -- y lo
 * que le publicó en el chat fue esto:
 *
 *     Goal
 *     The user (admin) wants a market analysis...
 *     Discoveries / Accomplished / Remaining Tasks
 *     Relevant files / directories
 *     Prompt for next agent
 *     Continue the conversation in Spanish...
 *
 * No es "Atlas contestó en inglés". Es peor y es otra cosa: **el motor se
 * quedó sin contexto, se compactó, y el RESUMEN DE TRASPASO salió publicado
 * como si fuera la respuesta.** Un documento interno, escrito para el próximo
 * agente, con la lista de archivos y las tareas pendientes adentro. El propio
 * texto lo dice: "Market analysis summary was NOT yet delivered to the admin".
 *
 * ── Por qué acá y no en el prompt ────────────────────────────────────────
 *
 * Porque la regla ya está en el prompt y no alcanza -- y en este caso no puede
 * alcanzar. `ATLAS_SYSTEM_PROMPT_V2` abre con "REGLA CERO, ANTES QUE CUALQUIER
 * OTRA: CONTESTÁS SIEMPRE EN ESPAÑOL" (commit 189b60e). Ese texto es el prompt
 * del TURNO. El resumen de compactación lo escribe el motor con SU propio
 * prompt interno, que nunca vio la regla cero. Pedirle más fuerte al modelo
 * que conteste en español no puede arreglar un texto que el modelo no escribió
 * como respuesta.
 *
 * Es la misma lección que este proyecto sacó con el precio, con la cuenta de
 * cobro, con el voseo y con los emojis: lo que se puede decidir en el
 * servidor, se decide en el servidor.
 */

const N = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Los encabezados del resumen de traspaso.
 *
 * Son de la plantilla del motor, no del español del negocio: ninguna respuesta
 * legítima al admin lleva "Prompt for next agent" ni "Relevant files".
 */
const ENCABEZADOS_DE_TRASPASO = [
  "prompt for next agent",
  "remaining tasks",
  "relevant files",
  "next steps for the agent",
  "handoff",
  "accomplished",
  "discoveries",
  "conversation summary",
  "context summary",
];

/**
 * ¿Esto es un resumen interno y no una respuesta?
 *
 * Se piden DOS señales, no una. Con una sola alcanzaba para marcar de más: un
 * anuncio en inglés de la competencia puede traer la palabra "handoff" adentro
 * y eso no convierte la respuesta en un documento interno.
 */
export function esResumenInterno(texto: string): boolean {
  const t = N(texto);
  if (t.length < 120) return false;

  let señales = 0;
  for (const h of ENCABEZADOS_DE_TRASPASO) {
    if (t.includes(h)) señales++;
    if (señales >= 2) return true;
  }

  // "Goal" + "Instructions" arrancando renglón es la cabecera de la plantilla.
  const arranques = (t.match(/^(goal|instructions|discoveries|accomplished)\s*$/gm) || []).length;
  return señales + arranques >= 2;
}

// Palabras vacías: las que aparecen en CUALQUIER texto del idioma y que nadie
// escribe a propósito. Contarlas mide en qué idioma está escrito el mensaje,
// no de qué habla.
const VACIAS_ES = ["que", "de", "la", "el", "los", "las", "para", "con", "por", "una", "del", "en", "se", "es", "esta", "tu", "tus", "al", "lo", "como", "pero", "si", "ya", "mas", "sobre", "cuando", "porque"];
const VACIAS_EN = ["the", "and", "for", "with", "you", "your", "this", "that", "are", "was", "were", "from", "they", "will", "have", "has", "been", "what", "which", "their", "there", "should", "would", "about", "into", "not"];

const contar = (palabras: string[], vacias: string[]) =>
  palabras.reduce((n, p) => n + (vacias.includes(p) ? 1 : 0), 0);

/**
 * ¿El mensaje está escrito en inglés?
 *
 * No basta con que CONTENGA inglés: Atlas cita copys de la competencia y
 * nombres de campo de Facebook todo el tiempo, y eso es materia prima
 * legítima. Lo que se mide es en qué idioma está REDACTADO -- por eso se
 * comparan las palabras vacías de los dos idiomas y se exige una diferencia
 * clara, no un empate.
 */
export function pareceIngles(texto: string): boolean {
  const palabras = N(texto).split(/[^a-z]+/).filter(Boolean);
  if (palabras.length < 40) return false;

  const es = contar(palabras, VACIAS_ES);
  const en = contar(palabras, VACIAS_EN);

  // Con el doble de marcadores ingleses que españoles, y un piso para no
  // decidir con tres palabras sueltas.
  return en >= 8 && en > es * 2;
}

/** Lo que se publica cuando la respuesta no era una respuesta. */
export function avisoDeTurnoIncompleto(): string {
  return (
    `⚠️ Me quedé sin contexto a mitad del trabajo y no alcancé a redactarte la respuesta.\n\n` +
    `La investigación sí se hizo, pero lo que iba a salir era un resumen interno mío ` +
    `--en inglés y con notas de sistema--, así que preferí no mandártelo.\n\n` +
    `Pedímelo de nuevo y lo escribo completo. Si el pedido es grande ` +
    `(por ejemplo un análisis de mercado entero), partímelo en dos y te lo entrego mejor.`
  );
}

/**
 * El turno terminó sin UNA SOLA palabra que entregar.
 *
 * ⚠️ Antes esto salía como *"No tengo una respuesta para eso todavía."* y era
 * un callejón sin salida: no dice qué pasó, no dice qué hacer, y suena a que
 * el pedido era raro cuando el pedido estaba perfecto. El admin lo describió
 * como "se quedó pegado con algo básico".
 *
 * El caso real (2026-09-04, 11:19): había un plan esperando confirmación --el
 * copy reescrito del borrador 109--. El admin contestó *"sí pero no estás
 * usando los emoji característicos de cada ítem"*, que es un SÍ CON
 * CORRECCIÓN. Se leyó como pedido nuevo, y eso está bien: descartar el plan
 * viejo es lo correcto cuando el mensaje pide otra cosa.
 *
 * Lo que NO está bien es lo que vino después. El turno nuevo no produjo nada,
 * así que el admin terminó sin respuesta **y sin el plan** que llevaba dos
 * minutos esperando su confirmación. Perdió las dos cosas de una, y la única
 * salida que le quedaba era escribir todo el pedido otra vez.
 *
 * Por eso acá el plan descartado se DEVUELVE. Descartarlo tenía sentido
 * mientras el turno nuevo iba a reemplazarlo; si el turno nuevo no entregó
 * nada, no hay con qué reemplazarlo y quedarse con las manos vacías es peor
 * que quedarse con el plan viejo.
 *
 * @param planDevuelto  Las acciones que vuelven a quedar pendientes, ya
 *                      descritas para leer. Vacío si no había ninguna.
 * @param tramos        En qué se fue el tiempo. "se fue en investigar" es
 *                      accionable; "tardó mucho" no.
 */
export function avisoDeCierreVacio(planDevuelto: string[], tramos?: string): string {
  const partes = [
    `😕 Este turno se me fue entero y no llegué a redactarte la respuesta. ` +
      `No es que no haya entendido el pedido: no alcancé a terminarlo.`,
  ];

  if (planDevuelto.length > 0) {
    partes.push(
      `Lo que sí hice fue no perderte lo que estaba esperando confirmación. ` +
        `Te lo dejo pendiente de nuevo, tal como estaba:\n\n` +
        planDevuelto.map((a, i) => `${i + 1}. ${a}`).join("\n"),
      `Respondé *sí* para que lo ejecute así como está, o repetime el cambio que querías ` +
        `y lo rehago con eso.`,
    );
  } else {
    partes.push(
      `Pedímelo de nuevo. Si es un pedido grande, partímelo en dos: ` +
        `entregado por partes me da tiempo de terminarlo.`,
    );
  }

  if (tramos) partes.push(`⏱️ ${tramos}`);
  return partes.join("\n\n");
}
