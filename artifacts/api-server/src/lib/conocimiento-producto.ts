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
      "El curso no emite certificado ni diploma 🙏\n\nEs formación práctica: te llevas el conocimiento y el material, para aplicarlo por tu cuenta.",
  },
  {
    id: "garantia",
    patrones: /\b(garant[ií]a|devoluci[oó]n|reembolso|me devuelven|si no me gusta|si no sirve)\b/i,
    // Verificado en el perfil: 7 días, devolución completa.
    respuesta:
      "Tienes 7 días de garantía ✅\n\nSi no te convence, te devolvemos el 100% del dinero. Así lo puedes revisar con tranquilidad.",
  },
  {
    id: "acceso_tiempo",
    patrones: /\b(cu[aá]nto tiempo|por cu[aá]nto|caduca|vence|expira|de por vida|para siempre|se me va)\b/i,
    respuesta:
      "El acceso te queda de por vida ♾️\n\nPagas una sola vez y lo consultas cuando quieras, las veces que quieras.",
  },
  {
    id: "como_llega",
    patrones: /\b(c[oó]mo (me )?(llega|lo recibo|lo veo)|d[oó]nde (lo veo|queda)|drive|descarg\w+)\b/i,
    respuesta:
      "Te llega por Google Drive 📁\n\nApenas confirmamos el pago te paso el acceso por aquí mismo. Lo puedes ver en línea o descargarlo.",
  },
  {
    id: "dispositivos",
    patrones: /\b(celular|m[oó]vil|computador|pc|tablet|desde el tel[eé]fono|android|iphone)\b/i,
    respuesta:
      "Lo puedes ver desde donde quieras 📱💻\n\nCelular, tablet o computador. Solo necesitas internet para abrirlo.",
  },
  {
    id: "es_presencial",
    patrones: /\b(presencial|sede|direcci[oó]n|academia|d[oó]nde (est[aá]n|queda)|clases en vivo|profesor en vivo)\b/i,
    respuesta:
      "Es 100% online y grabado 💻\n\nNo hay sede ni clases en vivo: son videos que ves a tu ritmo, cuando puedas.",
  },
  {
    id: "soporte",
    patrones: /\b(soporte|ayuda|dudas|si tengo problemas|acompa[ñn]amiento|tutor)\b/i,
    respuesta:
      "Tienes soporte incluido 🙌\n\nCualquier duda me escribes por aquí y te ayudo.",
  },
  {
    id: "horario_atencion",
    patrones: /\b(a qu[eé] hora|horario|hasta qu[eé] hora|atienden)\b/i,
    // Verificado en el perfil: 09:00–18:00 America/Bogota.
    respuesta: "Atendemos de 9:00 a 6:00 de la tarde, hora de Colombia 🕘",
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
        "Va desde cero hasta nivel avanzado 🎹\n\nNo necesitas saber nada previo: arranca por los fundamentos y sube de a poco, a tu ritmo.",
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
        "Sí, incluye partituras y ejercicios 🎼\n\nY te enseña a leerlas desde el principio, aunque nunca hayas visto una.",
    },
    {
      id: "piano_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntas clases|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos)\b/i,
      // 19 módulos: está en la descripción del propio catálogo.
      // 283 clases y ~19 horas: del curso original en Udemy, confirmado por
      // los marcadores que coinciden exacto (19 módulos + los 5 valses de
      // Alberto Martínez).
      respuesta:
        "Son 19 módulos, 283 clases en video 🎹\n\nComo 19 horas de contenido en total, pero lo ves a tu ritmo: no hay fechas ni horarios.",
    },
    {
      id: "piano_requiere_teclado",
      patrones: /\b(necesito (un )?(piano|teclado)|hay que tener|se necesita instrumento|cu[aá]ntas teclas|sin piano)\b/i,
      respuesta:
        "Sí, necesitas un piano o teclado para practicar 🎹\n\nPara empezar te sirve cualquiera que tengas a mano.",
    },
    {
      id: "piano_edad",
      patrones: /\b(para ni[ñn]os|edad|mi hijo|mi hija|para adultos|soy mayor|muy viejo|muy grande)\b/i,
      // "para todas las edades" está literal en la descripción del catálogo.
      respuesta:
        "Sirve para todas las edades 😊\n\nArranca desde cero, así que da igual si es para ti o para un niño: se avanza al ritmo de cada uno.",
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
        "El curso trata justamente eso 🐕\n\nTiene módulos para agresividad y posesividad, ansiedad por separación, reactividad y control de conductas problemáticas.\n\n¿Qué está haciendo tu perro?",
    },
    {
      id: "perro_experiencia",
      patrones: /\b(sin experiencia|nunca he entrenado|no s[eé] nada|primera vez|es dif[ií]cil)\b/i,
      respuesta:
        "No necesitas experiencia previa 🐾\n\nEstá pensado para hacerlo desde casa, paso a paso, aunque sea tu primera vez.",
    },
    {
      id: "perro_edad",
      patrones: /\b(cachorro|qu[eé] edad|meses|a[ñn]os|es viejo|ya est[aá] grande|adulto)\b/i,
      // Del curso original (Álvaro Osorio / Hotmart): cubre desde cachorro
      // hasta adulto mayor, con la capacidad de aprendizaje de cada etapa.
      respuesta:
        "Sirve a cualquier edad 🐶\n\nEstá pensado desde cachorro hasta perro adulto mayor: cada etapa aprende distinto y el curso lo tiene en cuenta.",
    },
    {
      id: "perro_raza",
      patrones: /\b(raza|pitbull|labrador|criollo|mestizo|sirve para mi perro|chihuahua|pastor|french|poodle)\b/i,
      respuesta:
        "Funciona con cualquier raza 🐕\n\nY también con criollos. Las técnicas son las mismas, se adaptan al carácter de cada perro.",
    },
    {
      id: "perro_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos|en cu[aá]nto tiempo)\b/i,
      // Del curso original: lecciones cortas en HD; la mayoría lo completa
      // entre 1 y 3 meses, y el acceso es permanente.
      respuesta:
        "Son lecciones cortas en video, para ver a tu ritmo 🎬\n\nLa mayoría lo completa entre 1 y 3 meses, pero el acceso te queda de por vida: puedes tomarte el tiempo que quieras.",
    },
    {
      id: "perro_practico",
      patrones: /\b(es pr[aá]ctico|solo teor[ií]a|c[oó]mo se hace|ejercicios|demostraci\w+)\b/i,
      respuesta:
        "Es puro práctico 🐾\n\nSon demostraciones en video de los ejercicios, paso a paso, para que los repitas con tu perro en casa.",
    },
  ],
};

const CATALOGO: ConocimientoProducto[] = [PIANO, EDUCANINO];

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
