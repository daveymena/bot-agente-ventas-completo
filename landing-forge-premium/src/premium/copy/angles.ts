/**
 * Matrices de copy: nivel de conciencia × ángulo de venta × familia de producto.
 *
 * Los patrones salen de lo que lleva meses activo en la Biblioteca de Anuncios
 * de Meta en Colombia para "pago contra entrega":
 *  - gancho de dolor o pregunta en la primera línea
 *  - beneficios de 3 a 6 palabras
 *  - remate fijo de envío gratis + pago contra entrega
 */

import type { Angle, Awareness } from '../types';

export type Family =
  | 'fitness'
  | 'wellness'
  | 'fashion'
  | 'home'
  | 'kitchen'
  | 'tech'
  | 'pets'
  | 'baby'
  | 'beauty'
  | 'auto'
  | 'course'
  | 'service'
  | 'general';

export const FAMILY_LABEL: Record<Family, string> = {
  fitness: 'Deporte y fitness',
  wellness: 'Salud y bienestar',
  fashion: 'Moda y accesorios',
  home: 'Hogar',
  kitchen: 'Cocina',
  tech: 'Tecnología',
  pets: 'Mascotas',
  baby: 'Bebés y maternidad',
  beauty: 'Belleza',
  auto: 'Carros y motos',
  course: 'Cursos y digitales',
  service: 'Servicios',
  general: 'General',
};

const FAMILY_RULES: Array<[RegExp, Family]> = [
  [/deporte|fitness|gym|gimnasio|entrenamiento|yoga|pilates|ciclismo|futbol|fútbol/, 'fitness'],
  [/salud|bienestar|postura|masaje|terapia|ortoped|sueño|descanso|relajacion|relajación/, 'wellness'],
  [/moda|accesorio|bolso|mochila|ropa|calzado|zapato|joyeria|joyería|reloj|gafas/, 'fashion'],
  [/hogar|decoracion|decoración|mueble|limpieza|organizacion|organización|jardin|jardín/, 'home'],
  [/cocina|utensilio|electrodomestico|electrodoméstico|freidora|licuadora|olla/, 'kitchen'],
  [/tecnolog|computador|portatil|portátil|celular|audio|electronic|electrónic|camara|cámara|gamer/, 'tech'],
  [/mascota|perro|gato|pet/, 'pets'],
  [/bebe|bebé|maternidad|infantil|niñ|juguete/, 'baby'],
  [/belleza|cabello|piel|maquillaje|cuidado personal|depilacion|depilación|uñas/, 'beauty'],
  [/carro|moto|auto|vehiculo|vehículo|motociclista|camioneta/, 'auto'],
  [/curso|clase|idioma|musica|música|programacion|programación|marketing|diseño|fotografia|fotografía|educacion|educación|pack|plantilla|ebook|libro|megapack/, 'course'],
  [/servicio|asesoria|asesoría|consultoria|consultoría|agencia|instalacion|instalación|mantenimiento/, 'service'],
];

export function detectFamily(category: string, name: string, kind: string): Family {
  if (kind === 'service') return 'service';
  const hay = `${category} ${name}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (kind === 'digital') {
    for (const [re, fam] of FAMILY_RULES) if (fam === 'course' && re.test(hay)) return 'course';
    return 'course';
  }
  for (const [re, fam] of FAMILY_RULES) {
    if (fam === 'course' || fam === 'service') continue;
    if (re.test(hay)) return fam;
  }
  return 'general';
}

/* ------------------------------------------------------------------ */
/* Ganchos de dolor por familia (público frío / consciente del problema) */
/* ------------------------------------------------------------------ */

export const PAIN_HOOKS: Record<Family, string[]> = {
  fitness: [
    '¿Pagas mensualidad del gimnasio y terminas yendo dos veces al mes?',
    '¿Quieres entrenar en casa pero no sabes por dónde empezar?',
    '¿Se te van las ganas de entrenar cuando toca salir de la casa?',
    '¿Tienes 20 minutos al día y ningún equipo para aprovecharlos?',
  ],
  wellness: [
    '¿Terminas el día con la espalda cargada de tanto estar sentado?',
    '¿Pasas horas frente al computador y lo sientes en el cuello?',
    '¿Llegas a la casa sin ganas de nada por la tensión del día?',
    '¿Te cuesta mantener una buena postura después del mediodía?',
  ],
  fashion: [
    '¿Siempre terminas usando el mismo bolso porque los demás no te combinan?',
    '¿Buscas algo que te sirva para la oficina y para salir el fin de semana?',
    '¿Te cansaste de que se te dañe el bolso a los dos meses?',
    '¿Quieres verte bien sin gastar una fortuna?',
  ],
  home: [
    '¿Tu casa se desordena a los dos días de haberla organizado?',
    '¿Te falta espacio y no quieres comprar más muebles?',
    '¿Pierdes tiempo buscando cosas que sabes que están en la casa?',
    '¿Quieres que tu espacio se vea mejor sin hacer obra?',
  ],
  kitchen: [
    '¿Cocinar entre semana se te volvió una tarea eterna?',
    '¿Terminas pidiendo domicilio porque no tienes con qué cocinar rápido?',
    '¿Se te queman las cosas o te quedan a medias?',
    '¿Quieres comer mejor en casa sin pasar horas en la cocina?',
  ],
  tech: [
    '¿Tu equipo se queda pegado cuando abres más de tres pestañas?',
    '¿Te toca pedir prestado para estudiar o trabajar?',
    '¿Estás cansado de que la batería no te dure la jornada?',
    '¿Quieres algo que te sirva de verdad sin pagar de más?',
  ],
  pets: [
    '¿Llevar a tu mascota al veterinario se convirtió en un problema?',
    '¿Tu mascota se estresa cada vez que tienen que salir?',
    '¿Te toca cargarla en brazos todo el camino?',
    '¿Quieres salir con tu mascota sin pelear con la guacal?',
  ],
  baby: [
    '¿Salir con el bebé se volvió una operación de dos horas?',
    '¿Cargas media casa cada vez que salen?',
    '¿Te hace falta una mano extra cuando están fuera?',
    '¿Quieres algo práctico que de verdad use el bebé?',
  ],
  beauty: [
    '¿Gastas en salón lo que podrías hacer en casa?',
    '¿Te toma media hora arreglarte y el resultado no dura?',
    '¿Quieres un resultado parejo sin complicarte?',
    '¿Buscas algo que uses todos los días y no se dañe?',
  ],
  auto: [
    '¿Terminas tus recorridos en moto con dolor de espalda?',
    '¿Tu carro se ve descuidado por dentro y no tienes tiempo de arreglarlo?',
    '¿Te tocó parar en la vía por algo que podías haber evitado?',
    '¿Buscas algo que te saque de un apuro en la carretera?',
  ],
  course: [
    '¿Empiezas tutoriales de YouTube y nunca terminas aprendiendo?',
    '¿Siempre quisiste aprender pero no tienes tiempo de ir a clases?',
    '¿Pagaste un curso y lo dejaste a la mitad por aburrido?',
    '¿Quieres aprender desde el celular y a tu ritmo?',
  ],
  service: [
    '¿Te prometieron resultados y terminaste perdiendo tiempo y plata?',
    '¿Necesitas que alguien se encargue de verdad?',
    '¿Llevas meses posponiendo esto por no saber a quién llamar?',
    '¿Buscas a alguien que te responda y te cumpla?',
  ],
  general: [
    '¿Llevas tiempo buscando esto y no encuentras uno que valga la pena?',
    '¿Te cansaste de comprar barato y que te dure dos semanas?',
    '¿Quieres algo que de verdad te sirva todos los días?',
    '¿Buscas una solución simple y que funcione?',
  ],
};

/* ------------------------------------------------------------------ */
/* Promesas por familia (público que ya conoce el producto)            */
/* ------------------------------------------------------------------ */

export const DESIRE_PROMISES: Record<Family, string[]> = {
  fitness: ['Entrena en casa en 20 minutos', 'Tu rutina completa sin salir de casa', 'El gimnasio que cabe debajo de la cama'],
  wellness: ['Termina el día más cómodo', 'Alivio para las horas de escritorio', 'Comodidad que se siente desde el primer día'],
  fashion: ['El accesorio que combina con todo', 'Estilo que te acompaña todos los días', 'Elegante por fuera, práctico por dentro'],
  home: ['Tu casa ordenada sin esfuerzo', 'Más espacio sin mover un mueble', 'El detalle que cambia el ambiente'],
  kitchen: ['Cocina en la mitad del tiempo', 'Platos listos sin complicarte', 'La cocina más fácil de la casa'],
  tech: ['Rendimiento sin pagar de más', 'Lo que necesitas, sin lo que no usas', 'Listo para estudiar y trabajar'],
  pets: ['Sal con tu mascota sin estrés', 'Viajes cómodos para los dos', 'Tu compañero va seguro a donde vayas'],
  baby: ['Salir con el bebé, más fácil', 'Menos carga, más paseo', 'Lo práctico que sí vas a usar'],
  beauty: ['Resultado de salón en casa', 'Tu rutina en la mitad del tiempo', 'Verte bien todos los días'],
  auto: ['Recorridos más cómodos', 'Listo para la carretera', 'El accesorio que no sabías que necesitabas'],
  course: ['Aprende desde cero a tu ritmo', 'De principiante a avanzado, paso a paso', 'Aprende desde el celular, cuando quieras'],
  service: ['Resultados claros, sin vueltas', 'Nos encargamos de todo', 'Hecho bien y a tiempo'],
  general: ['La solución simple que estabas buscando', 'Hecho para durar', 'Práctico, útil y a buen precio'],
};

/* ------------------------------------------------------------------ */
/* Modificadores por ángulo                                            */
/* ------------------------------------------------------------------ */

export interface AngleCopy {
  label: string;
  eyebrow: string;
  /** Se arma como `${headlinePrefix} ${producto}` o se usa el patrón entero. */
  headlinePattern: (product: string, benefit: string) => string;
  /** Subtítulo para producto físico (contra entrega). */
  subPattern: (product: string, price: string) => string;
  /** Subtítulo para producto digital: nunca menciona envío ni contra entrega. */
  subPatternDigital: (product: string, price: string) => string;
  /** Subtítulo para servicio: agenda por WhatsApp, sin envíos. */
  subPatternService: (product: string, price: string) => string;
  ctaPrimary: string;
  closing: string;
  closingDigital: string;
  closingService: string;
}

export const ANGLES: Record<Angle, AngleCopy> = {
  pain: {
    label: 'Dolor',
    eyebrow: 'La solución',
    headlinePattern: (p, b) => `${b} con ${p}`,
    subPattern: (p, price) => `Pídelo hoy por ${price}. Lo recibes en tu casa y pagas cuando lo tengas en la mano.`,
    subPatternDigital: (p, price) => `Hoy por ${price}. Acceso inmediato después del pago, desde el celular o el computador.`,
    subPatternService: (p, price) => `Desde ${price}. Escríbenos por WhatsApp y te respondemos hoy mismo con la propuesta.`,
    ctaPrimary: 'Quiero el mío – Pago al recibir',
    closing: 'Deja de aguantarte el problema. Pídelo hoy y pruébalo en tu casa.',
    closingDigital: 'Deja de dar vueltas con videos sueltos. Empieza hoy con un camino ordenado.',
    closingService: 'Cuéntanos qué necesitas por WhatsApp y te mandamos la propuesta hoy mismo.',
  },
  desire: {
    label: 'Deseo',
    eyebrow: 'Lo que querías',
    headlinePattern: (p, b) => `${p}: ${b}`,
    subPattern: (p, price) => `Por ${price} te llega a la puerta. Lo revisas y pagas al recibir.`,
    subPatternDigital: (p, price) => `Por ${price} empiezas hoy mismo. Acceso inmediato y de por vida.`,
    subPatternService: (p, price) => `Desde ${price}. Agenda por WhatsApp y arrancamos esta semana.`,
    ctaPrimary: 'Lo quiero – Pago al recibir',
    closing: 'Ya sabes que lo quieres. Pídelo hoy y lo tienes esta semana.',
    closingDigital: 'Ya sabes que lo quieres. Empieza hoy y avanza a tu ritmo.',
    closingService: 'Ya sabes lo que necesitas. Agenda por WhatsApp y lo dejamos andando.',
  },
  saving: {
    label: 'Ahorro',
    eyebrow: 'Precio de hoy',
    headlinePattern: (p, b) => `${p} — ${b} por mucho menos`,
    subPattern: (p, price) => `Hoy por ${price}, con envío gratis a toda Colombia y pago contra entrega.`,
    subPatternDigital: (p, price) => `Hoy por ${price}, pago único. Sin mensualidades ni renovaciones.`,
    subPatternService: (p, price) => `Desde ${price}, con alcance y tiempos por escrito antes de empezar.`,
    ctaPrimary: 'Aprovechar el precio de hoy',
    closing: 'El precio es por tiempo limitado. Asegura el tuyo antes de que suba.',
    closingDigital: 'El precio de lanzamiento es por tiempo limitado. Asegura tu acceso hoy.',
    closingService: 'El cupo de este mes es limitado. Agenda por WhatsApp y reservamos el tuyo.',
  },
  gift: {
    label: 'Regalo',
    eyebrow: 'El regalo perfecto',
    headlinePattern: (p, b) => `Regala ${p}: ${b}`,
    subPattern: (p, price) => `Por ${price} llega listo para regalar. Pagas cuando lo recibes.`,
    subPatternDigital: (p, price) => `Por ${price} lo regalas hoy: el acceso le llega al correo y al WhatsApp.`,
    subPatternService: (p, price) => `Desde ${price}. Lo coordinamos por WhatsApp con quien va a recibirlo.`,
    ctaPrimary: 'Pedirlo como regalo',
    closing: 'Un regalo que sí se usa. Pídelo hoy y llega a tiempo.',
    closingDigital: 'Un regalo que sí se usa. El acceso llega en minutos.',
    closingService: 'Un regalo distinto y útil. Escríbenos y lo organizamos contigo.',
  },
  status: {
    label: 'Estatus',
    eyebrow: 'Nivel premium',
    headlinePattern: (p, b) => `${p}. ${b}, sin bajar el nivel`,
    subPattern: (p, price) => `Hoy por ${price}. Te llega a casa y pagas al recibirlo.`,
    subPatternDigital: (p, price) => `Hoy por ${price}. Empiezas de una, sin esperar nada.`,
    subPatternService: (p, price) => `Desde ${price}. Trabajo a la medida, con acompañamiento directo.`,
    ctaPrimary: 'Quiero el mío',
    closing: 'Los detalles se notan. Llévate el tuyo hoy.',
    closingDigital: 'Los detalles se notan. Empieza hoy y hazlo bien desde el principio.',
    closingService: 'Los detalles se notan. Hablemos hoy por WhatsApp.',
  },
};

export const AWARENESS_LABEL: Record<Awareness, string> = {
  cold: 'Frío (no conoce la solución)',
  problem: 'Conoce el problema',
  product: 'Conoce el producto',
};

export const AWARENESS_HINT: Record<Awareness, string> = {
  cold: 'Empieza por la historia y el problema. Ideal para Advertorial.',
  problem: 'Sabe qué le duele, no sabe que existe esto. Entra por el gancho de dolor.',
  product: 'Ya vio el anuncio y el producto. Entra directo con precio y oferta.',
};

/** Sellos fijos del remate que repiten los anuncios que llevan meses activos. */
export const TRUST_SEALS = [
  { icon: 'truck', text: 'Envío gratis a toda Colombia' },
  { icon: 'banknote', text: 'Pago contra entrega' },
  { icon: 'shield', text: 'Garantía de satisfacción' },
  { icon: 'message-circle', text: 'Soporte por WhatsApp' },
];

export const TRUST_SEALS_DIGITAL = [
  { icon: 'zap', text: 'Acceso inmediato' },
  { icon: 'infinity', text: 'Acceso de por vida' },
  { icon: 'smartphone', text: 'Desde el celular o el computador' },
  { icon: 'message-circle', text: 'Soporte por WhatsApp' },
];

export const CLOSER_LINE = '🚚 Envío gratis a toda Colombia · 💵 Pago contra entrega';
export const CLOSER_LINE_PLAIN = 'Envío gratis a toda Colombia · Pago contra entrega';

/* ------------------------------------------------------------------ */
/* Lenguaje prohibido (política de Meta + honestidad)                  */
/* ------------------------------------------------------------------ */

/**
 * Frases que nunca se generan. Para salud y bienestar el copy habla de
 * comodidad y uso, nunca de curación.
 */
export const BANNED_PATTERNS: RegExp[] = [
  /clínicamente (probado|comprobado)/i,
  /cl[ií]nicamente/i,
  /\bcura\b/i,
  /\bcurar\b/i,
  /\bcuran\b/i,
  /\bsana\b/i,
  /elimina (el|la|los|las) (dolor|enfermedad|artritis|diabetes)/i,
  /tratamiento m[eé]dico/i,
  /aprobado por la fda/i,
  /resultados garantizados en \d+ d[ií]as/i,
  /quedan \d+ unidades/i,
  /[uú]ltimas \d+ unidades/i,
  /milagro/i,
  /100 ?% efectivo/i,
];

/** Reemplazos seguros cuando el texto del proveedor trae promesas médicas. */
const SAFE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/cl[ií]nicamente (probado|comprobado)/gi, 'diseñado para el uso diario'],
  [/\bcura\b/gi, 'acompaña'],
  [/\bcurar\b/gi, 'acompañar'],
  [/\bsana\b/gi, 'cuida'],
  [/elimina el dolor/gi, 'ayuda a que estés más cómodo'],
  [/elimina la enfermedad/gi, 'acompaña tu rutina'],
  [/tratamiento m[eé]dico/gi, 'uso diario'],
  [/aprobado por la fda/gi, 'de uso general'],
  [/milagro(so|sa)?/gi, 'muy práctico'],
  [/100 ?% efectivo/gi, 'pensado para el día a día'],
  [/quedan \d+ unidades/gi, 'disponible hoy'],
  [/[uú]ltimas \d+ unidades/gi, 'disponible hoy'],
];

/** Limpia promesas no comprobables de cualquier texto antes de mostrarlo. */
export function sanitizeClaims(text: string): string {
  let out = text || '';
  for (const [re, rep] of SAFE_REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

export function hasBannedClaim(text: string): boolean {
  return BANNED_PATTERNS.some((re) => re.test(text || ''));
}
