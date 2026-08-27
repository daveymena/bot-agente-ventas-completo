/**
 * ============================================================
 * QUÉ SE SABE DE CADA PRODUCTO, Y QUÉ NO
 * ============================================================
 *
 * Hasta acá, cuando el cliente preguntaba algo que no estaba en la ficha
 * -- "¿cuánto dura?", "¿necesito teclado?", "¿trae certificado?" -- el modelo
 * lo respondía de memoria. De ahí salieron el "certificado de participación"
 * inventado, el "Portuñol" como idioma y los plazos de entrega imaginarios.
 *
 * Acá cada pregunta conocida tiene UNA respuesta escrita por el negocio. Si la
 * pregunta está en la lista, sale esa respuesta tal cual. Si no está, el
 * modelo responde -- pero sabiendo qué NO puede afirmar.
 *
 * ── Regla para quien agregue productos ──────────────────────────────────
 *
 * Una respuesta acá es una PROMESA que el negocio tiene que cumplir. No se
 * completa con lo que suena bien: se completa con lo que es cierto. Dejar una
 * pregunta sin respuesta es correcto y seguro; inventarla no.
 *
 * Las que dicen `null` están sin responder a propósito: el bot dice que lo
 * confirma en vez de improvisar.
 */

export interface PreguntaConocida {
  /** Para logs y para saber qué falta. */
  id: string;
  /** Cómo la escribe un cliente de verdad, no cómo la escribiría un manual. */
  patrones: RegExp;
  /**
   * La respuesta, tal como sale al cliente. `null` = el negocio todavía no la
   * respondió, y el bot dirá que lo confirma.
   */
  respuesta: string | null;
}

export interface ConocimientoProducto {
  productId: number;
  nombre: string;
  preguntas: PreguntaConocida[];
}

// ─── Lo que vale para TODOS los cursos de este negocio ────────────────────────
//
// Sale del perfil del negocio, que es donde el dueño ya lo declaró. No se
// repite por producto para que un cambio de política no haya que hacerlo N
// veces -- que es como se desincronizan.

const COMUNES: PreguntaConocida[] = [
  {
    id: "certificado",
    patrones: /\b(certificad\w+|diploma|titul\w+|constancia|acredita\w*)\b/i,
    // Verificado: el perfil del negocio lo declara en "lo que NO hace".
    respuesta:
      "No emite certificado 🙏 Es formación práctica: te llevas el contenido.",
  },
  {
    id: "garantia",
    patrones: /\b(garant[ií]a|devoluci[oó]n|reembolso|me devuelven|si no me gusta|si no sirve)\b/i,
    // Verificado en el perfil: 7 días, devolución completa.
    respuesta:
      "Tienes 7 días de garantía ✅ Si no te convence, te devolvemos el 100%.",
  },
  {
    id: "acceso_tiempo",
    patrones: /\b(cu[aá]nto tiempo|por cu[aá]nto|caduca|vence|expira|de por vida|para siempre|se me va)\b/i,
    respuesta:
      "El acceso te queda de por vida ♾️ Pagas una sola vez.",
  },
  {
    id: "como_llega",
    patrones: /\b(c[oó]mo (me )?(llega|lo recibo|lo veo)|d[oó]nde (lo veo|queda)|drive|descarg\w+)\b/i,
    respuesta:
      "Te llega por Google Drive 📁 Apenas confirmamos el pago te paso el acceso por aquí.",
  },
  {
    id: "dispositivos",
    patrones: /\b(celular|m[oó]vil|computador|pc|tablet|desde el tel[eé]fono|android|iphone)\b/i,
    respuesta:
      "Desde celular, tablet o computador 📱 Solo necesitas internet.",
  },
  {
    id: "es_presencial",
    patrones: /\b(presencial|sede|direcci[oó]n|academia|d[oó]nde (est[aá]n|queda)|clases en vivo|profesor en vivo)\b/i,
    respuesta:
      "Es 100% online 💻 Videos grabados que ves a tu ritmo, sin sede ni horarios.",
  },
  {
    id: "soporte",
    patrones: /\b(soporte|ayuda|dudas|si tengo problemas|acompa[ñn]amiento|tutor)\b/i,
    respuesta:
      "Tienes soporte incluido 🙌 Cualquier duda me escribes por aquí.",
  },
  {
    id: "horario_atencion",
    patrones: /\b(a qu[eé] hora|horario|hasta qu[eé] hora|atienden)\b/i,
    // Verificado en el perfil: 09:00–18:00 America/Bogota.
    respuesta: "De 9:00 a 6:00 de la tarde, hora de Colombia 🕘",
  },
];

// ─── Curso de Piano ──────────────────────────────────────────────────────────

const PIANO: ConocimientoProducto = {
  productId: 123,
  nombre: "Curso de Piano Completo",
  preguntas: [
    {
      id: "piano_nivel",
      patrones: /\b(soy principiante|desde cero|no s[eé] nada|nunca he tocado|sin experiencia|para principiantes|avanzado)\b/i,
      respuesta:
        "Va desde cero hasta avanzado 🎹 No necesitas saber nada previo.",
    },
    {
      id: "piano_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|contenido|temario|m[oó]dulos)\b/i,
      respuesta:
        "Esto es lo que incluye 🎹\n\n✅ Clases en video HD\n✅ De cero a avanzado\n✅ Partituras y ejercicios\n✅ Acceso de por vida\n✅ Soporte incluido",
    },
    {
      id: "piano_partituras",
      patrones: /\b(partitura|leer m[uú]sica|solfeo|notas)\b/i,
      respuesta:
        "Sí, trae partituras y ejercicios 🎼 Y te enseña a leerlas desde cero.",
    },
    {
      id: "piano_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntas clases|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos)\b/i,
      // 19 módulos: está en la descripción del propio catálogo.
      // 283 clases y ~19 horas: del curso original en Udemy, confirmado por
      // los marcadores que coinciden exacto (19 módulos + los 5 valses de
      // Alberto Martínez).
      respuesta:
        "19 módulos y 283 clases en video 🎹 Unas 19 horas, a tu ritmo.",
    },
    {
      id: "piano_requiere_teclado",
      patrones: /\b(necesito (un )?(piano|teclado)|hay que tener|se necesita instrumento|cu[aá]ntas teclas|sin piano)\b/i,
      respuesta:
        "Sí, necesitas piano o teclado 🎹 Para empezar te sirve cualquiera.",
    },
    {
      id: "piano_edad",
      patrones: /\b(para ni[ñn]os|edad|mi hijo|mi hija|para adultos|soy mayor|muy viejo|muy grande)\b/i,
      // "para todas las edades" está literal en la descripción del catálogo.
      respuesta:
        "Sirve para todas las edades 😊 Arranca desde cero, cada quien a su ritmo.",
    },
    {
      id: "piano_estilos",
      patrones: /\b(cl[aá]sic\w+|jazz|blues|pop|balada|reggaeton|qu[eé] estilos|improvisa\w*)\b/i,
      // Todo esto está en la descripción del catálogo.
      respuesta:
        "Toca varios estilos 🎵\n\n✅ Clásico y música clásica moderna\n✅ Pop y baladas\n✅ Blues y jazz\n✅ Improvisación con escalas y progresiones\n✅ 5 valses de Alberto Martínez",
    },
  ],
};

// ─── EDUCANINO · Adiestramiento Canino ───────────────────────────────────────

const EDUCANINO: ConocimientoProducto = {
  productId: 76,
  nombre: "EDUCANINO – Curso Completo de Adiestramiento Canino",
  preguntas: [
    {
      id: "perro_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|contenido|temario|m[oó]dulos)\b/i,
      respuesta:
        "Esto es lo que incluye 🐶\n\n✅ Obediencia básica y avanzada\n✅ Control de conductas problemáticas\n✅ Agresividad y posesividad\n✅ Ansiedad por separación\n✅ Reactividad\n✅ Entrenamiento paso a paso, en video",
    },
    {
      id: "perro_problemas",
      patrones: /\b(muerde|agresiv\w+|ladra|ansiedad|destruye|se orina|jala|hala|no obedece|reactiv\w+|posesiv\w+)\b/i,
      respuesta:
        "El curso trata justamente eso 🐕 Tiene módulos para agresividad y posesividad, ansiedad por separación, reactividad y control de conductas problemáticas. ¿Qué está haciendo tu perro?",
    },
    {
      id: "perro_experiencia",
      patrones: /\b(sin experiencia|nunca he entrenado|no s[eé] nada|primera vez|es dif[ií]cil)\b/i,
      respuesta:
        "No necesitas experiencia 🐾 Es paso a paso, desde casa.",
    },
    {
      id: "perro_edad",
      // Plurales incluidos: "sirve para cachorros?" no matcheaba con
      // `\bcachorro\b`, y es exactamente como lo escribe un cliente.
      patrones: /\bcachorr\w*|\bqu[eé] edad\b|\bmeses\b|\ba[ñn]os\b|\bes viejo\b|\bya est[aá] grande\b|\badult\w*/i,
      // Del curso original (Álvaro Osorio / Hotmart): cubre desde cachorro
      // hasta adulto mayor, con la capacidad de aprendizaje de cada etapa.
      respuesta:
        "Sirve a cualquier edad 🐶 Desde cachorro hasta adulto mayor.",
    },
    {
      id: "perro_raza",
      patrones: /\b(raza|pitbull|labrador|criollo|mestizo|sirve para mi perro|chihuahua|pastor|french|poodle)\b/i,
      respuesta:
        "Funciona con cualquier raza 🐕 Criollos incluidos.",
    },
    {
      id: "perro_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos|en cu[aá]nto tiempo)\b/i,
      // Del curso original: lecciones cortas en HD; la mayoría lo completa
      // entre 1 y 3 meses, y el acceso es permanente.
      respuesta:
        "Lecciones cortas en video 🎬 La mayoría lo termina en 1 a 3 meses, y el acceso es de por vida.",
    },
    {
      id: "perro_practico",
      patrones: /\b(es pr[aá]ctico|solo teor[ií]a|c[oó]mo se hace|ejercicios|demostraci\w+)\b/i,
      respuesta:
        "Es puro práctico 🐾 Demostraciones en video para repetir con tu perro.",
    },
  ],
};

// ─── INTELIGENCIA ARTIFICIAL 2026 ────────────────────────────────────────────
//
// Este NO se buscó afuera, y es a propósito. Se buscó en Udemy y no hay
// coincidencia: es una compilación propia, no la copia de un curso único
// (a diferencia del piano, donde "19 módulos" + "5 valses de Alberto
// Martínez" coincidían exacto). Todo lo de acá sale de su propia descripción,
// que para un pack armado es la fuente más fiable que existe.

const IA: ConocimientoProducto = {
  productId: 124,
  nombre: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  preguntas: [
    // Va primero: "¿no está viejo el contenido?" matchea "contenido" en
    // ia_incluye, y le llegaba el temario a quien preguntaba si el curso
    // está vigente. No es la misma pregunta.
    {
      id: "ia_actualizado",
      // "2026" suelto NO: el nombre del curso lo lleva, y el cliente lo
      // escribe también cuando pregunta el precio ("cuánto vale el de IA
      // 2026"). Ahí la respuesta correcta es el precio, no esta.
      // "viejo" suelto tampoco: "estoy muy viejo para esto" es la edad del
      // cliente, no la del curso. Por eso el verbo va pegado.
      patrones: /\b(actualizad\w*|desactualizad\w*|est[aá] al d[ií]a|(es|est[aá]|estar[aá]) (muy )?(viej\w+|antigu\w+)|contenido (viej\w+|antigu\w+)|versi[oó]n vieja|es del? 2026|de este a[ñn]o|sirve (para|en) 2026|para el 2026)/i,
      // "las mejores herramientas de IA de 2026", literal en la descripción.
      // Ojo: NO se promete que se actualice después; eso no está dicho.
      respuesta: "Sí, es de 2026 📅 Cubre las herramientas de IA de este año.",
    },
    {
      id: "ia_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|contenido|temario|m[oó]dulos)\b/i,
      respuesta:
        "Son 4 módulos + bonus 🤖\n\n🔥 Fundamentos: ChatGPT, Gemini, Claude, Perplexity y Copilot\n🎨 IA creativa: Midjourney, DALL·E 4, Leonardo AI\n🤖 Agentes autónomos: n8n, CrewAI, LangGraph, AutoGPT\n💼 IA para negocios: automatizar WhatsApp, email y ventas\n🎁 Plantillas listas para usar",
    },
    // Va ANTES de ia_herramientas a propósito: "¿incluye ChatGPT Plus?"
    // matchea "chatgpt", y la respuesta de herramientas contesta otra cosa
    // (qué herramientas se ven), no si hay que pagarlas. Eso sería peor que
    // no responder.
    {
      id: "ia_costo_herramientas",
      // Las palabras de plata tienen que ir PEGADAS a una herramienta. Suelto,
      // "suscripción" o "mensualidad" es la pregunta por la forma de pago del
      // curso -- que sí tiene respuesta (pago único) y no se puede tapar con
      // un "déjame confirmarte".
      patrones: /\b(chatgpt plus|pagar (aparte|las herramientas|algo m[aá]s|otra cosa)|pagarlas aparte|se pagan? aparte|toca pagar aparte|versi[oó]n (paga|premium|de pago)|cuenta (paga|premium))|(suscripci[oó]n|mensualidad|licencia\w*|gratis|gratuit\w*|de pago|hay que pagar|cuestan|tienen costo|se pagan?)[^?!.]{0,30}(herramienta|chatgpt|midjourney|gemini|copilot|leonardo|dall|n8n|autogpt|crewai|perplexity)|(herramienta|chatgpt|midjourney|gemini|copilot|leonardo|dall|n8n|autogpt|crewai|perplexity)\w*[^?!.]{0,30}(gratis|gratuit\w*|de pago|cuestan|hay que pagar|tienen costo|se pagan?|suscripci[oó]n|mensualidad|licencia)/i,
      // Sin responder: la descripción nombra las herramientas pero NO dice
      // nada de sus planes ni de si el curso incluye alguna suscripción. Es
      // exactamente el dato que genera devoluciones si se afirma de más.
      respuesta: null,
    },
    {
      id: "ia_herramientas",
      patrones: /\b(chatgpt|gemini|claude|perplexity|copilot|midjourney|dall|leonardo|n8n|crewai|langgraph|autogpt|qu[eé] herramientas)\b/i,
      respuesta:
        "Cubre las principales 🤖 ChatGPT, Gemini, Claude, Perplexity y Copilot para el día a día; Midjourney, DALL·E 4 y Leonardo AI para crear imágenes y video; y n8n, CrewAI, LangGraph y AutoGPT para armar agentes que trabajen solos.",
    },
    {
      id: "ia_agentes",
      // "agentes" en plural: el singular lo escribe quien pide hablar con una
      // persona ("me pasas un agente"), y esa no es esta pregunta.
      // Sin "24/7" suelto: así se pregunta por el horario de atención, y esa
      // ya tiene su respuesta en las comunes.
      patrones: /\bagentes\b|agentes? aut[oó]nom\w*|trabajen? por m[ií]\b|trabajan solos|piensan solos|multi.?tarea/i,
      // "agentes autónomos que trabajen por ti 24/7" y las 4 herramientas
      // están literales en la descripción.
      respuesta:
        "Sí, aprendes a crear agentes que trabajan por ti 24/7 🤖 Con n8n, CrewAI, LangGraph y AutoGPT.",
    },
    {
      id: "ia_creativa",
      // Pide el VERBO al lado: "video" o "imagen" sueltos son otra cosa
      // ("¿el curso viene en videos?", "mándame una imagen del curso").
      patrones: /\b(crea\w*|hace\w*|haga\w*|gener\w*|dise[ñn]\w*|edita\w*)[^?!.]{0,15}(im[aá]gen|video|logo|contenido|foto|arte)|\b(dise[ñn]o gr[aá]fico|contenido visual|miniaturas?|ia creativa|edici[oó]n de video)/i,
      respuesta:
        "Sí, tiene un módulo de IA creativa 🎨 Imágenes y video con Midjourney, DALL·E 4 y Leonardo AI.",
    },
    {
      id: "ia_prompts",
      patrones: /\bprompt\w*|ingenier[ií]a de prompt|\bc[oó]mo (le )?(pregunto|hablo|escribo|pido) a (la ia|chatgpt)/i,
      // "Cómo escribir prompts que generen resultados reales", literal.
      respuesta:
        "Sí 🔥 El módulo 1 enseña a escribir prompts que generen resultados reales.",
    },
    {
      id: "ia_negocio",
      patrones: /\b(para mi negocio|automatizar|chatbot|whatsapp|vender|monetizar|ganar dinero|emprend\w+)\b/i,
      respuesta:
        "Tiene un módulo entero para eso 💼 Automatizar WhatsApp, email y ventas, crear chatbots inteligentes y monetizar con IA. Y vienen plantillas listas para usar 🎁",
    },
    {
      id: "ia_plantillas",
      patrones: /\b(plantillas?|templates?|bonus)/i,
      // "🎁 BONUS: Plantillas listas para usar". Cuáles son NO está dicho, y
      // por eso la respuesta no las enumera.
      respuesta:
        "Sí, trae plantillas listas para usar 🎁 Vienen incluidas como bonus.",
    },
    {
      id: "ia_programar",
      // "hay que SABER programar" es como se pregunta de verdad: el verbo del
      // medio hacía que no matcheara.
      patrones: /\bprogram\w+\b|\bc[oó]digo\b|\bsoy t[eé]cnico\b|\bsin experiencia\b|\bno s[eé] de (tecnolog[ií]a|computador)/i,
      // "sin código" está literal en la descripción, referido a n8n.
      respuesta:
        "No necesitas programar 🙌 Se arma con n8n, que es sin código.",
    },
    {
      id: "ia_nivel",
      patrones: /\b(desde cero|principiante|novat\w*|soy nuevo|no s[eé] nada|nunca he (usado|trabajado|manejado)|es dif[ií]cil|es complicado|ser[aá] muy dif[ií]cil)/i,
      // Lo único verificable acá es que el curso ARRANCA por fundamentos: el
      // módulo 1 lo dice. NO se afirma "no necesitas saber nada previo": eso
      // la descripción no lo dice en ninguna parte.
      respuesta:
        "Arranca por los fundamentos 🤖 El módulo 1 es ChatGPT, Gemini, Claude y cómo escribir prompts.",
    },
    // ── De acá para abajo: preguntas que el cliente SÍ hace y que la
    // descripción no responde. Van escritas igual, con su patrón, para que el
    // bot diga "lo confirmo" en vez de improvisar -- que es de donde salieron
    // el Discord y las 24 lecciones que no existen.
    {
      id: "ia_idioma",
      // Las herramientas del curso son gringas; preguntar por el idioma es de
      // lo primero que hace un cliente. Y ya hubo un "Portuñol" inventado.
      patrones: /\b(idioma|en espa[ñn]ol|en ingl[eé]s|est[aá] en espa[ñn]ol|subt[ií]tul\w*|traducid\w*|doblad\w*)/i,
      respuesta: null,
    },
    {
      id: "ia_perfil",
      // La descripción dice QUÉ enseña, nunca A QUIÉN va dirigido. Decir
      // "sirve para estudiantes" o "para amas de casa" sería inventarlo.
      patrones: /\b(para qui[eé]n es|a qui[eé]n le sirve|qu[eé] perfil|sirve para cualquier persona|soy (estudiante|ama de casa|contador\w*|profesor\w*|independiente|pensionad\w*|desemplead\w*))/i,
      respuesta: null,
    },
    {
      id: "ia_empleo",
      // Va DESPUÉS de ia_negocio: si preguntan por vender o monetizar, gana
      // el módulo 4, que sí existe. Lo que no existe es una promesa de
      // trabajo o de clientes, y esa no se firma.
      patrones: /\b(consigo|conseguir|encontrar|para) (trabajo|empleo|clientes)|freelance|ofrecer servicios|me contraten|bolsa de empleo|salir a vender esto|puedo cobrar/i,
      respuesta: null,
    },
    {
      id: "ia_resultados",
      // Cuánto se demora en ver resultados no está dicho, y es justo el dato
      // que si se infla vuelve como devolución.
      patrones: /\b(en cu[aá]nto tiempo (veo|logro|aprendo|empiezo)|cu[aá]ndo (veo|voy a ver) resultados|qu[eé] tan r[aá]pido|cu[aá]nto me demoro|resultados garantiz\w*|funciona de verdad)/i,
      respuesta: null,
    },
    // Sin responder: no está en su descripción y no se puede verificar afuera
    // porque es un pack armado, no un curso publicado.
    {
      id: "ia_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntas clases|cu[aá]ntos videos)\b/i,
      respuesta: null,
    },
  ],
};

const CATALOGO: ConocimientoProducto[] = [PIANO, EDUCANINO, IA];

// ─── Búsqueda ────────────────────────────────────────────────────────────────

export interface Respuesta {
  id: string;
  /** El texto listo para enviar. */
  texto: string;
  /** true = el negocio no respondió esta pregunta; se dice que se confirma. */
  sinResponder: boolean;
}

/**
 * La respuesta a lo que preguntó el cliente, si es una pregunta conocida.
 *
 * Las del producto van PRIMERO: "¿qué incluye?" tiene una respuesta distinta
 * para cada curso, y la genérica taparía la específica.
 *
 * Devuelve null cuando la pregunta no está en la lista. Ahí responde el
 * modelo, que es lo correcto: una base de conocimiento no puede cubrir todo lo
 * que a una persona se le ocurre preguntar, y fingir que sí es peor.
 */
export function responderPregunta(productId: number | null, mensaje: string): Respuesta | null {
  const texto = String(mensaje || "");
  if (!texto.trim()) return null;

  const delProducto = productId ? CATALOGO.find((c) => c.productId === productId) : null;
  const candidatas = [...(delProducto?.preguntas ?? []), ...COMUNES];

  for (const p of candidatas) {
    if (!p.patrones.test(texto)) continue;
    if (p.respuesta === null) {
      return {
        id: p.id,
        sinResponder: true,
        texto: "Déjame confirmarte ese dato exacto y te respondo enseguida 🙏",
      };
    }
    return { id: p.id, texto: p.respuesta, sinResponder: false };
  }
  return null;
}

/** Las preguntas que el negocio todavía no respondió. Para el panel. */
export function preguntasSinResponder(): Array<{ producto: string; pregunta: string }> {
  const faltan: Array<{ producto: string; pregunta: string }> = [];
  for (const c of [...CATALOGO, { productId: 0, nombre: "Todos los cursos", preguntas: COMUNES }]) {
    for (const p of c.preguntas) {
      if (p.respuesta === null) faltan.push({ producto: c.nombre, pregunta: p.id });
    }
  }
  return faltan;
}

/** ¿Hay conocimiento cargado para este producto? */
export function tieneConocimiento(productId: number | null): boolean {
  return !!productId && CATALOGO.some((c) => c.productId === productId);
}

// ─── La palabra que va antes ─────────────────────────────────────────────────

/**
 * Una apertura corta antes de entregar la información.
 *
 * Regla del admin (2026-08-27): "que no la entregue igual siempre, que tenga
 * una palabra introductoria antes de entregar la info".
 *
 * Son cortas y NO afirman nada del producto: "¡excelente elección!" es un
 * juicio que el bot no puede hacer, y ya hubo que sacar frases de ese tipo.
 * Estas solo acusan recibo, que es lo que hace una persona atendiendo.
 */
const APERTURAS = [
  "Claro que sí 😊",
  "Con gusto 😊",
  "Te cuento 👇",
  "Mira 👇",
  "Claro 👇",
  "De una 😊",
];

export function aperturaPara(semilla: string): string {
  let h = 0;
  const s = String(semilla || "x");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return APERTURAS[h % APERTURAS.length]!;
}
