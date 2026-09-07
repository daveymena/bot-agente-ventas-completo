/**
 * ============================================================
 * QUÉ SE SABE DE CADA PRODUCTO, Y QUÉ NO
 * ============================================================
 */

export interface PreguntaConocida {
  id: string;
  patrones: RegExp;
  respuesta: string | null;
}

export interface ConocimientoProducto {
  productId: number;
  nombre: string;
  preguntas: PreguntaConocida[];
}

const COMUNES: PreguntaConocida[] = [
  {
    id: "certificado",
    patrones: /\b(certificad\w+|diploma|titul\w+|constancia|acredita\w*)\b/i,
    respuesta: "No emite certificado 🙏 Es formación práctica: te llevas el contenido.",
  },
  {
    id: "garantia",
    patrones: /\b(garant[ií]a|devoluci[oó]n|reembolso|me devuelven|si no me gusta|si no sirve)\b/i,
    respuesta: "Tienes 7 días de garantía ✅ Si no te convence, te devolvemos el 100%.",
  },
  {
    id: "acceso_tiempo",
    patrones: /\b(cu[aá]nto tiempo|por cu[aá]nto|caduca|vence|expira|de por vida|para siempre|se me va)\b/i,
    respuesta: "El acceso te queda de por vida ♾️ Pagas una sola vez.",
  },
  {
    id: "como_llega",
    patrones: /\b(c[oó]mo (me )?(llega|lo recibo|lo veo)|d[oó]nde (lo veo|queda)|drive|descarg\w+)\b/i,
    respuesta: "Te llega por un enlace de acceso 📁 Apenas confirmamos el pago te lo paso por aquí.",
  },
  {
    id: "envio_digital",
    // ⚠️ "envío" es sustantivo Y es verbo, y aca solo interesa el sustantivo.
    //
    // Medido en una conversacion real (2026-09-06):
    //
    //   cliente: "Ya te envio el comprobante"
    //   bot:     "No hacemos envio fisico 😊 ... no importa si estas en Cali"
    //
    // El cliente estaba por pagar y recibio una explicacion de logistica que
    // nadie pidio. Es el mismo agujero que ya documentado con `llama`, que se
    // comia "se llama" y "una llamada": una palabra que en espanol hace dos
    // trabajos distintos.
    //
    // Se descarta el uso VERBAL por dos senales, no por una lista de frases:
    //   · un pronombre delante  -> "te envio", "le envio", "se lo envio"
    //   · un objeto de pago detras -> "envio el comprobante", "envio la captura"
    //
    // El sustantivo sigue entrando entero: "hacen envios?", "cuanto vale el
    // envio", "envian a Cali".
    patrones:
      /(?<!\b(?:te|le|les|me|se|lo|la)\s)\b(env[ií]os?|envi[oó]s|despacho|transportadora|mensajero|paquete|domicilio)\b(?!\s+(?:el\s+|la\s+|los\s+|las\s+|un\s+|mi\s+)?(?:comprobante|soporte|captura|pantallazo|screenshot|pago|foto|imagen|recibo))|\b(envi\w*)\s+(a|hasta)\s+[a-záéíóúñ]+/i,
    respuesta: "No hacemos envío físico 😊 Es un producto digital: recibes el acceso por aquí, así que no importa si estás en Cali o en otra ciudad.",
  },
  {
    id: "stock_digital",
    patrones: /\b(stock|existencias?|disponible|disponibilidad)\b/i,
    respuesta: "Sí, está disponible ✅ Como es un producto digital, no manejamos stock físico. El acceso se entrega de forma digital.",
  },
  {
    id: "pago_digital",
    patrones: /\b(contraentrega|contra entrega|efectivo (al|cuando)|pago en efectivo|pago cuando (llega|recib)|transferencia|transferir|nequi|daviplata)\b/i,
    respuesta: "Es un producto 100% digital 📩 No manejamos pago contraentrega ni efectivo al recibir. Puedes pagar por Nequi o Daviplata y enviar el comprobante por aquí; después se verifica y se entrega el acceso.",
  },
  {
    id: "dispositivos",
    patrones: /\b(celular|m[oó]vil|computador|pc|tablet|desde el tel[eé]fono|android|iphone)\b/i,
    respuesta: "Desde celular, tablet o computador 📱 Solo necesitas internet.",
  },
  {
    id: "es_presencial",
    patrones: /\b(presencial|sede|direcci[oó]n|academia|d[oó]nde (est[aá]n|queda)|clases en vivo|profesor en vivo)\b/i,
    respuesta: "Es 100% online 💻 Videos grabados que ves a tu ritmo, sin sede ni horarios.",
  },
  {
    id: "soporte",
    patrones: /\b(soporte|ayuda|dudas|si tengo problemas|acompa[ñn]amiento|tutor)\b/i,
    respuesta: "Tienes soporte incluido 🙌 Cualquier duda me escribes por aquí.",
  },
  {
    id: "horario_atencion",
    patrones: /\b(a qu[eé] hora|horario|hasta qu[eé] hora|atienden)\b/i,
    respuesta: "De 9:00 a 6:00 de la tarde, hora de Colombia 🕘",
  },
];

const PIANO: ConocimientoProducto = {
  productId: 123,
  nombre: "Curso de Piano Completo",
  preguntas: [
    {
      id: "piano_nivel",
      patrones: /\b(soy principiante|desde cero|no s[eé] nada|nunca he tocado|sin experiencia|para principiantes|avanzado)\b/i,
      respuesta: "Va desde cero hasta avanzado 🎹 No necesitas saber nada previo.",
    },
    {
      id: "piano_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|qu[eé] caracter[ií]sticas? tiene|caracter[ií]sticas?|contenido|temario|m[oó]dulos)\b/i,
      respuesta: "Esto es lo que incluye 🎹\n\n✅ Clases en video HD\n✅ De cero a avanzado\n✅ Partituras y ejercicios\n✅ Acceso de por vida\n✅ Online y descargable\n✅ Soporte incluido",
    },
    {
      id: "piano_partituras",
      patrones: /\b(partitura|leer m[uú]sica|solfeo|notas)\b/i,
      respuesta: "Sí, trae partituras y ejercicios 🎼 Y te enseña a leerlas desde cero.",
    },
    {
      id: "piano_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntas clases|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos)\b/i,
      respuesta: "19 módulos y 283 clases en video 🎹 Unas 19 horas, a tu ritmo.",
    },
    {
      id: "piano_requiere_teclado",
      patrones: /\b(necesito (un )?(piano|teclado)|hay que tener|se necesita instrumento|cu[aá]ntas teclas|sin piano)\b/i,
      respuesta: "Sí, necesitas piano o teclado 🎹 Para empezar te sirve cualquiera.",
    },
    {
      id: "piano_edad",
      patrones: /\b(para ni[ñn]os|edad|mi hijo|mi hija|para adultos|soy mayor|muy viejo|muy grande)\b/i,
      respuesta: "Sirve para todas las edades 😊 Arranca desde cero, cada quien a su ritmo.",
    },
    {
      id: "piano_estilos",
      patrones: /\b(cl[aá]sic\w+|jazz|blues|pop|balada|reggaeton|qu[eé] estilos|improvisa\w*)\b/i,
      respuesta: "Toca varios estilos 🎵\n\n✅ Clásico y música clásica moderna\n✅ Pop y baladas\n✅ Blues y jazz\n✅ Improvisación con escalas y progresiones\n✅ 5 valses de Alberto Martínez",
    },
  ],
};

const EDUCANINO: ConocimientoProducto = {
  productId: 76,
  nombre: "EDUCANINO – Curso Completo de Adiestramiento Canino",
  preguntas: [
    {
      id: "perro_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|qu[eé] caracter[ií]sticas? tiene|caracter[ií]sticas?|contenido|temario|m[oó]dulos)\b/i,
      respuesta: "Esto es lo que incluye 🐶\n\n✅ Curso estructurado por módulos\n✅ Obediencia básica y avanzada\n✅ Control de conductas problemáticas\n✅ Agresividad y posesividad\n✅ Ansiedad por separación\n✅ Reactividad\n✅ Entrenamiento paso a paso, en video",
    },
    {
      id: "perro_problemas",
      patrones: /\b(muerde|agresiv\w+|ladra|ansiedad|destruye|se orina|jala|hala|no obedece|reactiv\w+|posesiv\w+)\b/i,
      respuesta: "El curso trata justamente eso 🐕 Tiene módulos para agresividad y posesividad, ansiedad por separación, reactividad y control de conductas problemáticas. ¿Qué está haciendo tu perro?",
    },
    {
      id: "perro_experiencia",
      patrones: /\b(sin experiencia|nunca he entrenado|no s[eé] nada|primera vez|es dif[ií]cil)\b/i,
      respuesta: "No necesitas experiencia 🐾 Es paso a paso, desde casa.",
    },
    {
      id: "perro_edad",
      patrones: /\bcachorr\w*|\bqu[eé] edad\b|\bmeses\b|\ba[ñn]os\b|\bes viejo\b|\bya est[aá] grande\b|\badult\w*/i,
      respuesta: "Sirve a cualquier edad 🐶 Desde cachorro hasta adulto mayor.",
    },
    {
      id: "perro_raza",
      patrones: /\b(raza|pitbull|labrador|criollo|mestizo|sirve para mi perro|chihuahua|pastor|french|poodle)\b/i,
      respuesta: "Funciona con cualquier raza 🐕 Criollos incluidos.",
    },
    {
      id: "perro_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos|en cu[aá]nto tiempo)\b/i,
      respuesta: "Lecciones cortas en video 🎬 La mayoría lo termina en 1 a 3 meses, y el acceso es de por vida.",
    },
    {
      id: "perro_practico",
      patrones: /\b(es pr[aá]ctico|solo teor[ií]a|c[oó]mo se hace|ejercicios|demostraci\w+)\b/i,
      respuesta: "Es puro práctico 🐾 Demostraciones en video para repetir con tu perro.",
    },
  ],
};

const IA: ConocimientoProducto = {
  productId: 124,
  nombre: "INTELIGENCIA ARTIFICIAL 2026: HERRAMIENTAS + AGENTES AUTÓNOMOS",
  preguntas: [
    {
      id: "ia_actualizado",
      patrones: /\b(actualizad\w*|desactualizad\w*|est[aá] al d[ií]a|(es|est[aá]|estar[aá]) (muy )?(viej\w+|antigu\w+)|contenido (viej\w+|antigu\w+)|versi[oó]n vieja|es del? 2026|de este a[ñn]o|sirve (para|en) 2026|para el 2026)/i,
      respuesta: "Cubre lo que se está usando ahora 📅 Claude Cowork, Claude Code, n8n, OpenClaw y Gemini.",
    },
    {
      id: "ia_incluye",
      patrones: /\b(qu[eé] (incluye|trae|contiene)|qu[eé] caracter[ií]sticas? tiene|caracter[ií]sticas?|contenido|temario|m[oó]dulos)\b/i,
      respuesta: "Son 3 cursos, 52 módulos en video 🤖\n\n⚙️ Agentes y automatización: n8n, OpenClaw y Claude Code\n🎨 Claude AI completo: Design, Excel, Chrome y conectores\n🔮 Curso de Gemini de Google\n🔗 Conecta WhatsApp, Telegram, Slack y Google\n🚀 Hasta montar tus agentes en un servidor",
    },
    {
      id: "ia_costo_herramientas",
      patrones: /\b(chatgpt plus|pagar (aparte|las herramientas|algo m[aá]s|otra cosa)|pagarlas aparte|se pagan? aparte|toca pagar aparte|versi[oó]n (paga|premium|de pago)|cuenta (paga|premium))|(suscripci[oó]n|mensualidad|licencia\w*|gratis|gratuit\w*|de pago|hay que pagar|cuestan|tienen costo|se pagan?)[^?!.]{0,30}(herramienta|chatgpt|midjourney|gemini|copilot|leonardo|dall|n8n|autogpt|crewai|perplexity)|(herramienta|chatgpt|midjourney|gemini|copilot|leonardo|dall|n8n|autogpt|crewai|perplexity)\w*[^?!.]{0,30}(gratis|gratuit\w*|de pago|cuestan|hay que pagar|tienen costo|se pagan?|suscripci[oó]n|mensualidad|licencia)/i,
      respuesta: "Las suscripciones de las herramientas van por tu cuenta 🙏 El curso te enseña a usarlas; el precio es solo por la formación.",
    },
    {
      id: "ia_herramientas",
      patrones: /\b(claude|cowork|claude code|n8n|openclaw|mcp|supabase|render|rag|gemini|excel|qu[eé] herramientas)\b/i,
      respuesta: "Claude a fondo 🤖 Desktop, Cowork, Code y Design; n8n para automatizar sin código; OpenClaw para tus agentes; y Gemini de Google.",
    },
    {
      id: "ia_no_incluye",
      patrones: /\b(midjourney|dall|leonardo|crewai|langgraph|autogpt|perplexity|copilot|stable diffusion|runway|sora)\b/i,
      respuesta: "Esa herramienta no la cubre 🙏 Trabaja con Claude, n8n, OpenClaw y Gemini.",
    },
    {
      id: "ia_agentes",
      patrones: /\bagentes\b|agentes? aut[oó]nom\w*|trabajen? por m[ií]\b|trabajan solos|piensan solos|multi.?tarea/i,
      respuesta: "Sí, es el corazón del curso 🤖 Con el nodo Agente IA de n8n y con OpenClaw.",
    },
    {
      id: "ia_creativa",
      patrones: /\b(crea\w*|hace\w*|haga\w*|gener\w*|dise[ñn]\w*|edita\w*)[^?!.]{0,15}(im[aá]gen|video|logo|contenido|foto|arte)|\b(dise[ñn]o gr[aá]fico|contenido visual|miniaturas?|ia creativa|edici[oó]n de video)/i,
      respuesta: "Sí 🎨 Con Claude Design para diseño gráfico y con Gemini de Google.",
    },
    {
      id: "ia_prompts",
      patrones: /\bprompt\w*|ingenier[ií]a de prompt|\bc[oó]mo (le )?(pregunto|hablo|escribo|pido) a (la ia|chatgpt)/i,
      respuesta: null,
    },
    {
      id: "ia_negocio",
      patrones: /\b(para mi negocio|automatizar|chatbot|whatsapp|vender|monetizar|ganar dinero|emprend\w+)\b/i,
      respuesta: "Sí 💼 Tiene módulos para conectar n8n con WhatsApp, Telegram, Slack y Google, y armar los flujos de tu negocio.",
    },
    {
      id: "ia_plantillas",
      patrones: /\b(plantillas?|templates?|bonus)/i,
      respuesta: null,
    },
    {
      id: "ia_programar",
      patrones: /\bprogram\w+\b|\bc[oó]digo\b|\bsoy t[eé]cnico\b|\bsin experiencia\b|\bno s[eé] de (tecnolog[ií]a|computador)/i,
      respuesta: "La automatización con n8n es sin código 🙌 No necesitas programar para armar los agentes.",
    },
    {
      id: "ia_nivel",
      patrones: /\b(desde cero|principiante|novat\w*|soy nuevo|no s[eé] nada|nunca he (usado|trabajado|manejado)|es dif[ií]cil|es complicado|ser[aá] muy dif[ií]cil)/i,
      respuesta: "Arranca desde la introducción 🤖 El módulo 1 presenta Claude, Claude Code y Cowork.",
    },
    {
      id: "ia_idioma",
      patrones: /\b(idioma|en espa[ñn]ol|en ingl[eé]s|est[aá] en espa[ñn]ol|subt[ií]tul\w*|traducid\w*|doblad\w*)/i,
      respuesta: null,
    },
    {
      id: "ia_perfil",
      patrones: /\b(para qui[eé]n es|a qui[eé]n le sirve|qu[eé] perfil|sirve para cualquier persona|soy (estudiante|ama de casa|contador\w*|profesor\w*|independiente|pensionad\w*|desemplead\w*))/i,
      respuesta: null,
    },
    {
      id: "ia_empleo",
      patrones: /\b(consigo|conseguir|encontrar|para) (trabajo|empleo|clientes)|freelance|ofrecer servicios|me contraten|bolsa de empleo|salir a vender esto|puedo cobrar/i,
      respuesta: null,
    },
    {
      id: "ia_resultados",
      patrones: /\b(en cu[aá]nto tiempo (veo|logro|aprendo|empiezo)|cu[aá]ndo (veo|voy a ver) resultados|qu[eé] tan r[aá]pido|cu[aá]nto me demoro|resultados garantiz\w*|funciona de verdad)/i,
      respuesta: null,
    },
    {
      id: "ia_duracion",
      patrones: /\b(cu[aá]nto dura|cu[aá]ntas horas|cu[aá]ntas clases|cu[aá]ntos videos|cu[aá]ntos m[oó]dulos)\b/i,
      respuesta: "Son 3 cursos, 52 módulos en video 🎬 A tu ritmo, sin horarios.",
    },
  ],
};

const CATALOGO: ConocimientoProducto[] = [PIANO, EDUCANINO, IA];

export interface Respuesta {
  id: string;
  texto: string;
  sinResponder: boolean;
}

/**
 * Todas las preguntas conocidas que trae el mensaje, no solo la primera.
 *
 * Un cliente rara vez pregunta una cosa sola: "¿Qué características tiene?
 * ¿Trae garantía?" son dos, y devolver una sola dejaba la otra sin contestar.
 * Medido con ese mensaje real (2026-09-05): el bot respondió la garantía y de
 * las características dijo "déjame confirmártelo y te digo" -- un dato que sí
 * tenía cargado. El cliente nunca lo recibió.
 *
 * Las que tienen respuesta van primero: si el mensaje mezcla algo conocido con
 * algo que no, conviene entregar el dato antes que la disculpa.
 */
export function responderPreguntas(
  productId: number | null,
  mensaje: string,
  maximo = 2,
  /** Lo que el dueño cargó desde Atlas (`conocimiento-cargado.ts`). */
  cargadas: PreguntaConocida[] = [],
): Respuesta[] {
  const texto = String(mensaje || "");
  if (!texto.trim()) return [];

  const delProducto = productId ? CATALOGO.find((c) => c.productId === productId) : null;
  // El orden importa y no se toca: lo específico del producto le gana a lo
  // común. "¿en cuánto tiempo veo resultados?" cae en `acceso_tiempo` ("el
  // acceso es de por vida") si se mira primero la lista común, y eso NO es lo
  // que preguntó el cliente.
  //
  // Y lo que el DUEÑO cargó desde Atlas va antes que todo: él conoce su
  // producto mejor que una tabla escrita a mano hace meses. Las de fábrica
  // quedan de respaldo para el negocio que todavía no configuró nada.
  const candidatas = [...cargadas, ...(delProducto?.preguntas ?? []), ...COMUNES];

  const resolver = (fragmento: string): Respuesta | null => {
    for (const p of candidatas) {
      if (!p.patrones.test(fragmento)) continue;
      return p.respuesta === null
        ? { id: p.id, sinResponder: true, texto: "Déjame confirmarte ese dato exacto y te respondo enseguida 🙏" }
        : { id: p.id, texto: p.respuesta, sinResponder: false };
    }
    return null;
  };

  // Se resuelve UNA respuesta por PREGUNTA, no una por patrón que enganche.
  // La diferencia es la que rompía el caso de arriba: "¿en cuánto tiempo veo
  // resultados?" es una sola pregunta aunque active dos patrones, mientras que
  // "¿Qué características tiene? ¿Trae garantía?" son dos y merecen dos.
  const preguntas = texto
    .split(/(?<=[?？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
  const fragmentos = preguntas.length > 1 ? preguntas : [texto];

  const vistas = new Set<string>();
  const out: Respuesta[] = [];
  for (const f of fragmentos) {
    if (out.length >= Math.max(1, maximo)) break;
    const r = resolver(f);
    if (r && !vistas.has(r.id)) {
      vistas.add(r.id);
      out.push(r);
    }
  }
  return out;
}

export function responderPregunta(
  productId: number | null,
  mensaje: string,
  cargadas: PreguntaConocida[] = [],
): Respuesta | null {
  return responderPreguntas(productId, mensaje, 1, cargadas)[0] ?? null;
}

export function preguntasSinResponder(): Array<{ producto: string; pregunta: string }> {
  const faltan: Array<{ producto: string; pregunta: string }> = [];
  for (const c of [...CATALOGO, { productId: 0, nombre: "Todos los cursos", preguntas: COMUNES }]) {
    for (const p of c.preguntas) {
      if (p.respuesta === null) faltan.push({ producto: c.nombre, pregunta: p.id });
    }
  }
  return faltan;
}

export function tieneConocimiento(productId: number | null): boolean {
  return !!productId && CATALOGO.some((c) => c.productId === productId);
}

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
