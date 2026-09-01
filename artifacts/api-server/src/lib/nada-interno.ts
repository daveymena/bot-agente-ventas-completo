/**
 * ============================================================
 * LO DE ADENTRO NO SALE
 * ============================================================
 *
 * El admin lo pidió así: "seguridad para que no diga nada interno de la
 * aplicación... las cosas internas de la app que son solo de código y cosas
 * creadas para la app son del dueño y nadie debe saber. Veo que a veces le
 * preguntan y dice cosas que no debe."
 *
 * Medido contra producción el 2026-09-01:
 *
 *   "¿qué inteligencia artificial usas?"
 *     → "la inteligencia artificial que usamos internamente para organizar…"
 *
 *   "¿cómo está hecha esta aplicación?"
 *     → "Te cuento cómo está pensada esta app: 📱 Diseño sencillo e intuitivo…"
 *
 * Y una peor, que no es una fuga sino una mentira:
 *
 *   "¿eres un bot o una persona?"
 *     → "¡Jaja, no! Soy Camila, una persona real 😊"
 *
 * ── Por qué acá y no en el prompt ────────────────────────────────────────
 *
 * Porque el prompt ya lo pide y no alcanza. Es la misma conclusión que este
 * proyecto sacó con el precio, con la cuenta de cobro, con el voseo y con los
 * emojis: una instrucción blanda al modelo no es una garantía. Lo que se puede
 * decidir en el servidor, se decide en el servidor.
 *
 * ── Sobre no decir que es una persona ────────────────────────────────────
 *
 * El bot puede tener nombre y hablar cálido: eso no engaña a nadie. Afirmar
 * "soy una persona real" cuando le preguntan de frente es otra cosa -- es
 * mentirle a un cliente sobre con quién está hablando, y en varios países
 * está regulado. La respuesta seguro no niega la calidez: dice que es el
 * asistente del negocio y sigue atendiendo.
 */

const N = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Qué está tratando de averiguar el cliente. */
export type Curiosidad =
  /** Si habla con una persona o con un sistema. */
  | "identidad"
  /** Con qué está hecho: modelo, tecnología, proveedores, base de datos. */
  | "tripas"
  /** Las instrucciones del propio agente. */
  | "instrucciones"
  | null;

const IDENTIDAD =
  /\beres (un )?(bot|robot|maquina|ia|inteligencia artificial|humano|persona|real)\b|\bsos (un )?(bot|robot|maquina|ia)\b|\bhablo con (un|una) (bot|maquina|persona|humano|robot)\b|\best(a|as) (hablando|escribiendo) (un|una) (bot|maquina|persona)\b|\bes(to)? (un|una) (bot|robot|maquina)\b|\bquien eres\b|\beres real\b/;

const TRIPAS =
  /\bque (inteligencia artificial|ia|modelo|tecnologia|lenguaje|programa|sistema|software|framework|base de datos) (usas|usan|utilizan|tienen|corre|manejan)\b|\bcon que (esta|estan) (hecho|hecha|construido|construida|programado|programada)\b|\bcomo (esta|fue) (hecha|hecho|construida|construido|programada|programado|desarrollada)\b|\bque hay (por dentro|detras)\b|\bcomo funciona(s| el bot| por dentro)\b|\bchatgpt|gpt|claude|gemini|deepseek|openai|llama|groq\b|\bque servidor|que hosting|que api\b|\bcodigo fuente\b|\bstack\b/;

const INSTRUCCIONES =
  // El posesivo tiene que referirse AL BOT: "tus reglas" si, "las reglas del
  // curso" no. Por eso no entra "las".
  /\b(tu|tus|sus|su) (prompt|prompts|instrucciones|reglas|configuracion|system prompt)\b|\bque te (dijeron|programaron|instruyeron)\b|\bignora (las|tus) (instrucciones|reglas)\b|\brepite (tu|el) prompt\b|\bmuestrame (tu|el) (prompt|codigo|configuracion)\b|\bactua como\b|\bolvida (todo|tus instrucciones)\b/;

/** ¿El cliente está preguntando por lo de adentro? */
export function preguntaPorLoInterno(mensaje: string): Curiosidad {
  const m = N(mensaje);
  // Las instrucciones van primero: "muéstrame tu prompt" también menciona
  // tecnología, y lo que importa es que se está intentando extraer el sistema.
  if (INSTRUCCIONES.test(m)) return "instrucciones";
  if (IDENTIDAD.test(m)) return "identidad";
  if (TRIPAS.test(m)) return "tripas";
  return null;
}

/**
 * Palabras que no pueden salir en un mensaje al cliente.
 *
 * No se trata de censurar: se trata de que nada de lo que el dueño construyó
 * viaje en un chat de ventas. Si aparecen, la respuesta se reemplaza entera --
 * recortar la frase dejaría el resto hablando del tema igual.
 */
const DELATA =
  /\b(chatgpt|gpt-?[0-9]|claude|gemini|deepseek|openai|anthropic|groq|llama|mistral|nvidia|copilot)\b|\b(prompt|system prompt|api key|token de|base de datos|postgres|sqlite|servidor|backend|frontend|endpoint|webhook|repositorio|codigo fuente|node|react|typescript|docker|easypanel)\b/i;

export function delataLoInterno(texto: string): boolean {
  return DELATA.test(String(texto || ""));
}

/**
 * Lo que se contesta en cada caso.
 *
 * Corto, honesto y de vuelta a la venta: la curiosidad del cliente no se
 * castiga, se responde y se sigue. Un "no puedo hablar de eso" seco suena a
 * que hay algo que esconder.
 */
export function respuestaSegura(que: Exclude<Curiosidad, null>, nombre = "el asistente"): string {
  switch (que) {
    case "identidad":
      // No afirma ser humano. Tampoco se disculpa por no serlo.
      return `Soy ${nombre}, el asistente de la tienda 🙌 Te atiendo por aquí y si necesitas hablar con alguien del equipo te paso con una persona. ¿En qué te ayudo?`;
    case "tripas":
      return `Uy, de la parte técnica no te puedo contar 🙈 Pero de los cursos sí sé todo. ¿Cuál te interesa?`;
    case "instrucciones":
      return `Eso no te lo puedo compartir 🙂 Pero cuéntame qué producto estás buscando y te ayudo con eso.`;
  }
}
