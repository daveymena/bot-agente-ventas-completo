/**
 * Generador de copy con plantillas inteligentes.
 * No depende de ninguna API de IA: trabaja con `name`, `description`,
 * `features` y `category`. El panel deja un campo opcional de API key por si
 * se quiere pasar el resultado por un LLM para pulirlo.
 */

import type { Angle, Awareness, CopyBundle, CopyStep, FaqItem, Offer, Product } from '../types';
import { capitalize, cop, humanTitle, sentences, stripEmoji, truncate } from '../format';
import {
  ANGLES,
  DESIRE_PROMISES,
  PAIN_HOOKS,
  detectFamily,
  sanitizeClaims,
  type Family,
} from './angles';

export interface CopyInput {
  product: Product;
  awareness: Awareness;
  angle: Angle;
  offer: Pick<Offer, 'price' | 'compareAt' | 'freeShipping' | 'cod' | 'guaranteeDays' | 'shippingEta'>;
  emojisInCopy: boolean;
  storeName?: string;
}

/* ------------------------------------------------------------------ */
/* Extracción de beneficios                                            */
/* ------------------------------------------------------------------ */

const JUNK_PATTERNS: RegExp[] = [
  /nota importante/i,
  /copia este link/i,
  /pegalo en el url/i,
  /https?:\/\//i,
  /bit\.ly/i,
  /generaci[oó]n de gu[ií]a/i,
  /c[oó]digo del proveedor/i,
  /informacion util/i,
  /informaci[oó]n [uú]til/i,
  /^\s*[-*•]+\s*$/,
  /qu[eé] incluye la compra/i,
  /^\s*caracteristicas\s*$/i,
  /^\s*características\s*$/i,
];

function isJunk(line: string): boolean {
  return JUNK_PATTERNS.some((re) => re.test(line));
}

/** Limpia el texto del proveedor: links, notas internas, promesas médicas. */
export function cleanSupplierText(text: string): string {
  return sanitizeClaims(
    (text || '')
      .split(/\n+/)
      .filter((line) => !isJunk(line))
      .join('\n')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** Frase de beneficio corta: 3 a 6 palabras, sin punto final. */
/** Palabras que no pueden quedar al final de un beneficio recortado. */
const TRAILING_STOP = new Set([
  'y', 'o', 'u', 'e', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'sin', 'para', 'por', 'que', 'en', 'a', 'al', 'su', 'sus', 'mas', 'más', 'como',
  'si', 'lo', 'se', 'muy', 'ni', 'the', 'desde', 'hasta', 'sobre', 'tu', 'tus',
]);

function trimTrailingStop(words: string[]): string[] {
  const out = [...words];
  while (out.length > 2) {
    const last = out[out.length - 1].toLowerCase().replace(/[.,;:–—-]+$/, '');
    if (!TRAILING_STOP.has(last)) break;
    out.pop();
  }
  return out;
}

function shortBenefit(raw: string, keepEmoji: boolean): string {
  let t = sanitizeClaims(raw || '').trim();
  if (!keepEmoji) t = stripEmoji(t);
  t = t.replace(/^[•·\-–—*\s]+/, '').replace(/[.;,]+$/, '').trim();
  // "🛞 Rueda gruesa que brinda mayor estabilidad" -> "Rueda gruesa, más estabilidad"
  t = t.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  const words = t.split(/\s+/);
  if (words.length > 7) {
    // corta en el conector más natural
    const connectors = ['que', 'para', 'con', 'y', 'de'];
    for (let i = 7; i >= 3; i--) {
      if (connectors.includes((words[i] || '').toLowerCase())) {
        return capitalize(trimTrailingStop(words.slice(0, i)).join(' '));
      }
    }
    return capitalize(trimTrailingStop(words.slice(0, 7)).join(' '));
  }
  return capitalize(trimTrailingStop(words).join(' '));
}

/**
 * Saca de 3 a 6 beneficios. Prioriza `features`; si no hay, los deduce de la
 * descripción buscando frases con verbo de beneficio.
 */
export function extractBenefits(product: Product, keepEmoji: boolean, max = 6): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (text: string) => {
    const b = shortBenefit(text, keepEmoji);
    const key = stripEmoji(b).toLowerCase();
    if (b.length >= 6 && !seen.has(key) && out.length < max) {
      seen.add(key);
      out.push(b);
    }
  };

  for (const f of product.features || []) {
    if (!isJunk(f)) push(f);
  }

  if (out.length < 3) {
    const desc = cleanSupplierText(product.description);
    const lines = desc
      .split(/\n+|·|•|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12 && s.length < 120 && !isJunk(s));
    const benefitVerbs =
      /(permite|ayuda|sirve|ideal|fácil|facil|cómod|comod|resisten|durader|impermeable|ligero|liviano|portátil|portatil|antidesliz|ajustable|incluye|compacto|rápido|rapido|seguro|práctic|practic|espacio|protege|organiz)/i;
    const scored = lines
      .map((l) => ({ l, score: benefitVerbs.test(l) ? 2 : 1 }))
      .sort((a, b) => b.score - a.score);
    for (const { l } of scored) push(l);
  }

  if (out.length < 3) {
    const fam = detectFamily(product.category, product.name, product.kind);
    for (const p of DESIRE_PROMISES[fam]) push(p);
  }

  return out.slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Pasos de uso                                                        */
/* ------------------------------------------------------------------ */

const STEPS_BY_FAMILY: Record<Family, CopyStep[]> = {
  fitness: [
    { title: 'Sácalo de la caja', text: 'Llega listo para usar. No arma nada ni necesita herramientas.' },
    { title: 'Busca un espacio de 2 metros', text: 'Con el tapete o una superficie firme ya tienes todo lo que hace falta.' },
    { title: 'Entrena 15 o 20 minutos', text: 'Empieza con series cortas y sube de a poco. La constancia hace el trabajo.' },
  ],
  wellness: [
    { title: 'Ajústalo a tu medida', text: 'Las correas se regulan en segundos para que quede cómodo desde el primer día.' },
    { title: 'Úsalo por ratos cortos', text: 'Empieza con 20 o 30 minutos al día mientras te acostumbras.' },
    { title: 'Súmalo a tu rutina', text: 'Al cabo de unos días lo vas a usar sin pensarlo, como parte del día.' },
  ],
  fashion: [
    { title: 'Elige tu color', text: 'Escoge el color al hacer el pedido y te lo despachamos tal cual.' },
    { title: 'Recíbelo en casa', text: 'Lo revisas con el mensajero antes de pagar.' },
    { title: 'Úsalo todos los días', text: 'Pensado para la oficina, la universidad y los planes del fin de semana.' },
  ],
  home: [
    { title: 'Ubícalo donde lo necesitas', text: 'No requiere instalación ni perforar paredes.' },
    { title: 'Organiza en minutos', text: 'En una sola pasada ya se nota el cambio en el espacio.' },
    { title: 'Mantenlo así', text: 'Cada cosa tiene su lugar, así se queda ordenado solo.' },
  ],
  kitchen: [
    { title: 'Lávalo antes del primer uso', text: 'Agua y jabón suave, nada más.' },
    { title: 'Prepara en minutos', text: 'Reduce el tiempo de la parte más tediosa de cocinar.' },
    { title: 'Limpia fácil', text: 'Se enjuaga rápido y queda listo para la próxima.' },
  ],
  tech: [
    { title: 'Enciéndelo y listo', text: 'Llega configurado para que lo uses el mismo día.' },
    { title: 'Conéctalo a tu red', text: 'Wi-Fi, cuenta y tus programas de siempre en pocos minutos.' },
    { title: 'A trabajar o estudiar', text: 'Rinde para las tareas del día a día sin quedarse corto.' },
  ],
  pets: [
    { title: 'Deja que lo huela', text: 'Déjalo abierto en casa un día para que se acostumbre.' },
    { title: 'Primeros paseos cortos', text: 'Salidas de 10 minutos para que agarre confianza.' },
    { title: 'A donde quieras', text: 'Veterinario, viajes y paseos largos sin estrés para los dos.' },
  ],
  baby: [
    { title: 'Ajústalo a tu talla', text: 'Las correas se regulan para que quede cómodo para los dos.' },
    { title: 'Prueba en casa', text: 'Los primeros minutos en casa, sin afán, para tomar confianza.' },
    { title: 'Salgan tranquilos', text: 'Menos carga, más manos libres y un paseo más fácil.' },
  ],
  beauty: [
    { title: 'Prepara la zona', text: 'Limpia y seca antes de empezar, como en el salón.' },
    { title: 'Aplica paso a paso', text: 'Sin afán, por secciones, y el resultado queda parejo.' },
    { title: 'Repite cuando toque', text: 'Lo integras a tu rutina y ahorras las visitas al salón.' },
  ],
  auto: [
    { title: 'Instálalo en minutos', text: 'Se ajusta sin herramientas ni modificaciones.' },
    { title: 'Prueba en un recorrido corto', text: 'Ajusta la posición hasta que te quede cómodo.' },
    { title: 'Listo para la carretera', text: 'Lo dejas puesto y te olvidas del problema.' },
  ],
  course: [
    { title: 'Haz el pago', text: 'Transferencia, tarjeta o el medio que prefieras.' },
    { title: 'Recibe el acceso', text: 'Te llega el enlace al correo y al WhatsApp en minutos.' },
    { title: 'Empieza hoy mismo', text: 'Desde el celular o el computador, a tu ritmo y de por vida.' },
  ],
  service: [
    { title: 'Escríbenos por WhatsApp', text: 'Cuéntanos qué necesitas y te respondemos el mismo día.' },
    { title: 'Agendamos', text: 'Definimos alcance, tiempos y precio antes de empezar.' },
    { title: 'Ejecutamos y entregamos', text: 'Tú recibes el resultado y nos quedamos pendientes del seguimiento.' },
  ],
  general: [
    { title: 'Haz tu pedido', text: 'Llenas el formulario con tus datos, toma menos de un minuto.' },
    { title: 'Te confirmamos', text: 'Te escribimos por WhatsApp para confirmar la dirección.' },
    { title: 'Recibe y paga', text: 'Lo revisas con el mensajero y pagas cuando lo tengas en la mano.' },
  ],
};

/* ------------------------------------------------------------------ */
/* Problema → solución                                                 */
/* ------------------------------------------------------------------ */

const PROBLEM_BY_FAMILY: Record<Family, { problem: string; solution: string }> = {
  fitness: {
    problem:
      'El plan siempre empieza igual: te inscribes, vas tres veces y después la rutina se come el horario. No es falta de ganas, es que salir de la casa a entrenar cuesta más de lo que parece.',
    solution:
      'Teniendo el equipo a la mano el problema desaparece. Lo dejas armado en una esquina, entrenas los minutos que tengas y no pierdes ni transporte ni mensualidad.',
  },
  wellness: {
    problem:
      'Pasas horas en la misma posición y el cuerpo lo reclama al final del día. Te acomodas, estiras un poco y a los diez minutos vuelves a lo mismo.',
    solution:
      'Con un apoyo diseñado para eso, mantener una posición cómoda deja de ser un esfuerzo consciente. Te lo pones, sigues con lo tuyo y terminas el día mejor.',
  },
  fashion: {
    problem:
      'Compras uno barato, aguanta dos meses y toca volver a comprar. Al final gastas más y nunca tienes el que te gusta de verdad.',
    solution:
      'Un acabado bien hecho y materiales que resisten el uso diario cambian la ecuación: lo usas todos los días, combina con todo y dura.',
  },
  home: {
    problem:
      'Organizas la casa el domingo y para el martes todo volvió a su sitio de siempre: el suelo, la silla, la mesa del comedor.',
    solution:
      'Cuando cada cosa tiene un lugar definido, el orden se mantiene solo. No es más esfuerzo, es mejor distribución.',
  },
  kitchen: {
    problem:
      'Entre semana cocinar se vuelve una tarea eterna, y al final terminas pidiendo domicilio por pura pereza de la cocina.',
    solution:
      'Con la herramienta adecuada la parte tediosa se reduce a minutos. Comes mejor en casa sin que te cueste la tarde.',
  },
  tech: {
    problem:
      'Abres tres pestañas y el equipo se queda pensando. Te toca esperar, se cierra solo y pierdes el trabajo.',
    solution:
      'Con memoria suficiente y disco sólido la diferencia se siente desde que lo prendes: abre rápido, aguanta varias cosas a la vez y responde.',
  },
  pets: {
    problem:
      'Cada salida con tu mascota es una pelea: no entra, se estresa, le toca ir en brazos y al final nadie disfruta el paseo.',
    solution:
      'Con un transportador cómodo y ventilado, tu mascota viaja tranquila, ve lo que pasa afuera y tú tienes las manos libres.',
  },
  baby: {
    problem:
      'Salir con el bebé se convirtió en una operación: pañalera, coche, bolsos y las manos siempre ocupadas.',
    solution:
      'Cargar menos cosas y tenerlas organizadas cambia el paseo entero. Sales con lo necesario y vuelves sin agotarte.',
  },
  beauty: {
    problem:
      'Entre el tiempo y lo que cuesta cada visita al salón, mantener el resultado se vuelve caro y complicado.',
    solution:
      'Haciéndolo en casa con lo adecuado, el resultado se mantiene y el gasto mensual baja de verdad.',
  },
  auto: {
    problem:
      'Los recorridos largos pasan factura. Llegas incómodo y con la espalda cargada, y lo normalizas porque "así es".',
    solution:
      'Un accesorio pensado para eso corrige la postura del recorrido y hace que llegues distinto, sin cambiar nada más.',
  },
  course: {
    problem:
      'Empiezas con tutoriales sueltos de YouTube, saltas de video en video y a la semana ya no sabes por dónde ibas. No es falta de capacidad: es falta de un orden.',
    solution:
      'Un curso con módulos en orden resuelve eso. Sabes qué sigue, avanzas a tu ritmo y puedes volver a cualquier clase cuando quieras.',
  },
  service: {
    problem:
      'Te prometieron resultados, pagaste y después nadie respondió. Perdiste tiempo, plata y las ganas de volver a intentarlo.',
    solution:
      'Trabajamos con alcance claro desde el primer día: qué se hace, en cuánto tiempo y cuánto cuesta. Sin sorpresas.',
  },
  general: {
    problem:
      'Compras el más barato, te dura poco y terminas comprando otra vez. Al final gastas más de lo que querías ahorrar.',
    solution:
      'Elegir uno bien hecho desde el principio sale más barato: lo usas todos los días y no vuelves a pensar en el tema.',
  },
};

/* ------------------------------------------------------------------ */
/* Currículo de cursos                                                 */
/* ------------------------------------------------------------------ */

/** Saca los módulos de la descripción de un curso. */
export function extractCurriculum(product: Product, max = 14): string[] {
  const desc = cleanSupplierText(product.description);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const t = capitalize(
      stripEmoji(raw)
        .replace(/^[\d]+[.)-]\s*/, '')
        .replace(/^[•·\-–—*\s]+/, '')
        .replace(/[.;,]+$/, '')
        .trim()
    );
    const key = t.toLowerCase();
    if (t.length >= 4 && t.length <= 90 && !seen.has(key) && out.length < max) {
      seen.add(key);
      out.push(t);
    }
  };

  // Patrón "N módulos en video: a, b, c, d"
  const listMatch = desc.match(/m[oó]dulos?[^:]*:\s*([^.]+(?:\.[^.]*)?)/i);
  if (listMatch) {
    const parts = listMatch[1].split(/,|;|\sy\s/).map((s) => s.trim());
    if (parts.length >= 4) parts.forEach(push);
  }

  if (out.length < 4) {
    for (const line of desc.split(/\n+/)) {
      if (/^[\d]+[.)-]\s+/.test(line.trim())) push(line);
    }
  }

  if (out.length < 4) {
    for (const f of product.features || []) push(f);
  }

  if (out.length < 4) {
    sentences(desc).slice(0, max).forEach(push);
  }

  return out.slice(0, max);
}

function countModules(product: Product): number | null {
  const m = (product.description || '').match(/(\d{1,3})\s*m[oó]dulos?/i);
  if (m) return Number(m[1]);
  return null;
}

/* ------------------------------------------------------------------ */
/* FAQ por defecto                                                     */
/* ------------------------------------------------------------------ */

export function defaultFaq(product: Product, offer: CopyInput['offer']): FaqItem[] {
  if (product.kind === 'digital') {
    return [
      {
        id: 'faq_entrega',
        q: '¿Cómo recibo el curso?',
        a: 'Apenas confirmamos el pago te enviamos el enlace de acceso al correo y al WhatsApp. En la mayoría de los casos llega en menos de 10 minutos.',
      },
      {
        id: 'faq_vida',
        q: '¿El acceso es de por vida?',
        a: 'Sí. Una vez tienes el acceso lo conservas sin mensualidades ni renovaciones, y las actualizaciones te llegan sin costo.',
      },
      {
        id: 'faq_celular',
        q: '¿Puedo verlo desde el celular?',
        a: 'Sí. Funciona en celular, tablet y computador. Puedes descargar el material y estudiar sin internet.',
      },
      {
        id: 'faq_nivel',
        q: 'No sé nada del tema, ¿me sirve?',
        a: 'Sí. El contenido empieza desde cero y avanza por módulos ordenados, así que no necesitas conocimientos previos.',
      },
      {
        id: 'faq_soporte',
        q: '¿Tengo con quién resolver dudas?',
        a: 'Sí, te damos un canal de WhatsApp para dudas sobre el acceso y el contenido.',
      },
    ];
  }

  if (product.kind === 'service') {
    return [
      { id: 'faq_inicio', q: '¿Cómo empezamos?', a: 'Nos escribes por WhatsApp, nos cuentas qué necesitas y te enviamos la propuesta con alcance, tiempos y precio.' },
      { id: 'faq_tiempo', q: '¿Cuánto se demora?', a: 'Depende del alcance. En la propuesta queda la fecha de entrega por escrito antes de empezar.' },
      { id: 'faq_pago', q: '¿Cómo es el pago?', a: 'Se acuerda antes de arrancar. Normalmente un anticipo para reservar el cupo y el resto contra entrega.' },
      { id: 'faq_cambios', q: '¿Incluye ajustes?', a: 'Sí. Cada plan incluye rondas de ajustes; quedan especificadas en la propuesta.' },
    ];
  }

  return [
    {
      id: 'faq_pago',
      q: '¿Cómo pago?',
      a: 'Pagas en efectivo al mensajero cuando recibes el pedido en tu casa. No tienes que pagar nada por adelantado ni dar datos de tarjeta.',
    },
    {
      id: 'faq_tiempo',
      q: '¿Cuánto tarda en llegar?',
      a: `${offer.shippingEta}. Te escribimos por WhatsApp para confirmar la dirección antes de despachar y te avisamos el día de la entrega.`,
    },
    {
      id: 'faq_cancelar',
      q: '¿Puedo cancelar el pedido?',
      a: 'Sí. Mientras no haya salido para entrega puedes cancelar sin ningún costo escribiéndonos por WhatsApp.',
    },
    {
      id: 'faq_garantia',
      q: '¿Tiene garantía?',
      a: `Sí, tienes ${offer.guaranteeDays} días de garantía. Si llega con un defecto de fábrica te lo cambiamos sin costo.`,
    },
    {
      id: 'faq_revisar',
      q: '¿Puedo revisarlo antes de pagar?',
      a: 'Claro. Abres el paquete delante del mensajero y verificas que sea lo que pediste antes de entregar el dinero.',
    },
    {
      id: 'faq_cobertura',
      q: '¿Envían a todo el país?',
      a: 'Sí, llegamos a las principales ciudades y municipios de los 32 departamentos. Si tu zona tiene alguna restricción te avisamos antes de despachar.',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Generador principal                                                 */
/* ------------------------------------------------------------------ */

export function buildCopy(input: CopyInput): CopyBundle {
  const { product, awareness, angle, offer, emojisInCopy } = input;
  const fam = detectFamily(product.category, product.name, product.kind);
  const angleCopy = ANGLES[angle];
  const title = humanTitle(product.name);
  const shortTitle = truncate(title, 42);
  const priceText = cop(offer.price);
  const benefits = extractBenefits(product, emojisInCopy, 6);
  const plainBenefits = extractBenefits(product, false, 6);
  const desc = cleanSupplierText(product.description);
  const descSentences = sentences(desc);
  const isDigital = product.kind === 'digital';
  const isService = product.kind === 'service';
  const ps = PROBLEM_BY_FAMILY[fam];
  const hookPool = PAIN_HOOKS[fam];
  const hook = hookPool[(String(product.id).length + angle.length) % hookPool.length];
  const promisePool = DESIRE_PROMISES[fam];
  const promise = promisePool[(String(product.id).length + awareness.length) % promisePool.length];
  const topBenefit = plainBenefits[0] ?? promise;

  /* Titular según conciencia -------------------------------------- */
  let headline: string;
  let heroEyebrow: string;
  let subheadline: string;

  if (isDigital) {
    const modules = countModules(product);
    heroEyebrow = awareness === 'cold' ? 'Curso online' : 'Acceso inmediato';
    headline =
      awareness === 'cold'
        ? `Aprende ${lowerFirst(stripCourseWords(title))} desde cero, a tu ritmo`
        : awareness === 'problem'
          ? `${hook.replace(/^¿/, '').replace(/\?$/, '')}. Esto lo resuelve`
          : `${title}`;
    subheadline =
      modules && modules > 1
        ? `${modules} módulos en video, de cero a avanzado. ${angleCopy.subPatternDigital(shortTitle, priceText)}`
        : `${capitalize(topBenefit)}. ${angleCopy.subPatternDigital(shortTitle, priceText)}`;
  } else if (isService) {
    heroEyebrow = 'Servicio';
    headline =
      awareness === 'cold'
        ? `${hook.replace(/^¿/, '').replace(/\?$/, '')}`
        : `${title}`;
    subheadline = `${truncate(descSentences[0] ?? promise, 150)} ${angleCopy.subPatternService(shortTitle, priceText)}`;
  } else {
    switch (awareness) {
      case 'cold':
        heroEyebrow = angleCopy.eyebrow;
        headline = hook;
        subheadline = `${capitalize(topBenefit)}. ${angleCopy.subPattern(shortTitle, priceText)}`;
        break;
      case 'problem':
        heroEyebrow = angleCopy.eyebrow;
        headline = angleCopy.headlinePattern(shortTitle, capitalize(topBenefit));
        subheadline = `${truncate(descSentences[0] ?? promise, 130)} ${angleCopy.subPattern(shortTitle, priceText)}`;
        break;
      default:
        heroEyebrow = offer.compareAt && offer.compareAt > offer.price ? 'Oferta de hoy' : angleCopy.eyebrow;
        headline = `${title}`;
        subheadline = `${capitalize(topBenefit)}. ${angleCopy.subPattern(shortTitle, priceText)}`;
        break;
    }
  }

  /* Announcement --------------------------------------------------- */
  const announcement = isDigital
    ? emojisInCopy
      ? '⚡ Acceso inmediato después del pago · 💬 Soporte por WhatsApp'
      : 'Acceso inmediato después del pago · Soporte por WhatsApp'
    : isService
      ? emojisInCopy
        ? '💬 Cotización sin costo por WhatsApp · 🇨🇴 Atendemos en toda Colombia'
        : 'Cotización sin costo por WhatsApp · Atendemos en toda Colombia'
      : emojisInCopy
        ? '🚚 Envío gratis a toda Colombia · 💵 Pago contra entrega en todo el país 🇨🇴'
        : 'Envío gratis a toda Colombia · Pago contra entrega en todo el país';

  /* Pasos ---------------------------------------------------------- */
  const steps = STEPS_BY_FAMILY[fam].map((s) => ({ ...s }));

  /* Advertorial ---------------------------------------------------- */
  const articleTitle =
    fam === 'course'
      ? `Por qué cada vez más colombianos están aprendiendo ${lowerFirst(stripCourseWords(title))} desde el celular`
      : `Lo que casi nadie te cuenta sobre ${lowerFirst(categoryPhrase(product.category))} (y por qué miles ya cambiaron de método)`;

  const articleBody: string[] = [
    ps.problem,
    'La reacción más común es buscar la salida rápida: el más barato que aparece, el consejo de un conocido o dejarlo para después. Funciona unos días y después todo vuelve al punto de partida.',
    'El problema de fondo casi nunca es la disciplina. Es que la solución que se elige no está hecha para el uso real, el de todos los días, el del apuro y el cansancio.',
    `Por eso vale la pena revisar qué debería tener una solución que sí aguante: ${plainBenefits.slice(0, 3).map(lowerFirst).join(', ')}. Cuando se cumplen esas tres cosas, el resto se da solo.`,
    `${title} se diseñó exactamente alrededor de eso. ${truncate(descSentences[0] ?? ps.solution, 220)}`,
    ps.solution,
  ];

  const listicleItems: CopyStep[] = plainBenefits.slice(0, 5).map((b, i) => ({
    title: b,
    text:
      descSentences[i + 1] ??
      [
        'Es el detalle que más se agradece en el uso diario, el que hace que lo saques una y otra vez.',
        'Suena menor hasta que lo usas una semana y entiendes la diferencia.',
        'Aquí es donde se nota que está pensado para usarse de verdad, no solo para la foto.',
        'Lo que más repiten quienes ya lo tienen cuando les preguntan si lo volverían a comprar.',
        'Y lo mejor: no te obliga a cambiar nada más de tu rutina.',
      ][i % 5],
  }));

  /* Digital -------------------------------------------------------- */
  const curriculum = isDigital ? extractCurriculum(product, 14) : [];
  const forWho = isDigital
    ? [
        'Empiezas desde cero y quieres un orden claro, no videos sueltos',
        'Ya sabes algo y quieres cerrar los huecos que te frenan',
        'Tienes poco tiempo y necesitas avanzar a tu ritmo',
        'Prefieres estudiar desde el celular, cuando puedas',
      ]
    : [];
  const notForWho = isDigital
    ? [
        'Buscas un título o certificación oficial avalada por el Estado',
        'Esperas resultados sin practicar lo que se ve en cada módulo',
        'Quieres clases en vivo uno a uno con horario fijo',
      ]
    : [];

  /* Servicio ------------------------------------------------------- */
  const serviceIncludes = isService
    ? plainBenefits.length
      ? plainBenefits
      : ['Diagnóstico inicial sin costo', 'Propuesta con alcance y tiempos', 'Ejecución completa', 'Reporte de resultados', 'Soporte por WhatsApp']
    : [];

  /* Ensamblado ----------------------------------------------------- */
  return {
    announcement,
    heroEyebrow,
    headline: sanitizeClaims(headline),
    subheadline: sanitizeClaims(subheadline),
    bullets: benefits,
    ctaPrimary: isDigital
      ? 'QUIERO ACCESO INMEDIATO'
      : isService
        ? 'AGENDAR POR WHATSAPP'
        : 'PEDIR AHORA – PAGO AL RECIBIR',
    ctaSecondary: isDigital ? 'Preguntar por WhatsApp' : 'Preguntar por WhatsApp',

    benefitsEyebrow: 'Por qué lo vas a usar',
    benefitsTitle: isDigital ? 'Lo que te llevas' : `Lo que hace distinto a ${shortTitle}`,

    problemEyebrow: 'El problema',
    problemTitle: isDigital ? 'Por qué los tutoriales sueltos no funcionan' : 'Te suena conocido',
    problemText: ps.problem,
    solutionTitle: isDigital ? 'Un camino ordenado, de principio a fin' : 'Así se resuelve',
    solutionText: ps.solution,

    howEyebrow: 'Paso a paso',
    howTitle: isDigital ? 'Cómo lo recibes' : isService ? 'Cómo trabajamos' : 'Cómo se usa',
    steps,

    bundlesEyebrow: isService ? 'Elige tu plan' : 'Elige tu paquete',
    bundlesTitle: isService
      ? 'Elige el plan que te sirve'
      : 'Entre más llevas, menos pagas por unidad',
    bundlesSubtitle: isService
      ? 'Todos los planes se confirman por WhatsApp antes de empezar. Sin cobros automáticos.'
      : offer.cod
        ? 'El paquete de 2 es el que más piden. Igual pagas al recibir.'
        : 'El paquete de 2 es el que más piden.',

    reviewsEyebrow: 'Clientes reales',
    reviewsTitle: 'Lo que dicen quienes ya lo tienen',

    guaranteeTitle: isDigital
      ? `Garantía de ${offer.guaranteeDays} días`
      : isService
        ? 'Alcance claro y ajustes incluidos'
        : `Garantía de ${offer.guaranteeDays} días y cambios sin enredos`,
    guaranteeText: isDigital
      ? `Si entras al curso y no es lo que esperabas, escríbenos dentro de los primeros ${offer.guaranteeDays} días y te devolvemos el dinero. Sin preguntas incómodas.`
      : isService
        ? 'Antes de empezar te pasamos por escrito qué incluye, cuánto cuesta y cuándo lo entregamos. Si algo del entregable no corresponde a lo acordado, lo ajustamos sin costo.'
        : `Si el producto llega con un defecto de fábrica, te lo cambiamos sin costo dentro de los ${offer.guaranteeDays} días siguientes a la entrega. Nos escribes por WhatsApp, coordinamos la recogida y listo.`,

    shippingTitle: 'Envío y entrega',
    faqTitle: 'Preguntas frecuentes',

    formEyebrow: isDigital ? 'Último paso' : isService ? 'Agenda' : 'Pedido contra entrega',
    formTitle: isDigital
      ? 'Completa tu acceso'
      : isService
        ? 'Cuéntanos qué necesitas'
        : 'Completa tus datos y recíbelo en casa',
    formSubtitle: isDigital
      ? 'Te enviamos el acceso al correo y al WhatsApp apenas confirmemos el pago.'
      : isService
        ? 'Nos escribes por WhatsApp, revisamos tu caso y te mandamos la propuesta con alcance y tiempos.'
        : 'No pagas nada ahora. Llenas el formulario, te confirmamos por WhatsApp y pagas cuando lo recibas.',

    relatedTitle: isDigital ? 'Súmale estos cursos' : isService ? 'También te puede servir' : 'Complétalo con',

    closingTitle: isDigital ? 'Empieza hoy mismo' : isService ? '¿Lo hablamos?' : '¿Lo pedimos?',
    closingText: isDigital
      ? angleCopy.closingDigital
      : isService
        ? angleCopy.closingService
        : angleCopy.closing,

    articleKicker: fam === 'course' ? 'Educación' : 'Consumo',
    articleTitle,
    articleStandfirst: `${truncate(ps.problem, 180)}`,
    articleAuthor: 'Redacción',
    articleBody,
    listicleTitle: `${Math.min(5, Math.max(3, plainBenefits.length))} razones por las que miles de colombianos ya usan ${shortTitle}`,
    listicleItems,

    curriculumTitle: 'Qué vas a aprender',
    // El subtítulo del temario lo arma la sección con la lista real.
    curriculum,
    forWho,
    notForWho,

    serviceIncludes,
  };
}

/* ------------------------------------------------------------------ */
/* Helpers de texto                                                    */
/* ------------------------------------------------------------------ */

function lowerFirst(text: string): string {
  const t = (text || '').trim();
  if (!t) return '';
  // No bajar la inicial si es un nombre propio evidente (dos mayúsculas seguidas)
  if (/^[A-ZÁÉÍÓÚÑ]{2,}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

function stripCourseWords(title: string): string {
  return (title || '')
    .replace(/^curso\s+(de\s+|master\s+en\s+)?/i, '')
    .replace(/\s+completo$/i, '')
    .replace(/^pack\s+/i, '')
    .trim() || title;
}

function categoryPhrase(category: string): string {
  const c = (category || '').trim();
  if (!c || /^general$/i.test(c)) return 'estos productos';
  return c.toLowerCase();
}

/** Mensaje de WhatsApp prellenado para el CTA directo. */
export function waMessage(product: Product, price: number, kind: 'order' | 'info' = 'order'): string {
  const title = humanTitle(product.name);
  if (product.kind === 'digital') {
    return `Hola, quiero el ${title} de ${cop(price)}. ¿Me pasas los datos para el pago?`;
  }
  if (product.kind === 'service') {
    return `Hola, quiero información sobre ${title}. ¿Me cuentas cómo funciona?`;
  }
  return kind === 'order'
    ? `Hola, quiero pedir ${title} por ${cop(price)} con pago contra entrega.`
    : `Hola, tengo una pregunta sobre ${title}.`;
}
