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

// ⚠️ Los nombres de modelo van AGRUPADOS y con \b a los dos lados. Sin el
// paréntesis, `\ba|b|c\b` solo ancla la primera y la última alternativa: las
// del medio casan como subcadena. Así fue como `llama` --que estaba suelto--
// se comió "se llama", "llámame" y "una llamada", que es media conversación
// de ventas. Y por eso `llama` ahora exige el número de versión: el modelo se
// llama Llama 3, pero en español "llama" es un verbo de todos los días.
const TRIPAS =
  /\bque (inteligencia artificial|ia|modelo|tecnologia|lenguaje|programa|sistema|software|framework|base de datos) (usas|usan|utilizan|tienen|corre|manejan)\b|\bcon que (esta|estan) (hecho|hecha|construido|construida|programado|programada)\b|\bcomo (esta|fue) (hecha|hecho|construida|construido|programada|programado|desarrollada)\b|\bque hay (por dentro|detras)\b|\bcomo funciona(s| el bot| por dentro)\b|\b(chatgpt|gpt|claude|gemini|deepseek|openai|anthropic|groq|mistral|copilot)\b|\bllama[ -]?[0-9]|\bque (servidor|hosting|api)\b|\bcodigo fuente\b|\bstack\b/;

const INSTRUCCIONES =
  // El posesivo tiene que referirse AL BOT: "tus reglas" si, "las reglas del
  // curso" no. Por eso no entra "las".
  /\b(tu|tus|sus|su) (prompt|prompts|instrucciones|reglas|configuracion|system prompt)\b|\bque te (dijeron|programaron|instruyeron)\b|\bignora (las|tus) (instrucciones|reglas)\b|\brepite (tu|el) prompt\b|\bmuestrame (tu|el) (prompt|codigo|configuracion)\b|\bactua como\b|\bolvida (todo|tus instrucciones)\b/;

/**
 * ============================================================
 * EL NEGOCIO SIEMPRE PUEDE HABLAR DE LO QUE VENDE
 * ============================================================
 *
 * Esto es multi-tenant: cada dueño arma su catálogo por Atlas. Una lista de
 * palabras prohibidas escrita a mano sirve para el negocio que uno tenía en la
 * cabeza al escribirla, y rompe el de al lado.
 *
 * Medido el 2026-09-02 sobre seis rubros:
 *
 *   academia de programación  "¿el curso trae el código fuente?"     -> cortado
 *   academia de programación  "¿qué stack usan en el curso?"          -> cortado
 *   hosting                   "¿qué servidor me recomiendan?"         -> cortado
 *   curso de IA               "¿el curso enseña a usar ChatGPT?"      -> cortado
 *   curso de IA               "¿trabajan con Gemini en el curso?"     -> cortado
 *
 * Ninguno preguntaba por lo de adentro: los cinco preguntaban por la mercancía.
 * Y del otro lado se borraban mensajes de venta enteros -- "te entregamos el
 * código fuente de los 12 proyectos" es la ficha del producto.
 *
 * La regla correcta no se puede escribir a mano, porque depende del catálogo:
 *
 *   Si la palabra está en lo que este negocio VENDE, no es una fuga: es la
 *   mercancía. Salvo que la frase hable del propio sistema.
 *
 * Así ningún dueño tiene que configurar nada, y un negocio nuevo que venda
 * hosting o cursos de IA funciona el primer día.
 */

/** Las palabras del catálogo de ESTE negocio. Nombres y descripciones. */
export type Vocabulario = Set<string>;

export function vocabularioDelNegocio(
  productos: Array<{ name?: string | null; description?: string | null }> | null | undefined
): Vocabulario {
  const v: Vocabulario = new Set();
  for (const p of productos || []) {
    const texto = N(`${p?.name || ""} ${p?.description || ""}`);
    for (const palabra of texto.split(/[^a-z0-9]+/)) {
      if (palabra.length >= 3) v.add(palabra);
    }
  }
  return v;
}

/** ¿Alguna de las palabras que se marcaron es, en realidad, mercancía? */
function esMercancia(termino: string, vocab?: Vocabulario): boolean {
  if (!vocab || vocab.size === 0) return false;
  // Un término de varias palabras ("codigo fuente", "base de datos") cuenta si
  // el catálogo tiene todas.
  return termino
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
    .every((w) => vocab.has(w));
}

/**
 * La pregunta viene enmarcada en el catálogo.
 *
 * "¿qué inteligencia artificial usas?" pregunta por el bot.
 * "¿el curso enseña a usar ChatGPT?" pregunta por el curso.
 *
 * La diferencia no está en la palabra técnica -- está en de qué habla la frase.
 */
const PREGUNTA_POR_LA_MERCANCIA =
  /\b(el|la|los|las|su|mi|este|esta|ese|esa) (curso|cursos|plan|planes|producto|productos|paquete|pack|combo|servicio|servicios|modulo|modulos|clase|clases|programa|taller|membresia|suscripcion)\b|\b(incluye|trae|ensena|ensenan|aprendo|aprendes|aprende|venden|vende|tienen|manejan el|recomiendan|recomienda|me sirve|sirve para|cuanto vale|cuanto cuesta|precio)\b/;

/**
 * ¿El cliente está preguntando por lo de adentro?
 *
 * `vocab` es el catálogo del negocio; sin él se comporta como antes.
 */
export function preguntaPorLoInterno(mensaje: string, vocab?: Vocabulario): Curiosidad {
  const m = N(mensaje);
  // Las instrucciones van primero: "muéstrame tu prompt" también menciona
  // tecnología, y lo que importa es que se está intentando extraer el sistema.
  // Estas dos NO consultan el catálogo: nadie vende "ignora tus instrucciones",
  // y "¿eres un bot?" pregunta por el bot en cualquier rubro.
  if (INSTRUCCIONES.test(m)) return "instrucciones";
  if (IDENTIDAD.test(m)) return "identidad";

  if (TRIPAS.test(m)) {
    // Acá sí: "tripas" es la única de las tres que se confunde con mercancía.
    if (PREGUNTA_POR_LA_MERCANCIA.test(m)) return null;
    const termino = (m.match(TRIPAS) || [""])[0];
    if (esMercancia(termino, vocab)) return null;
    return "tripas";
  }
  return null;
}

/**
 * Palabras que no pueden salir en un mensaje al cliente.
 *
 * No se trata de censurar: se trata de que nada de lo que el dueño construyó
 * viaje en un chat de ventas. Si aparecen, la respuesta se reemplaza entera --
 * recortar la frase dejaría el resto hablando del tema igual.
 */
/**
 * Una sola lista plana no servía, y el motivo importa: esto reemplaza el
 * mensaje ENTERO. Un falso positivo no censura una palabra -- deja al cliente
 * sin respuesta y con una frase que no viene a cuento.
 *
 * Y la mitad de estas palabras son ambiguas por naturaleza: "base de datos",
 * "servidor", "node", "react" delatan si el bot habla de sí mismo, pero son el
 * NOMBRE DEL PRODUCTO si el negocio vende cursos de eso. La palabra sola no
 * alcanza para decidir; hace falta de quién está hablando la frase.
 *
 * Por eso son tres listas y no una.
 */

/** No puede ser otra cosa que lo de adentro. Con la palabra basta. */
const NOMBRES_DE_ADENTRO =
  /\b(chatgpt|gpt-?[0-9]|claude|gemini|deepseek|openai|anthropic|groq|mistral|copilot)\b|\bllama[ -]?[0-9]|\b(api key|system prompt|codigo fuente|easypanel)\b|\b(mi|mis|tu|tus) (prompt|instrucciones internas|reglas internas)\b/;

/** Técnica, pero puede ser perfectamente el curso que se está vendiendo. */
const TECNICA_AMBIGUA =
  /\b(base de datos|servidor|servidores|backend|frontend|endpoint|webhook|repositorio|postgres|sqlite|node|react|typescript|docker|hosting|api)\b/;

/**
 * La frase habla del PROPIO sistema.
 *
 * Ojo con el posesivo: "nuestra base de datos" delata, pero "nuestro curso de
 * Node" es el catálogo. Por eso el posesivo va pegado a lo que puede ser de la
 * app, y no suelto.
 */
/**
 * El bot hablando de SÍ MISMO, sin ninguna duda posible.
 *
 * Estas no las salva el catálogo: vender cursos de Node no autoriza a decir
 * con qué está hecho el bot. Van en primera persona a propósito -- ahí no hay
 * ambigüedad con la mercancía.
 */
const SE_DELATA_SOLO =
  /\bestoy (hecho|hecha|programado|programada|construido|construida)\b|\bme (programaron|construyeron|entrenaron)\b|\bmi (prompt|modelo|codigo|sistema)\b|\bmis instrucciones\b|\binternamente\b|\b(corro|corremos|corre) (en|sobre)\b|\b(uso|usamos|utilizo|utilizamos) [^.!?\n]{0,30}?para (responder|responderte|atenderte|contestarte|contestar)\b|\bnuestr[oa]s? (sistema|servidor|servidores|base de datos|infraestructura|codigo)\b/;

/**
 * Suena a que habla de sí mismo, pero puede ser el catálogo.
 *
 * ⚠️ Acá estaban "usan", "usamos", "utilizan" y "manejamos", y NO podían
 * estar: son las palabras con las que se describe cualquier curso. Medido
 * contra producción el 2026-09-02, sobre el curso de IA del propio negocio:
 *
 *   "Aprendes a usar las herramientas que USAN los profesionales:
 *    Claude, Gemini y n8n."
 *
 * Esa frase se reemplazaba entera por "de la parte técnica no te puedo
 * contar". El cliente había preguntado "¿tienes más información?" y el bot le
 * contestó que no podía hablar del tema -- sobre el producto que vende, cuyo
 * nombre literal es "Curso completo de Claude AI".
 *
 * Por eso esta lista es ambigua por definición y SÍ consulta el catálogo: "el
 * curso está hecho con ejemplos reales" es mercancía; "estoy hecha con Node"
 * es el bot, y esa va arriba.
 */
const HABLA_DE_SI_MISMO =
  /\b(esta hecho|esta hecha|construido con|construida con|programado en|programada en|funciona con)\b/;

/**
 * Afirmar que es una persona.
 *
 * Esta no es una fuga: es una mentira, y se colaba entera. El guardia solo
 * miraba la PREGUNTA ("¿eres un bot?"), así que el bot podía decir "soy una
 * persona real" por su cuenta y nadie lo revisaba. Medido el 2026-09-02: se
 * escapaba.
 *
 * El bot puede llamarse Camila y hablar cálido -- eso no engaña a nadie.
 * Afirmar que es humano sí, y en varios países está regulado.
 */
// El nombre se mete en el medio -- "Soy Camila, una persona real" -- así que
// la segunda alternativa deja pasar hasta 30 caracteres entre el "soy" y la
// afirmación. Para no marcar de más, esa variante exige el calificativo
// ("real", "de verdad"): así "te paso con una persona" del propio texto seguro
// no se marca a sí mismo.
const AFIRMA_SER_HUMANO =
  /\b(soy|somos) (una |un )?(persona|humano|humana|ser humano)\b|\b(soy|somos)\b[^.!?\n]{0,30}\b(persona|humano|humana) (real|de verdad|de carne y hueso)\b|\bno soy (un |una )?(bot|robot|maquina|ia|inteligencia artificial|programa)\b|\bsoy real\b|\bte (habla|atiende) una persona\b/;

/**
 * HABLAR COMO SOFTWARE EN VEZ DE COMO EL VENDEDOR DEL NEGOCIO.
 *
 * 🔻 AGREGADO el 2026-09-03. El admin pidió endurecer contra fugas, y en vez
 * de suponer qué faltaba se pasó una batería de 20 frases que el bot podría
 * llegar a decir. **Pasaron 19.**
 *
 * Lo que había cubría dos familias --nombres de proveedores ("GPT-4") y
 * "estoy hecho con"-- y dejaba afuera la más común de todas: el asistente
 * hablando de su propia maquinaria con palabras que no nombran a ningún
 * proveedor.
 *
 *   "Como modelo de lenguaje, no puedo hacer eso."
 *   "Mi entrenamiento llega hasta 2024."
 *   "No tengo acceso a esa información en mi base de conocimientos."
 *   "Deja reviso en el panel de administración."
 *   "El administrador configuró este catálogo."
 *   "Perdón, tuve un error 500."
 *   "Estoy en fase de pruebas todavía."
 *
 * Ninguna nombra un proveedor y todas delatan. Y varias hacen algo peor que
 * filtrar: le dicen al cliente que del otro lado hay un programa con fallas,
 * justo cuando está por pagar.
 *
 * ── Por qué estas NO consultan el catálogo ───────────────────────────────
 *
 * Porque van en PRIMERA PERSONA sobre el propio funcionamiento. Un negocio
 * puede vender un curso de modelos de lenguaje; eso no autoriza a decir "como
 * modelo de lenguaje, no puedo". La ambigüedad con la mercancía aparece cuando
 * se habla del producto ("el curso enseña modelos de lenguaje"), y esa forma
 * no casa acá: se exige el "yo" o una referencia a la administración.
 */
const HABLA_COMO_SOFTWARE =
  /\bcomo (un |una )?(modelo de lenguaje|ia\b|inteligencia artificial|asistente virtual|chatbot|bot\b)|\bsoy (un |una )?(asistente virtual|chatbot|bot|ia|inteligencia artificial|modelo de lenguaje)\b/;

/**
 * Cada familia va en su propia constante y no todas en una regex gigante.
 *
 * Una sola expresión con veinte alternativas no se puede leer ni corregir, y
 * este archivo ya tiene el precedente de una regex que quedó muda por un
 * escape mal puesto sin que nadie lo notara.
 */
const DE_SI_MISMO_TECNICO =
  /\bmi(s)? (entrenamiento|conocimiento|base de (datos|conocimientos)|configuracion|programacion|version|sistema|motor|desarrollador|creador|contexto|memoria|capacidades|limitaciones)\b|\bfui (entrenado|entrenada|programado|programada|creado|creada|disenado|disenada)\b|\bmi entrenamiento\b/;

/** Lo que solo existe del lado de adentro: paneles, admins, configuraciones. */
const COCINA_DEL_NEGOCIO =
  /\b(panel de (administracion|control|admin)|backoffice|administrador|el dueno configuro|configuro (el|este) (catalogo|sistema|bot)|base de datos del negocio)\b|\b(reviso|revisar|consultar|consulto|mirar|miro) (en )?(el|mi) (sistema|panel|backend|base de datos|catalogo interno)\b/;

/** Fallas de software contadas al cliente. */
const CONFIESA_FALLAS =
  // El "me" del medio ("se ME cayo la conexion") rompia la coincidencia: en
  // castellano el pronombre se mete entre el "se" y el verbo, y una regex que
  // no lo contempla falla justo con la forma que la gente escribe.
  /\berror \d{3}\b|\b(error interno|fallo el servidor|se (me |nos )?cayo (el|la) (servidor|conexion|sistema)|no puedo acceder (a|al) (la )?(base de datos|sistema|servidor)|estoy en (fase de )?(pruebas|beta|mantenimiento)|version (actual|beta) no (soporta|permite))\b/;

/** Nombrar la plataforma o el andamiaje que sostiene al bot. */
const NOMBRA_LA_PLATAFORMA =
  /\b(ventaspro|plataforma del dueno|el prompt que me dieron|mis instrucciones|procesando tu solicitud|estoy usando el modelo|segun mi contexto|no esta en mi (contexto|prompt))\b/;

/**
 * La frase habla de lo que se VENDE, no del bot.
 *
 * "Aprendes a...", "el curso incluye...", "vas a poder..." son la voz del
 * catalogo. Un proveedor nombrado dentro de una oracion asi es contenido del
 * producto, no una confesion sobre la maquinaria.
 *
 * ⚠️ A proposito NO alcanza con que aparezca la palabra "curso": tiene que
 * estar el verbo que la convierte en mercancia. "El curso corre en mi
 * servidor" nombra el curso y sigue siendo una fuga.
 */
const HABLA_DE_LA_MERCANCIA =
  /\b(aprendes|aprende|aprenderas|aprenderan|te ensena|te ensenamos|ensena a|incluye|trae|vas a poder|vas a aprender|veras|veras como|contiene|abarca|cubre)\b/;

/**
 * ¿La frase toca el terreno de este negocio, más allá del nombre marcado?
 *
 * Se excluye el propio término señalado --si no, se rescataría a sí mismo-- y
 * las palabras cortas, que son artículos y preposiciones y las tiene cualquier
 * catálogo.
 */
function compartePalabraConElCatalogo(texto: string, marcado: string, vocab?: Vocabulario): boolean {
  if (!vocab || vocab.size === 0) return false;
  const delMarcado = new Set(marcado.split(/[^a-z0-9]+/));
  return texto
    .split(/[^a-z0-9]+/)
    .some((w) => w.length >= 3 && !delMarcado.has(w) && vocab.has(w));
}

/**
 * ¿Este mensaje delata lo de adentro?
 *
 * `vocab` es el catálogo del negocio: si la palabra marcada es mercancía que
 * este dueño vende, no es una fuga -- salvo que la frase hable del propio
 * sistema, que es lo que separa "aprendes a usar ChatGPT" de "uso GPT-4 para
 * responderte".
 */
export function delataLoInterno(texto: string, vocab?: Vocabulario): boolean {
  const t = N(texto);

  // 1. Lo que no puede ser mercancía de nadie. El catálogo no lo salva.
  if (AFIRMA_SER_HUMANO.test(t)) return true;
  if (SE_DELATA_SOLO.test(t)) return true;
  // Las cinco familias nuevas: van acá arriba, con las duras, porque todas
  // hablan en primera persona del propio funcionamiento o nombran la cocina
  // del negocio. Vender un curso de IA no autoriza a decir "mi entrenamiento".
  if (HABLA_COMO_SOFTWARE.test(t)) return true;
  if (DE_SI_MISMO_TECNICO.test(t)) return true;
  if (COCINA_DEL_NEGOCIO.test(t)) return true;
  if (CONFIESA_FALLAS.test(t)) return true;
  if (NOMBRA_LA_PLATAFORMA.test(t)) return true;

  const nombre = t.match(NOMBRES_DE_ADENTRO);
  const tecnica = t.match(TECNICA_AMBIGUA);

  // 2. Suena a que habla de sí mismo Y hay una palabra técnica. Puede ser el
  //    bot ("está hecho con React") o el producto ("el curso está hecho con
  //    ejemplos de React"). Lo decide el catálogo de ESTE negocio.
  if (HABLA_DE_SI_MISMO.test(t) && (nombre || tecnica)) {
    return !esMercancia((nombre || tecnica)![0], vocab);
  }

  // 3. Un nombre propio de proveedor, suelto. Fuga, salvo que sea lo que el
  //    negocio vende -- que es el caso del curso de Claude y Gemini.
  //
  //    Y salvo que la FRASE lo enmarque como mercancia. El catalogo por si
  //    solo no alcanza: "aprendes a crear agentes con n8n y OpenAI" quedaba
  //    bloqueado porque el dueno no habia escrito "OpenAI" en la descripcion,
  //    aunque la oracion diga con todas las letras que es lo que el cliente va
  //    a APRENDER. Es la misma idea que `PREGUNTA_POR_LA_MERCANCIA` ya aplica
  //    a las preguntas, ahora tambien sobre lo que sale.
  if (nombre) {
    if (esMercancia(nombre[0], vocab)) return false;
    // La frase enmarcada como catálogo rescata SOLO si este negocio de verdad
    // trabaja en ese terreno.
    //
    // ⚠️ Acá bastaba con el enmarcado ("aprendes...") y estaba mal: con esa
    // regla, un adiestrador canino podía decir "aprendes a escribir prompts
    // para ChatGPT" y pasaba. La prueba que ya existía lo cazó, y tenía razón
    // -- el marco de la oración no puede comprar permiso solo.
    //
    // Lo que sí lo compra es que la oración comparta alguna palabra con el
    // catálogo REAL: en "aprendes a crear agentes con n8n y OpenAI", `n8n` está
    // en la ficha del curso, así que el negocio evidentemente vende de eso
    // aunque el dueño nunca haya escrito "OpenAI". En la frase del adiestrador
    // no hay una sola palabra suya, y por eso sigue siendo fuga.
    if (HABLA_DE_LA_MERCANCIA.test(t) && compartePalabraConElCatalogo(t, nombre[0], vocab)) return false;
    return true;
  }

  return false;
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
